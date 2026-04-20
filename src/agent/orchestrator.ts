import { getContext } from "../retriever/index.js";
import { detectQueryType, getModel } from "../llm/modelRouter.js";
import { buildSystemPrompt, buildGeneralSystemPrompt, buildUserPrompt } from "../llm/promptBuilder.js";
import { streamResponse } from "../llm/ollamaClient.js";
import { parseUpdates } from "./updateParser.js";
import { applyAllUpdates } from "./patcher.js";
import { printSources, printSeparator, printError } from "../cli/display.js";
import { readFile } from "fs/promises";
import type { CodeUpdate } from "../types.js";

// ─── Heuristics (fast, deterministic fallbacks) ───────────────────────────────

function parseSimpleReplace(query: string): { from: string; to: string } | null {
  const m = query.match(
    /\bchange\b[\s\S]*?\bfrom\b\s+["']?([^\s"'\n]+)["']?\s+\bto\b\s+["']?([^\s"'\n]+)["']?/i
  );
  if (!m) return null;
  const from = m[1]?.trim(), to = m[2]?.trim();
  if (!from || !to || from === to) return null;
  return { from, to };
}

async function tryHeuristicUpdate(query: string, sources: string[]): Promise<CodeUpdate[]> {
  const instruction = parseSimpleReplace(query);
  if (!instruction || sources.length !== 1) return [];
  const targetPath = sources[0]!;
  let original = "";
  try { original = await readFile(targetPath, "utf-8"); } catch { return []; }
  if (!original.includes(instruction.from)) return [];
  const newContent = original.split(instruction.from).join(instruction.to);
  if (newContent === original) return [];
  return [{ filePath: targetPath, newContent, description: `Replace "${instruction.from}" → "${instruction.to}"` }];
}

async function tryHeuristicRemoveComments(query: string, sources: string[]): Promise<CodeUpdate[]> {
  if (!/(remove|delete|strip).*(comment|commented)/.test(query.toLowerCase())) return [];
  if (sources.length !== 1) return [];
  const targetPath = sources[0]!;
  let original = "";
  try { original = await readFile(targetPath, "utf-8"); } catch { return []; }
  const cleaned = original
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd() + "\n";
  if (cleaned === original) return [];
  return [{ filePath: targetPath, newContent: cleaned, description: "Remove all comments" }];
}

// ─── Main Orchestrator ────────────────────────────────────────────────────────

export async function runQuery(userQuery: string): Promise<void> {

  // 1. VECTOR RETRIEVAL — find relevant files from the codebase
  process.stdout.write("\x1b[2mSearching codebase for relevant context...\x1b[0m\n");
  let context: string;
  try {
    context = await getContext(userQuery);
  } catch (err) {
    printError(err instanceof Error ? err.message : String(err));
    return;
  }

  // Extract sources from JSON context
  let sources: string[] = [];
  try {
    const parsed = JSON.parse(context) as { files?: Array<{ path: string }> };
    sources = [...new Set((parsed.files ?? []).map((f) => f.path))];
  } catch { /* context parse failed, sources stays empty */ }
  if (sources.length > 0) printSources(sources);
  printSeparator();

  // 2. LLM — stream response using user query + retrieved file context
  process.stdout.write("\n\x1b[1mOptimus:\x1b[0m ");
  const type = detectQueryType(userQuery);
  const model = getModel(type);
  const systemPrompt = type === "general" ? buildGeneralSystemPrompt() : buildSystemPrompt(context);
  let fullResponse = "";
  try {
    for await (const token of streamResponse(systemPrompt, buildUserPrompt(userQuery), model)) {
      process.stdout.write(token);
      fullResponse += token;
    }
  } catch (err) {
    printError(err instanceof Error ? err.message : String(err));
    return;
  }
  console.log("\n");
  printSeparator();

  // General queries end here — no file updates
  if (type === "general") return;

  // 3. DETECT INTENT — heuristics first, then LLM-parsed structured updates
  // Note: must use explicit .length checks — empty arrays are truthy in JS
  let updates = await tryHeuristicRemoveComments(userQuery, sources);
  if (updates.length === 0) updates = await tryHeuristicUpdate(userQuery, sources);
  if (updates.length === 0) updates = parseUpdates(fullResponse, userQuery, sources);

  // 4. FILE UPDATE PATH — apply updates directly
  if (updates.length > 0) {
    await applyAllUpdates(updates);
    console.log("\n\x1b[32m✓ Changes applied successfully.\x1b[0m");
  }
}