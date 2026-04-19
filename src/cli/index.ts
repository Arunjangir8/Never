import readline from "readline";
import { streamAnswer } from "../agent/agent.js";
import { indexProject } from "../indexer/indexer.js";
import { watchProject } from "../indexer/watcher.js";
import { config } from "../config.js";

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const prompt = (q: string) => new Promise<string>((res) => rl.question(q, res));

async function main() {
  console.log("🤖 Optimus AI Agent — local RAG coding assistant");
  console.log(`Project: ${config.projectPath}\n`);

  const action = await prompt("Index project now? (y/n): ");
  if (action.trim().toLowerCase() === "y") {
    await indexProject(config.projectPath);
  }

  const watch = await prompt("Watch for file changes? (y/n): ");
  if (watch.trim().toLowerCase() === "y") {
    watchProject(config.projectPath);
  }

  console.log('\nAsk anything (type "exit" to quit):\n');

  while (true) {
    const query = await prompt("You: ");
    if (query.trim().toLowerCase() === "exit") break;
    if (!query.trim()) continue;

    try {
      process.stdout.write("\nOptimus: ");
      for await (const token of streamAnswer(query)) {
        process.stdout.write(token);
      }
      console.log("\n");
    } catch (err) {
      console.error("\nError:", err instanceof Error ? err.message : err);
    }
  }

  rl.close();
}

main();
