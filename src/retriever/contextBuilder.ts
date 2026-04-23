import type { QueryResult } from "../types.js";
import { folderFileHandler } from "../utils/folderFileHandler.js";

const MAX_CHARS = 6000 * 4; // 1 token ≈ 4 chars

interface MergedChunk {
  filePath: string;
  content: string;
  startLine: number;
  endLine: number;
  score: number;
}

function mergeOverlapping(results: QueryResult[]): MergedChunk[] {
  const byFile = new Map<string, QueryResult[]>();
  for (const r of results) {
    const existing = byFile.get(r.filePath) ?? [];
    existing.push(r);
    byFile.set(r.filePath, existing);
  }

  const merged: MergedChunk[] = [];

  for (const [filePath, chunks] of byFile) {
    const sorted = [...chunks].sort((a, b) => a.startLine - b.startLine);
    const groups: QueryResult[][] = [];
    let current: QueryResult[] = [sorted[0]!];

    for (let i = 1; i < sorted.length; i++) {
      const prev = current[current.length - 1]!;
      const next = sorted[i]!;
      if (next.startLine <= prev.endLine + 1) {
        current.push(next);
      } else {
        groups.push(current);
        current = [next];
      }
    }
    groups.push(current);

    for (const group of groups) {
      const lines = new Map<number, string>();
      for (const chunk of group) {
        chunk.content.split("\n").forEach((line, idx) => {
          lines.set(chunk.startLine + idx, line);
        });
      }
      const sortedLineNums = [...lines.keys()].sort((a, b) => a - b);
      merged.push({
        filePath,
        content: sortedLineNums.map((n) => lines.get(n)!).join("\n"),
        startLine: sortedLineNums[0] ?? 0,
        endLine: sortedLineNums[sortedLineNums.length - 1] ?? 0,
        score: Math.max(...group.map((c) => c.score)),
      });
    }
  }

  return merged.sort((a, b) => b.score - a.score);
}

export function buildContext(results: QueryResult[], userQuery: string): string {
  const merged = mergeOverlapping(results);

  const files: object[] = [];
  let usedChars = 0;

  for (const chunk of merged) {
    const entry = {
      path: chunk.filePath,
      ...(chunk.startLine !== 0 || chunk.endLine !== 0
        ? { lines: `${chunk.startLine}-${chunk.endLine}` }
        : {}),
      score: parseFloat(chunk.score.toFixed(3)),
      content: folderFileHandler.readFileLines(
        chunk.filePath,
        Math.max(1, chunk.startLine - 20),
        chunk.endLine + 20
      ),
    };

    const entryStr = JSON.stringify(entry);
    if (usedChars + entryStr.length > MAX_CHARS) break;
    files.push(entry);
    usedChars += entryStr.length;
  }

  return JSON.stringify({ query: userQuery, files }, null, 2);
}
