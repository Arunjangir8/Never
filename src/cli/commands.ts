import { exec } from "child_process";
import { promisify } from "util";
import { isAbsolute, resolve } from "path";
import { indexProject, indexFile } from "../indexer/indexer.js";
import { watchProject } from "../indexer/watcher.js";
import { config } from "../config.js";
import { folderFileHandler } from "../utils/folderFileHandler.js";
import { printSeparator, printError, printSuccess } from "./display.js";

const execAsync = promisify(exec);

const HELP = `
  /index              Re-index entire project
  /index <file>       Index a single file (path relative to PROJECT_PATH)
  /watch              Start file watcher
  /status             Show current provider, models and project path
  /clear              Clear the screen
  /models             List available Ollama models
  /revert <file>      Restore a file from its .optimus.bak backup
  /help               Show this help
  /exit               Exit Optimus
`;

export async function handleCommand(input: string): Promise<boolean> {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) return false;

  const [cmd, ...args] = trimmed.split(/\s+/);

  switch (cmd) {
    case "/index": {
      if (args.length > 0) {
        const raw = args.join(" ");
        // Chunk ids use absolute paths. Resolve like indexProject does,
        // otherwise re-indexing adds a duplicate entry.
        const file = isAbsolute(raw) ? raw : resolve(config.projectPath, raw);
        try {
          await indexFile(file);
          printSuccess(`Indexed: ${file}`);
        } catch (err) {
          printError(`Failed to index ${file}: ${err instanceof Error ? err.message : err}`);
        }
      } else {
        await indexProject(config.projectPath);
      }
      break;
    }

    case "/watch": {
      watchProject(config.projectPath);
      printSuccess("Watcher started.");
      break;
    }

    case "/clear": {
      console.clear();
      break;
    }

    case "/models": {
      try {
        const { stdout } = await execAsync("ollama list");
        printSeparator();
        console.log(stdout.trim());
        printSeparator();
      } catch {
        printError("Could not run `ollama list`. Is Ollama installed?");
      }
      break;
    }

    case "/status": {
      printSeparator();
      const modelLine =
        config.provider === "local"
          ? `${config.models.local.general} (general) / ${config.models.local.coding} (code)`
          : config.models.api[config.provider].model;
      console.log(`  provider   ${config.provider}`);
      console.log(`  model      ${modelLine}`);
      console.log(`  embeddings ${config.models.local.embedding}`);
      console.log(`  project    ${folderFileHandler.rootPath}`);
      console.log(`  chroma     ${config.chromaUrl} (${config.collectionName})`);
      console.log(`  new files  ${config.allowNewFiles ? "allowed" : "blocked"}`);
      console.log(`  backups    ${config.backupBeforeWrite ? "on" : "off"}`);
      printSeparator();
      break;
    }

    case "/revert": {
      if (args.length === 0) {
        printError("Usage: /revert <file relative to PROJECT_PATH>");
        break;
      }
      const target = args.join(" ");
      try {
        folderFileHandler.revert(target);
        printSuccess(`Reverted: ${target}`);
      } catch (err) {
        printError(err instanceof Error ? err.message : String(err));
      }
      break;
    }

    case "/help": {
      console.log(HELP);
      break;
    }

    case "/exit": {
      console.log("\nGoodbye 👋");
      process.exit(0);
    }

    default:
      printError(`Unknown command: ${cmd}. Type /help for available commands.`);
  }

  return true;
}
