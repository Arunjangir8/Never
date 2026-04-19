import { runAgent } from "./agent.js";
import { logger } from "./utils/logger.js";

const [prompt, projectDir = "."] = process.argv.slice(2);

if (!prompt) {
  logger.error("Usage: node dist/index.js \"<your prompt>\" [project-dir]");
  process.exit(1);
}

const response = await runAgent(prompt, projectDir);
console.log("\n--- Agent Response ---\n");
console.log(response);
