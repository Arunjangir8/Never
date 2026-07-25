import "dotenv/config";
import { isAbsolute, resolve } from "path";
import { config } from "./config.js";
import { printBanner, printError, printSuccess, printSeparator } from "./cli/display.js";
import { indexProject, indexFile } from "./indexer/indexer.js";
import { watchProject } from "./indexer/watcher.js";
import { startRepl } from "./cli/repl.js";
import { folderFileHandler } from "./utils/folderFileHandler.js";
import { runPipeline } from "./agent/bug-fixer/graph.js";
import type { FileChunk } from "./types.js";

const USAGE = `
  npm run dev              Interactive chat (default)
  npm run index            Index PROJECT_PATH into ChromaDB
  npm run watch            Index, then re-index on every file save
  npm run debug -- <file>  Run the Red/Blue bug-fixer on one file
  npm run debug            Run the Red/Blue bug-fixer on the whole project

  Config lives in .env. Run /status inside the chat to see what's active.
`;

async function checkService(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    return res.ok || res.status < 500;
  } catch {
    return false;
  }
}

async function checkConnectivity(): Promise<boolean> {
  // Embeddings always use Ollama, so it's needed whatever PROVIDER is.
  const [ollamaOk, chromaOk] = await Promise.all([
    checkService(config.ollamaBaseUrl),
    checkService(config.chromaUrl + "/api/v1/heartbeat"),
  ]);

  if (!ollamaOk) {
    printError(`Ollama is not reachable at ${config.ollamaBaseUrl}`);
    console.log("  Start it with:  \x1b[33mollama serve\x1b[0m");
    console.log("  Install guide:  https://ollama.ai\n");
  } else {
    printSuccess(`Ollama connected (${config.ollamaBaseUrl})`);
  }

  if (!chromaOk) {
    printError(`ChromaDB is not reachable at ${config.chromaUrl}`);
    console.log("  Start it with:  \x1b[33mchroma run --path ./chroma-data\x1b[0m");
    console.log("  Install guide:  pip install chromadb\n");
  } else {
    printSuccess(`ChromaDB connected (${config.chromaUrl})`);
  }

  return ollamaOk && chromaOk;
}

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

  const ready = await checkConnectivity();
  printSeparator();

  if (!ready) {
    printError("One or more services are offline. Fix the above and retry.");
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
