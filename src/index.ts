import "dotenv/config";
import { config } from "./config.js";
import { printBanner, printError, printSuccess, printSeparator } from "./cli/display.js";
import { indexProject } from "./indexer/indexer.js";
import { watchProject } from "./indexer/watcher.js";
import { startRepl } from "./cli/repl.js";
import { folderFileHandler } from "./utils/folderFileHandler.js";

async function checkService(url: string, name: string): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    return res.ok || res.status < 500;
  } catch {
    return false;
  }
}

async function checkConnectivity(): Promise<boolean> {
  const [ollamaOk, chromaOk] = await Promise.all([
    checkService(config.ollamaBaseUrl, "Ollama"),
    checkService(config.chromaUrl + "/api/v1/heartbeat", "ChromaDB"),
  ]);

  if (!ollamaOk) {
    printError("Ollama is not running.");
    console.log("  Start it with:  \x1b[33mollama serve\x1b[0m");
    console.log("  Install guide:  https://ollama.ai\n");
  } else {
    printSuccess("Ollama connected.");
  }

  if (!chromaOk) {
    printError("ChromaDB is not running.");
    console.log("  Start it with:  \x1b[33mchroma run --path ./chroma-data\x1b[0m");
    console.log("  Install guide:  pip install chromadb\n");
  } else {
    printSuccess("ChromaDB connected.");
  }

  return ollamaOk && chromaOk;
}

async function main(): Promise<void> {
  printBanner();

  const args = process.argv.slice(2);
  const mode = args[0];

  const ready = await checkConnectivity();
  printSeparator();

  if (!ready) {
    printError("One or more services are offline. Fix the above and retry.");
    process.exit(1);
  }

  if (mode === "--index") {
    await indexProject(config.projectPath);
    console.log(folderFileHandler.getFolderStructure());
    process.exit(0);
  }

  if (mode === "--watch") {
    await indexProject(config.projectPath);
    watchProject(config.projectPath);
    // Keep process alive — watcher holds the event loop
    return;
  }

  // Default: interactive REPL
  await startRepl();
}

main().catch((err) => {
  printError(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
