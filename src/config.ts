import "dotenv/config";

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required env var: ${key}`);
  return value;
}

export const config = {
  ollamaBaseUrl: process.env["OLLAMA_BASE_URL"] ?? "http://localhost:11434",
  chromaUrl: process.env["CHROMA_URL"] ?? "http://localhost:8000",
  projectPath: process.env["PROJECT_PATH"] ?? "./my-project",
  generalModel: process.env["GENERAL_MODEL"] ?? "gemma:2b",
  codeModel: process.env["CODE_MODEL"] ?? "codellama:7b",
  embedModel: process.env["EMBED_MODEL"] ?? "nomic-embed-text",
  collectionName: process.env["COLLECTION_NAME"] ?? "optimus_codebase",
  topK: parseInt(process.env["TOP_K"] ?? "5", 10),
} as const;
