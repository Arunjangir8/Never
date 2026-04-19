import { ChatOllama } from "@langchain/ollama";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";

function makeClient(model: string): ChatOllama {
  return new ChatOllama({
    model,
    baseUrl: process.env["OLLAMA_BASE_URL"] ?? "http://localhost:11434",
  });
}

function isConnectionError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("ECONNREFUSED") || msg.includes("fetch failed") || msg.includes("ENOTFOUND");
}

export async function* streamResponse(
  systemPrompt: string,
  userPrompt: string,
  model: string
): AsyncGenerator<string> {
  const client = makeClient(model);
  try {
    const stream = await client.stream([
      new SystemMessage(systemPrompt),
      new HumanMessage(userPrompt),
    ]);
    for await (const chunk of stream) {
      const text = typeof chunk.content === "string" ? chunk.content : "";
      if (text) yield text;
    }
  } catch (err) {
    if (isConnectionError(err)) {
      throw new Error("Ollama not running. Start with: ollama serve");
    }
    throw err;
  }
}

export async function generateResponse(
  systemPrompt: string,
  userPrompt: string,
  model: string
): Promise<string> {
  const client = makeClient(model);
  try {
    const response = await client.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(userPrompt),
    ]);
    return typeof response.content === "string" ? response.content : JSON.stringify(response.content);
  } catch (err) {
    if (isConnectionError(err)) {
      throw new Error("Ollama not running. Start with: ollama serve");
    }
    throw err;
  }
}
