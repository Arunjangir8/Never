import { config } from "../config.js";

const CODE_SIGNALS = [
  "fix", "write", "implement", "refactor", "debug", "create function",
  "update", "add feature", "error in", "bug", "generate", "build",
  "edit", "change", "modify", "complete", "finish", "add",
];

const GENERAL_SIGNALS = [
  "explain", "what is", "how does", "why", "describe",
  "summarize", "what does", "tell me", "overview",
];

export function detectQueryType(query: string): "code" | "general" {
  const lower = query.toLowerCase();
  if (GENERAL_SIGNALS.some((s) => lower.includes(s))) return "general";
  if (CODE_SIGNALS.some((s) => lower.includes(s))) return "code";
  return "code"; // default
}

export function getModel(type: "code" | "general"): string {
  return type === "code" ? config.codeModel : config.generalModel;
}
