import { ChatOllama } from "@langchain/ollama";
import { ChatOpenAI } from "@langchain/openai";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatAnthropic } from "@langchain/anthropic";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { config } from "../config.js";
import type { ModelInput } from "./modelRouter.js";

// json=true makes Ollama emit only JSON. Small models add prose otherwise.
function makeClient(input: ModelInput, json = false) {
  switch (input.provider) {
    case "local":
      return new ChatOllama({
        model: input.model,
        baseUrl: config.ollamaBaseUrl,
        ...(json ? { format: "json" as const } : {}),
      });

    case "openai":
      return new ChatOpenAI({
        model: input.model,
        ...(input.apiKey ? { apiKey: input.apiKey } : {}),
      });

    case "gemini":
      return new ChatGoogleGenerativeAI({
        model: input.model,
        ...(input.apiKey ? { apiKey: input.apiKey } : {}),
      });

    case "anthropic":
      return new ChatAnthropic({
        model: input.model,
        ...(input.apiKey ? { apiKey: input.apiKey } : {}),
      });

    default:
      throw new Error("Unsupported provider");
  }
}

function isConnectionError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("ECONNREFUSED") ||
    msg.includes("fetch failed") ||
    msg.includes("ENOTFOUND")
  );
}

export async function* streamResponse(
  systemPrompt: string,
  userPrompt: string,
  input: ModelInput
): AsyncGenerator<string> {
  const client = makeClient(input);

  try {
    const stream = await client.stream([
      new SystemMessage(systemPrompt),
      new HumanMessage(userPrompt),
    ]);

    for await (const chunk of stream) {
      const text =
        typeof chunk.content === "string"
          ? chunk.content
          : JSON.stringify(chunk.content);

      if (text) yield text;
    }
  } catch (err) {
    if (input.provider === "local" && isConnectionError(err)) {
      throw new Error("Ollama not running. Start with: ollama serve");
    }
    throw err;
  }
}

export async function generateResponse(
  systemPrompt: string,
  userPrompt: string,
  input: ModelInput,
  json = false
): Promise<string> {
  const client = makeClient(input, json);

  try {
    const response = await client.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(userPrompt),
    ]);

    return typeof response.content === "string"
      ? response.content
      : JSON.stringify(response.content);
  } catch (err) {
    if (input.provider === "local" && isConnectionError(err)) {
      throw new Error("Ollama not running. Start with: ollama serve");
    }
    throw err;
  }
}
