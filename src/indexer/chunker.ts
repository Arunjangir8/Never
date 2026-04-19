import type { FileChunk } from "../types.js";

const CHUNK_SIZE = 60;
const OVERLAP = 10;

export function chunkFile(filePath: string, content: string): FileChunk[] {
  const lines = content.split("\n");
  const chunks: FileChunk[] = [];
  let chunkIndex = 0;
  let start = 0;

  while (start < lines.length) {
    const end = Math.min(start + CHUNK_SIZE, lines.length);
    chunks.push({
      filePath,
      content: lines.slice(start, end).join("\n"),
      startLine: start + 1,
      endLine: end,
      chunkIndex: chunkIndex++,
    });
    if (end === lines.length) break;
    start += CHUNK_SIZE - OVERLAP;
  }

  return chunks;
}
