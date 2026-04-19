import { getContext } from "../retriever/index.js";
import { queryLLM } from "../llm/index.js";
import { generateResponse } from "../llm/ollamaClient.js";
import { detectQueryType, getModel } from "../llm/modelRouter.js";
import { buildSystemPrompt, buildUserPrompt } from "../llm/promptBuilder.js";
import type { AgentResponse } from "../types.js";

export async function* streamAnswer(query: string): AsyncGenerator<string> {
  const context = await getContext(query);
  yield* queryLLM(query, context);
}

export async function ask(query: string): Promise<AgentResponse> {
  const context = await getContext(query);
  const type = detectQueryType(query);
  const model = getModel(type);
  const answer = await generateResponse(buildSystemPrompt(context), buildUserPrompt(query), model);

  // Extract source file paths from context XML
  const sources = [...context.matchAll(/path="([^"]+)"/g)].map((m) => m[1]!);

  return { answer, sources: [...new Set(sources)], model };
}
