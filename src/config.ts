import "dotenv/config";

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required env var: ${key}`);
  return value;
}

export const config = {
  ollamaBaseUrl: process.env["OLLAMA_BASE_URL"] ?? "http://localhost:11434",
  chromaUrl: process.env["CHROMA_URL"] ?? "http://localhost:8201",
  projectPath: process.env["PROJECT_PATH"] ?? "./my-project",

  allowNewFiles:
    (process.env["ALLOW_NEW_FILES"] ?? "false").toLowerCase() === "true",

  backupBeforeWrite:
    (process.env["BACKUP_BEFORE_WRITE"] ?? "false").toLowerCase() === "true",

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

  collectionName:
    process.env["COLLECTION_NAME"] ?? "optimus_codebase",

  topK: parseInt(process.env["TOP_K"] ?? "5", 10),
} as const;
