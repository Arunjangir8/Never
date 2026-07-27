import readline from "readline";
import { runQuery } from "../agent/orchestrator.js";
import { handleCommand } from "./commands.js";
import { setReplInterface } from "./prompt.js";
import { printSeparator, printError } from "./display.js";

const PROMPT = "\x1b[36moptimus\x1b[0m \x1b[1m❯\x1b[0m ";

// Each query is stateless, context comes from the vector store. Add a Turn[]
// here and pass it to runQuery if follow-ups like "now rename it" are needed.
export async function startRepl(): Promise<void> {
  console.log(
    "\x1b[2mAsk a question, or type /help for commands. File changes always ask before writing.\x1b[0m\n"
  );

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: PROMPT,
    historySize: 50,
  });
  setReplInterface(rl);

  rl.on("SIGINT", () => {
    console.log("\n\nUse /exit to quit.");
    rl.prompt();
  });

  rl.prompt();

  for await (const line of rl) {
    const input = line.trim();
    if (!input) { rl.prompt(); continue; }

    const wasCommand = await handleCommand(input);
    if (wasCommand) { rl.prompt(); continue; }

    printSeparator();
    try {
      await runQuery(input);
    } catch (err) {
      printError(err instanceof Error ? err.message : String(err));
    }

    rl.prompt();
  }

  setReplInterface(null);
}
