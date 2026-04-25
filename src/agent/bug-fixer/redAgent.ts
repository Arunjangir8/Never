import { generateResponse } from "../../llm/ollamaClient.js";
import { getModel } from "../../llm/modelRouter.js";
import type { FileChunk, RedFinding } from "../../types.js";
import { buildRedSystemPrompt, buildRedUserPrompt } from "../../llm/promptBuilder.js";


function parseRedFinding(raw: string, chunk: FileChunk): RedFinding | null {
  try {
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();

    const parsed = JSON.parse(cleaned) as RedFinding;

    if (
      !Array.isArray(parsed.bugs) ||
      !Array.isArray(parsed.edge_cases) ||
      !Array.isArray(parsed.risks)
    ) {
      throw new Error("Missing required arrays in Red Agent response");
    }

    parsed.chunk_id = `${chunk.filePath}::${chunk.chunkIndex}`;
    parsed.file = chunk.filePath;

    return parsed;
  } catch (err) {
    console.error(
      `\x1b[31m✖ Failed to parse Red Agent output for chunk ${chunk.chunkIndex} of ${chunk.filePath}:\x1b[0m`,
      err instanceof Error ? err.message : String(err)
    );
    console.error(`\x1b[2mRaw output:\x1b[0m\n${raw}\n`);
    return null;
  }
}


export async function runRedAgent(chunk: FileChunk): Promise<RedFinding | null> {
  const raw = await generateResponse(
    buildRedSystemPrompt(),
    buildRedUserPrompt(chunk),
    getModel("code"),
  );

  return parseRedFinding(raw, chunk);
}