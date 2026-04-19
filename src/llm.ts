import { Ollama } from "@langchain/ollama";

const llm = new Ollama({ model: "gemma:2b" });

export async function runLLM(prompt: string): Promise<string> {
  const response = await llm.invoke(prompt);
  return response;
}
