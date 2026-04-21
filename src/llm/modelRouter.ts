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
  return "general"; // default — assume conversation, not a code change
}

export function getModel(type: "code" | "general"): string {
  return type === "code" ? config.codeModel : config.generalModel;
}



// import { config } from "../config.js";

// // ─── LLM Query Type Detection ─────────────────────────────────────────────────

// const CLASSIFIER_PROMPT = `You are a query classifier for a coding assistant.
// Classify the user's query as exactly one of:
//   "code"    — the user wants to create, edit, fix, refactor, or change code/files
//   "general" — the user is asking a question, wants an explanation, or is just chatting

// Reply with ONLY the word: code
// Or ONLY the word: general
// No punctuation. No explanation.`;

// export async function detectQueryType(query: string): Promise<"code" | "general"> {
//   try {
//     const res = await fetch(`${config.ollamaBaseUrl}/api/generate`, {
//       method: "POST",
//       headers: { "Content-Type": "application/json" },
//       body: JSON.stringify({
//         model: config.generalModel,   // use the lighter/faster model
//         prompt: `${CLASSIFIER_PROMPT}\n\nQuery: ${query}`,
//         stream: false,
//       }),
//     });

//     if (!res.ok) throw new Error(`Ollama ${res.status}`);
//     const data = await res.json() as { response: string };
//     const answer = data.response.trim().toLowerCase().split(/\s+/)[0] ?? "";

//     if (answer === "code") return "code";
//     if (answer === "general") return "general";

//     // LLM returned something unexpected — log it and fall back
//     process.stdout.write(`\x1b[2m[Classifier] Unexpected response: "${answer}" — defaulting to general\x1b[0m\n`);
//     return "general";

//   } catch (err) {
//     // If Ollama is down or slow, don't crash — fall back silently
//     process.stdout.write(`\x1b[2m[Classifier] Failed: ${err instanceof Error ? err.message : err} — defaulting to general\x1b[0m\n`);
//     return "general";
//   }
// }

// export function getModel(type: "code" | "general"): string {
//   return type === "code" ? config.codeModel : config.generalModel;
// }
