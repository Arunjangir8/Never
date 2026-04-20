import { detectFilePaths } from "./fileDetector.js";
import { retrieveChunks } from "./retriever.js";
import { buildContext } from "./contextBuilder.js";
import { config } from "../config.js";

export async function getContext(query: string): Promise<string> {
  // 1. Check for explicit file references in the query
  const directFiles = await detectFilePaths(query, config.projectPath);

  if (directFiles.length > 0) {
    const chunks = directFiles.map((f) => ({
      filePath: f.filePath,
      content: f.content,
      score: 1,
      startLine: 0,
      endLine: 0,
    }));
    return buildContext(chunks, query);
  }

  // 2. Fall back to vector search
  const chunks = await retrieveChunks(query);
  return buildContext(chunks, query);
}