import readline from "readline";
import { runQuery } from "../agent/orchestrator.js";
import { handleCommand, registerClearHistory } from "./commands.js";
import { printSeparator, printError } from "./display.js";

const PROMPT = "\x1b[36moptimus\x1b[0m \x1b[1m❯\x1b[0m ";
const MAX_HISTORY = 6;

interface Turn {
  role: "user" | "assistant";
  content: string;
}

export async function startRepl(): Promise<void> {
  const history: Turn[] = [];

  registerClearHistory(() => history.splice(0));

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: PROMPT,
    historySize: 50,
  });

  rl.on("SIGINT", () => {
    console.log("\n\nUse /exit to quit.");
    rl.prompt();
  });

  rl.prompt();

  for await (const line of rl) {
    const input = line.trim();
    if (!input) { rl.prompt(); continue; }

    // Slash commands
    const wasCommand = await handleCommand(input);
    if (wasCommand) { rl.prompt(); continue; }

    // Regular query — append user turn to history
    history.push({ role: "user", content: input });
    if (history.length > MAX_HISTORY * 2) history.splice(0, 2);

    printSeparator();
    try {
      await runQuery(input);
    } catch (err) {
      printError(err instanceof Error ? err.message : String(err));
    }

    rl.prompt();
  }
}
