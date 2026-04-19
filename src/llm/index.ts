import { detectQueryType, getModel } from "./modelRouter.js";
import { buildSystemPrompt, buildUserPrompt } from "./promptBuilder.js";
import { streamResponse } from "./ollamaClient.js";

export async function* queryLLM(
  query: string,
  context: string
): AsyncGenerator<string> {
  const type = detectQueryType(query);
  const model = getModel(type);
  console.log(`Using ${model} for ${type} task...`);

  const systemPrompt = buildSystemPrompt(context);
  const userPrompt = buildUserPrompt(query);

  yield* streamResponse(systemPrompt, userPrompt, model);
}
