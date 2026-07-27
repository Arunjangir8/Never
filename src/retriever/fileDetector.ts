import { readFile } from "fs/promises";
import { resolve, isAbsolute, relative } from "path";
import type { DirectFile } from "../types.js";

const FILE_PATH_RE = /(?:^|\s)((?:\.{0,2}\/)?[\w.-]+(?:\/[\w.-]+)*\.\w+)/g;

export async function detectFilePaths(
  query: string,
  projectPath: string
): Promise<DirectFile[]> {
  const matches = [...query.matchAll(FILE_PATH_RE)].map((m) => m[1]!.trim());
  if (matches.length === 0) return [];

  const root = resolve(projectPath);
  const results: DirectFile[] = [];

  await Promise.all(
    matches.map(async (match) => {
      const absPath = isAbsolute(match) ? match : resolve(root, match);

      // These paths come from user text. Reject outside-project ones here,
      // otherwise contextBuilder throws later and kills the whole query.
      const rel = relative(root, absPath);
      if (rel.startsWith("..") || isAbsolute(rel)) {
        console.warn(
          `\x1b[33m⚠ Ignoring "${match}", outside PROJECT_PATH.\x1b[0m`
        );
        return;
      }

      try {
        const content = await readFile(absPath, "utf-8");
        results.push({ filePath: absPath, content });
      } catch {
        // Bad match or missing file. Vector search handles it.
      }
    })
  );

  return results;
}
