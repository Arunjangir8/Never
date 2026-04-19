import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { retrieve } from "../retriever/retriever.js";
import { getLLM } from "../llm/llmClient.js";
import type { AgentResponse } from "../types.js";

export async function ask(query: string, mode: "general" | "code" = "code"): Promise<AgentResponse> {
  const results = await retrieve(query);
  const context = results
    .map((r) => `// ${r.filePath}\n${r.content}`)
    .join("\n\n---\n\n");

  const llm = getLLM(mode);
  const response = await llm.invoke([
    new SystemMessage(
      `You are Optimus, a local AI coding assistant. Use the following codebase context to answer:\n\n${context}`
    ),
    new HumanMessage(query),
  ]);

  return {
    answer: String(response.content),
    sources: [...new Set(results.map((r) => r.filePath))],
    model: mode === "code" ? "codellama:7b" : "gemma:2b",
  };
}
