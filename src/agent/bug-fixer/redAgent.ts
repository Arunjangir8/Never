import { generateResponse } from "../../llm/ollamaClient.js";
import { getModel } from "../../llm/modelRouter.js";
import type { FileChunk, Issue, RedFinding } from "../../types.js";
import { buildRedSystemPrompt, buildRedUserPrompt } from "../../llm/promptBuilder.js";
import { tryParseJson } from "../updateParser.js";

// Keep only entries with the fields we render.
function toIssues(raw: unknown): Issue[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((i): i is Record<string, unknown> => !!i && typeof i === "object")
    .map((i) => ({
      title: String(i["title"] ?? "").trim(),
      explanation: String(i["explanation"] ?? "").trim(),
      affected: String(i["affected"] ?? "").trim(),
    }))
    .filter((i) => i.title.length > 0);
}

function parseRedFinding(raw: string, chunk: FileChunk): RedFinding | null {
  const parsed = tryParseJson(raw);

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    console.error(
      `\x1b[33m⚠ Red Agent output not parseable for chunk ${chunk.chunkIndex} of ${chunk.filePath}, skipping.\x1b[0m`
    );
    return null;
  }

  const obj = parsed as Record<string, unknown>;

  // Missing category means nothing found, not a failure. Small models skip
  // empty arrays even when the prompt asks for them.
  return {
    chunk_id: `${chunk.filePath}::${chunk.chunkIndex}`,
    file: chunk.filePath,
    bugs: toIssues(obj["bugs"]),
    edge_cases: toIssues(obj["edge_cases"]),
    risks: toIssues(obj["risks"]),
  };
}

export async function runRedAgent(chunk: FileChunk): Promise<RedFinding | null> {
  const raw = await generateResponse(
    buildRedSystemPrompt(),
    buildRedUserPrompt(chunk),
    getModel("code"),
    true // constrained JSON decoding for local models
  );

  return parseRedFinding(raw, chunk);
}
