import { getContext } from "../retriever/index.js";
import { queryLLM } from "../llm/index.js";
import { parseUpdates } from "./updateParser.js";
import { applyAllUpdates } from "./patcher.js";
import { printSources, printSeparator, printError } from "../cli/display.js";
import { readFile } from "fs/promises";
import type { CodeUpdate } from "../types.js";

function parseSimpleReplace(query: string): { from: string; to: string } | null {
  const m = query.match(/\bchange\b[\s\S]*?\bfrom\b\s+["']?([^\s"'\n]+)["']?\s+\bto\b\s+["']?([^\s"'\n]+)["']?/i);
  if (!m) return null;

  const from = m[1]?.trim();
  const to = m[2]?.trim();
  if (!from || !to || from === to) return null;
  return { from, to };
}

async function tryHeuristicUpdate(userQuery: string, sources: string[]): Promise<CodeUpdate[]> {
  const instruction = parseSimpleReplace(userQuery);
  if (!instruction) return [];
  if (sources.length !== 1) return [];

  const targetPath = sources[0]!;
  let original = "";
  try {
    original = await readFile(targetPath, "utf-8");
  } catch {
    return [];
  }

  if (!original.includes(instruction.from)) return [];
  const newContent = original.split(instruction.from).join(instruction.to);
  if (newContent === original) return [];

  return [
    {
      filePath: targetPath,
      newContent,
      description: `Heuristic update: ${instruction.from} -> ${instruction.to}`,
    },
  ];
}

async function tryHeuristicRemoveComments(userQuery: string, sources: string[]): Promise<CodeUpdate[]> {
  const q = userQuery.toLowerCase();
  if (!/(remove|delete|strip).*(comment|commented)/.test(q)) return [];
  if (sources.length !== 1) return [];

  const targetPath = sources[0]!;
  let original = "";
  try {
    original = await readFile(targetPath, "utf-8");
  } catch {
    return [];
  }

  const withoutBlock = original.replace(/\/\*[\s\S]*?\*\//g, "");
  const withoutLine = withoutBlock.replace(/^[ \t]*\/\/.*$/gm, "");
  const cleaned = withoutLine.replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
  if (cleaned === original) return [];

  return [
    {
      filePath: targetPath,
      newContent: cleaned,
      description: "Heuristic update: remove comments",
    },
  ];
}

export async function runQuery(userQuery: string): Promise<void> {
  // 1. Retrieve context
  process.stdout.write("\x1b[2mSearching codebase for relevant context...\x1b[0m\n");
  let context: string;
  try {
    context = await getContext(userQuery);
  } catch (err) {
    printError(err instanceof Error ? err.message : String(err));
    return;
  }

  // 2. Show which files were pulled as context
  const sources = [...context.matchAll(/path="([^"]+)"/g)].map((m) => m[1]!);
  if (sources.length > 0) printSources([...new Set(sources)]);

  // 3. Stream LLM response
  printSeparator();
  process.stdout.write("\n\x1b[1mOptimus:\x1b[0m ");

  let fullResponse = "";
  try {
    for await (const token of queryLLM(userQuery, context)) {
      process.stdout.write(token);
      fullResponse += token;
    }
  } catch (err) {
    printError(err instanceof Error ? err.message : String(err));
    return;
  }

  console.log("\n");
  printSeparator();

  // Debug: log raw response for troubleshooting marker detection
  if (process.env["DEBUG_PARSER"] === "true") {
    console.log("\n\x1b[2m[DEBUG] Raw LLM response:\x1b[0m\n", fullResponse.slice(0, 500));
  }

  // 4. Parse and apply any code updates
  const uniqueSources = [...new Set(sources)];
  const updates = parseUpdates(fullResponse, userQuery, uniqueSources);
  console.log(`\n\x1b[36mUpdates found: ${updates.length}\x1b[0m`);

  const commentRemovalUpdates = await tryHeuristicRemoveComments(userQuery, uniqueSources);
  if (commentRemovalUpdates.length > 0) {
    console.log("\n\x1b[33m⚡ Applying deterministic comment removal.\x1b[0m");
    await applyAllUpdates(commentRemovalUpdates);
    return;
  }

  // For simple "change from X to Y" edits, prefer deterministic local replacement.
  // This avoids corrupted/partial LLM updates for straightforward value swaps.
  const deterministicUpdates = await tryHeuristicUpdate(userQuery, uniqueSources);
  if (deterministicUpdates.length > 0) {
    console.log("\n\x1b[33m⚡ Applying deterministic replace for simple value-change request.\x1b[0m");
    await applyAllUpdates(deterministicUpdates);
    return;
  }

  if (updates.length > 0) {
    console.log(`\n\x1b[33m⚡ ${updates.length} code update(s) detected.\x1b[0m`);
    await applyAllUpdates(updates);
    return;
  }

  const heuristicUpdates = await tryHeuristicUpdate(userQuery, uniqueSources);
  if (heuristicUpdates.length > 0) {
    console.log("\n\x1b[33m⚡ No structured update found. Applying safe heuristic replace.\x1b[0m");
    await applyAllUpdates(heuristicUpdates);
  }
}
