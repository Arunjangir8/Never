import "dotenv/config";
import { isAbsolute, resolve } from "path";
import { config } from "./config.js";
import { printBanner, printError, printSuccess, printSeparator } from "./cli/display.js";
import { indexProject, indexFile } from "./indexer/indexer.js";
import { watchProject } from "./indexer/watcher.js";
import { startRepl } from "./cli/repl.js";
import { folderFileHandler } from "./utils/folderFileHandler.js";
import { runPipeline } from "./agent/bug-fixer/graph.js";
import { ensureServices } from "./utils/services.js";
import type { FileChunk } from "./types.js";

const USAGE = `
  npm run dev              Interactive chat (default)
  npm run index            Index PROJECT_PATH into ChromaDB
  npm run watch            Index, then re-index on every file save
  npm run debug -- <file>  Run the Red/Blue bug-fixer on one file
  npm run debug            Run the Red/Blue bug-fixer on the whole project

  Config lives in .env. Run /status inside the chat to see what's active.
`;

// One LLM round-trip per chunk, so cap the batch.
function capChunks(chunks: FileChunk[]): FileChunk[] {
  if (chunks.length <= config.maxDebugChunks) return chunks;
  console.log(
    `\x1b[33mLimiting to ${config.maxDebugChunks} of ${chunks.length} chunks ` +
      `(raise MAX_DEBUG_CHUNKS, or pass a single file).\x1b[0m`
  );
  return chunks.slice(0, config.maxDebugChunks);
}

async function main(): Promise<void> {
  printBanner();

  const args = process.argv.slice(2);
  const mode = args[0];

  if (mode === "--help" || mode === "-h") {
    console.log(USAGE);
    return;
  }

  folderFileHandler.verifyRoot();
  printSuccess(`Project: ${folderFileHandler.rootPath}`);
  printSuccess(
    `Provider: ${config.provider}` +
      (config.provider === "local"
        ? ` (${config.models.local.general} / ${config.models.local.coding})`
        : ` (${config.models.api[config.provider].model})`)
  );

  const ready = await ensureServices();
  printSeparator();

  if (!ready) {
    printError("Setup incomplete. Fix the above and retry.");
    process.exit(1);
  }

  if (mode === "--index") {
    await indexProject(config.projectPath);
    console.log(folderFileHandler.getFolderStructure());
    return;
  }

  if (mode === "--debug") {
    const target = args[1];
    const chunks = target
      ? await indexFile(
          isAbsolute(target) ? target : resolve(config.projectPath, target)
        )
      : await indexProject(config.projectPath);

    if (chunks.length === 0) {
      printError("Nothing to analyze, no indexable content found.");
      return;
    }

    await runPipeline(capChunks(chunks), "debug");
    return;
  }

  if (mode === "--watch") {
    await indexProject(config.projectPath);
    watchProject(config.projectPath);
    return;
  }

  if (mode !== undefined) {
    printError(`Unknown option: ${mode}`);
    console.log(USAGE);
    process.exit(1);
  }

  // Default: interactive REPL
  await startRepl();
}

main().catch((err) => {
  printError(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
