import { runLLM } from "./llm.js";
import { readProjectFiles } from "./tools/fileReader.js";
import { logger } from "./utils/logger.js";

export async function runAgent(prompt: string, projectDir: string): Promise<string> {
  logger.info(`Reading project files from: ${projectDir}`);
  const fileContext = await readProjectFiles(projectDir);

  const fullPrompt = `You are a coding assistant. Below is the project context:\n\n${fileContext}\n\nUser request: ${prompt}`;

  logger.info("Sending prompt to LLM...");
  const response = await runLLM(fullPrompt);

  return response;
}
