import chokidar from "chokidar";
import { resolve } from "path";
import { indexFile, deleteFile } from "./indexer.js";
import { runPipeline } from "../agent/bug-fixer/graph.js";

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
    .on("add", (p) =>
      debounce(p, async () => {
        const chunks = await indexFile(p);
        console.log(`Indexed: ${p}`);
        if (chunks.length > 0) await runPipeline(chunks, "watch");
      })
    )
    .on("change", (p) =>
      debounce(p, async () => {
        const chunks = await indexFile(p);
        console.log(`Re-indexed: ${p}`);
        if (chunks.length > 0) await runPipeline(chunks, "watch");
      })
    )
    .on("unlink", (p) =>
      debounce(p, () => deleteFile(p).then(() => console.log(`Removed: ${p}`)))
    );

  console.log(`Watching: ${absPath}`);
}
