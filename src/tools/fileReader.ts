import { readdir, readFile, stat } from "fs/promises";
import { join } from "path";

const IGNORED = new Set(["node_modules", ".git", "dist", ".env"]);

async function collectFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir);
  const files: string[] = [];

  for (const entry of entries) {
    if (IGNORED.has(entry)) continue;
    const fullPath = join(dir, entry);
    const info = await stat(fullPath);
    if (info.isDirectory()) {
      files.push(...(await collectFiles(fullPath)));
    } else {
      files.push(fullPath);
    }
  }

  return files;
}

export async function readProjectFiles(dir: string): Promise<string> {
  const files = await collectFiles(dir);
  const chunks: string[] = [];

  for (const file of files) {
    const content = await readFile(file, "utf-8");
    chunks.push(`// File: ${file}\n${content}`);
  }

  return chunks.join("\n\n");
}
