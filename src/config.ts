import "dotenv/config";

export type Provider = "local" | "openai" | "gemini" | "anthropic";

const PROVIDERS: Provider[] = ["local", "openai", "gemini", "anthropic"];

// Don't throw: imported at startup, so a throw here escapes main()'s catch.
function readProvider(): Provider {
  const raw = (process.env["PROVIDER"] ?? "local").toLowerCase();
  const match = PROVIDERS.find((p) => p === raw);
  if (!match) {
    console.warn(
      `\x1b[33m⚠ Invalid PROVIDER="${raw}", falling back to "local". ` +
        `Valid values: ${PROVIDERS.join(" | ")}\x1b[0m`
    );
    return "local";
  }
  return match;
}

export const config = {
  provider: readProvider(),

  ollamaBaseUrl: process.env["OLLAMA_BASE_URL"] ?? "http://localhost:11434",
  chromaUrl: process.env["CHROMA_URL"] ?? "http://localhost:8000",
  chromaPath: process.env["CHROMA_PATH"] ?? "./chroma-data",
  projectPath: process.env["PROJECT_PATH"] ?? "./my-project",

  autoStart: (process.env["AUTO_START"] ?? "true").toLowerCase() === "true",

  autoStop: (process.env["AUTO_STOP"] ?? "true").toLowerCase() === "true",

  autoPullModels:
    (process.env["AUTO_PULL_MODELS"] ?? "false").toLowerCase() === "true",

  allowNewFiles:
    (process.env["ALLOW_NEW_FILES"] ?? "false").toLowerCase() === "true",

  backupBeforeWrite:
    (process.env["BACKUP_BEFORE_WRITE"] ?? "true").toLowerCase() === "true",

  models: {
    local: {
      general: process.env["LOCAL_GENERAL_MODEL"] ?? "gemma:2b",
      coding: process.env["LOCAL_CODE_MODEL"] ?? "codellama:7b-instruct",
      embedding: process.env["LOCAL_EMBED_MODEL"] ?? "nomic-embed-text",
    },

    api: {
      openai: {
        apiKey: process.env["OPENAI_API_KEY"] ?? "",
        model: process.env["OPENAI_MODEL"] ?? "gpt-4o-mini",
      },
      gemini: {
        apiKey: process.env["GEMINI_API_KEY"] ?? "",
        model: process.env["GEMINI_MODEL"] ?? "gemini-1.5-flash",
      },
      anthropic: {
        apiKey: process.env["ANTHROPIC_API_KEY"] ?? "",
        model: process.env["ANTHROPIC_MODEL"] ?? "claude-3-haiku-20240307",
      },
    },
  },

  collectionName: process.env["COLLECTION_NAME"] ?? "optimus_codebase",

  topK: parseInt(process.env["TOP_K"] ?? "5", 10),

  // One LLM call per chunk, ~5-20s locally. Keep it small.
  maxDebugChunks: parseInt(process.env["MAX_DEBUG_CHUNKS"] ?? "10", 10),
} as const;
