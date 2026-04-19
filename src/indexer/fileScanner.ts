import { readdir } from "fs/promises";
import { join, extname } from "path";

const ALLOWED_EXTENSIONS = new Set([
  ".ts", ".js", ".py", ".go", ".java", ".cpp", ".c",
  ".rs", ".md", ".json", ".yaml", ".yml",
]);

const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", "build",
  "__pycache__", ".next", "coverage",
]);

export async function scanDirectory(dirPath: string): Promise<string[]> {
  const results: string[] = [];

  async function walk(current: string): Promise<void> {
    const entries = await readdir(current, { withFileTypes: true });
    await Promise.all(
      entries.map(async (entry) => {
        if (entry.isDirectory()) {
          if (!SKIP_DIRS.has(entry.name)) await walk(join(current, entry.name));
        } else if (entry.isFile() && ALLOWED_EXTENSIONS.has(extname(entry.name))) {
          results.push(join(current, entry.name));
        }
      })
    );
  }

  await walk(dirPath);
  return results;
}
