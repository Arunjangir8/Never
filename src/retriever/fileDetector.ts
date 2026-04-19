import { readFile } from "fs/promises";
import { resolve, isAbsolute } from "path";
import type { DirectFile } from "../types.js";

// Matches paths like src/auth.ts, ./utils/helper.py, /abs/path/file.go
const FILE_PATH_RE = /(?:^|\s)(\.{0,2}\/[\w./-]+\.\w+|[\w/-]+\/[\w./-]+\.\w+)/g;

export async function detectFilePaths(
  query: string,
  projectPath: string
): Promise<DirectFile[]> {
  const matches = [...query.matchAll(FILE_PATH_RE)].map((m) => m[1]!.trim());
  if (matches.length === 0) return [];

  const results: DirectFile[] = [];

  await Promise.all(
    matches.map(async (match) => {
      const absPath = isAbsolute(match) ? match : resolve(projectPath, match);
      try {
        const content = await readFile(absPath, "utf-8");
        results.push({ filePath: absPath, content });
      } catch {
        // File not found — skip silently, fall back to vector search
      }
    })
  );

  return results;
}
