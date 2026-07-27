import { config, type Provider } from "../config.js";

export interface ModelInput {
  provider: Provider;
  model: string;
  apiKey?: string;
  baseUrl?: string;
}

const CODE_SIGNALS = [
  "fix", "write", "implement", "refactor", "debug", "create", "scaffold",
  "update", "add feature", "error in", "bug", "generate", "build",
  "edit", "change", "modify", "complete", "finish", "add", "code",
  "rename", "delete", "remove", "rewrite", "setup", "set up"
];

const GENERAL_SIGNALS = [
  "explain", "what is", "how does", "why", "describe",
  "summarize", "what does", "tell me", "overview",
  "hello", "hi", "hey", "thanks", "thank you", "who are you", "what are you",
];

function compile(signals: string[]): RegExp {
  const alts = signals.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(`\\b(?:${alts.join("|")})\\b`);
}

const CODE_RE = compile(CODE_SIGNALS);
const GENERAL_RE = compile(GENERAL_SIGNALS);

export function detectQueryType(query: string): "code" | "general" {
  const lower = query.toLowerCase();
  if (CODE_RE.test(lower)) return "code";
  if (GENERAL_RE.test(lower)) return "general";
  return "general";
}

// Provider comes from .env. Only local swaps model by query type.
export function getModel(type: "code" | "general"): ModelInput {
  if (config.provider === "local") {
    return {
      provider: "local",
      model:
        type === "code"
          ? config.models.local.coding
          : config.models.local.general,
    };
  }

  const api = config.models.api[config.provider];
  if (!api.apiKey) {
    throw new Error(
      `PROVIDER=${config.provider} but no API key set. ` +
        `Set ${config.provider.toUpperCase()}_API_KEY in .env, or use PROVIDER=local.`
    );
  }

  return {
    provider: config.provider,
    model: api.model,
    apiKey: api.apiKey,
    ...("baseUrl" in api && api.baseUrl ? { baseUrl: api.baseUrl } : {}),
  };
}
