import { config } from "../config.js";

const CODE_SIGNALS = [
  "fix", "write", "implement", "refactor", "debug", "create function",
  "update", "add feature", "error in", "bug", "generate", "build",
  "edit", "change", "modify", "complete", "finish", "add",
];

const GENERAL_SIGNALS = [
  "explain", "what is", "how does", "why", "describe",
  "summarize", "what does", "tell me", "overview",
  "hello", "hi", "hey", "thanks", "thank you", "who are you", "what are you",
];

export function detectQueryType(query: string): "code" | "general" {
  const lower = query.toLowerCase();
  if (GENERAL_SIGNALS.some((s) => lower.includes(s))) return "general";
  if (CODE_SIGNALS.some((s) => lower.includes(s))) return "code";
  return "general"; // default — assume conversation, not a code change
}

export function getModel(type: "code" | "general"): string {
  return type === "code" ? config.codeModel : config.generalModel;
}
