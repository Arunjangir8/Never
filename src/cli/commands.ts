import { exec } from "child_process";
import { promisify } from "util";
import { indexProject, indexFile } from "../indexer/indexer.js";
import { watchProject } from "../indexer/watcher.js";
import { config } from "../config.js";
import { printSeparator, printError, printSuccess } from "./display.js";

const execAsync = promisify(exec);

const HELP = `
  /index              Re-index entire project
  /index <file>       Index a single file
  /watch              Start file watcher
  /clear              Clear conversation history
  /models             List available Ollama models
  /revert <file>      Revert last patch on a file
  /help               Show this help
  /exit               Exit Optimus
`;

let clearHistoryFn: (() => void) | null = null;
export function registerClearHistory(fn: () => void): void {
  clearHistoryFn = fn;
}

export async function handleCommand(input: string): Promise<boolean> {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) return false;

  const [cmd, ...args] = trimmed.split(/\s+/);

  switch (cmd) {
    case "/index": {
      if (args.length > 0) {
        const file = args.join(" ");
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
      clearHistoryFn?.();
      console.clear();
      printSuccess("Conversation history cleared.");
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

    case "/revert": {
      if (args.length === 0) {
        printError("Usage: /revert <filePath>");
        break;
      }
      const { revertUpdate } = await import("../agent/patcher.js");
      try {
        await revertUpdate(args.join(" "));
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
