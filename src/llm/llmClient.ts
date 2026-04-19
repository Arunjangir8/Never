import { ChatOllama } from "@langchain/ollama";
import { config } from "../config.js";

export function getLLM(mode: "general" | "code" = "general"): ChatOllama {
  return new ChatOllama({
    model: mode === "code" ? config.codeModel : config.generalModel,
    baseUrl: config.ollamaBaseUrl,
  });
}
