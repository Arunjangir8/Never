import chokidar from "chokidar";
import { resolve } from "path";
import { indexFile, deleteFile } from "./indexer.js";

const DEBOUNCE_MS = 500;

export function watchProject(projectPath: string): void {
  const absPath = resolve(projectPath);
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  function debounce(filePath: string, fn: () => Promise<void>): void {
    const existing = timers.get(filePath);
    if (existing) clearTimeout(existing);
    timers.set(
      filePath,
      setTimeout(async () => {
        timers.delete(filePath);
        try {
          await fn();
        } catch (err) {
          console.error(`Watcher error for ${filePath}:`, err);
        }
      }, DEBOUNCE_MS)
    );
  }

  const watcher = chokidar.watch(absPath, {
    ignored: /(node_modules|\.git|dist|build|__pycache__|\.next|coverage)/,
    persistent: true,
    ignoreInitial: true,
  });

  watcher
    .on("add", (p) => debounce(p, () => indexFile(p).then(() => console.log(`Indexed: ${p}`))))
    .on("change", (p) => debounce(p, () => indexFile(p).then(() => console.log(`Re-indexed: ${p}`))))
    .on("unlink", (p) => debounce(p, () => deleteFile(p).then(() => console.log(`Removed: ${p}`))));

  console.log(`Watching: ${absPath}`);
}
