import { config } from "../config.js";

const CODE_SIGNALS = [
  "fix", "write", "implement", "refactor", "debug", "create function",
  "update", "add feature", "error in", "bug", "generate", "build",
  "edit", "change", "modify", "complete", "finish", "add", "code"
];

const GENERAL_SIGNALS = [
  "explain", "what is", "how does", "why", "describe",
  "summarize", "what does", "tell me", "overview",
  "hello", "hi", "hey", "thanks", "thank you", "who are you", "what are you",
];

export function detectQueryType(query: string): "code" | "general" {
  const lower = query.toLowerCase();
  if (CODE_SIGNALS.some((s) => lower.includes(s))) return "code";
  if (GENERAL_SIGNALS.some((s) => lower.includes(s))) return "general";
  return "general";
}

export function getModel(type: "code" | "general") {
  return {
    provider: "openai" as const,
    model:config.models.api.openai.model,
    apiKey: config.models.api.openai.apiKey,
  }
  return {
    provider: "local" as const,
    model:
      type === "code"
        ? config.models.local.coding
        : config.models.local.general,
  };
}


// import { config } from "../config.js";
// import { generateResponse } from "../llm/ollamaClient.js";
// import { getClassifierPrompt, getRouterPrompt } from "./promptBuilder.js";

// type QueryType = "code" | "general";
// type Provider = "local" | "openai" | "gemini" | "anthropic";

// interface ModelInput {
//   provider: Provider;
//   model: string;
//   apiKey?: string;
// }



// function getRouterLLM(): ModelInput {
//   return {
//     provider: "local",
//     model: config.models.local.general,
//   };
// }

// export async function detectQueryType(query: string): Promise<QueryType> {
//   try {
//     const res = await generateResponse(
//       getClassifierPrompt(),
//       `Query: ${query}`,
//       getRouterLLM()
//     );

//     const answer = res.trim().toLowerCase().split(/\s+/)[0];

//     if (answer === "code") return "code";
//     if (answer === "general") return "general";

//     return "general";
//   } catch {
//     return "general";
//   }
// }

// export async function selectProvider(query: string): Promise<Provider> {
//   try {
//     const res = await generateResponse(
//       getRouterPrompt(),
//       `Query: ${query}`,
//       getRouterLLM()
//     );

//     const answer = res.trim().toLowerCase().split(/\s+/)[0];

//     if (
//       answer === "local" ||
//       answer === "openai" ||
//       answer === "gemini" ||
//       answer === "anthropic"
//     ) {
//       return answer;
//     }

//     return "openai";
//   } catch {
//     return "openai";
//   }
// }

// export function resolveModel(
//   provider: Provider,
//   type: QueryType
// ): ModelInput {
//   if (provider === "local") {
//     return {
//       provider: "local",
//       model:
//         type === "code"
//           ? config.models.local.coding
//           : config.models.local.general,
//     };
//   }

//   if (provider === "openai") {
//     return {
//       provider: "openai",
//       model: config.models.api.openai.model,
//       apiKey: config.models.api.openai.apiKey,
//     };
//   }

//   if (provider === "gemini") {
//     return {
//       provider: "gemini",
//       model: config.models.api.gemini.model,
//       apiKey: config.models.api.gemini.apiKey,
//     };
//   }

//   if (provider === "anthropic") {
//     return {
//       provider: "anthropic",
//       model: config.models.api.anthropic.model,
//       apiKey: config.models.api.anthropic.apiKey,
//     };
//   }

//   return {
//     provider: "openai",
//     model: config.models.api.openai.model,
//     apiKey: config.models.api.openai.apiKey,
//   };
// }

// export async function getModel(query: string): Promise<{
//   type: QueryType;
//   model: ModelInput;
// }> {
//   const type = await detectQueryType(query);
//   const provider = await selectProvider(query);
//   const model = resolveModel(provider, type);

//   return { type, model };
// }