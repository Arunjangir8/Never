import readline from "readline";
import { ask } from "../agent/agent.js";
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

    const mode = /\b(function|class|bug|code|implement|refactor)\b/i.test(query) ? "code" : "general";
    try {
      const response = await ask(query, mode);
      console.log(`\nOptimus [${response.model}]: ${response.answer}`);
      if (response.sources.length) {
        console.log(`Sources: ${response.sources.join(", ")}`);
      }
      console.log();
    } catch (err) {
      console.error("Error:", err);
    }
  }

  rl.close();
}

main();
