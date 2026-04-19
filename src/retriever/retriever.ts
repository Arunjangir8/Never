import { ChromaClient } from "chromadb";
import { generateEmbeddings } from "../indexer/embedder.js";
import { config } from "../config.js";
import type { QueryResult } from "../types.js";

const client = new ChromaClient({ path: config.chromaUrl });

export async function retrieveChunks(
  query: string,
  topK: number = config.topK
): Promise<QueryResult[]> {
  let col;
  try {
    col = await client.getOrCreateCollection({ name: config.collectionName });
  } catch {
    throw new Error(`ChromaDB unreachable at ${config.chromaUrl}. Is it running?`);
  }

  let queryVec: number[];
  try {
    const vecs = await generateEmbeddings([query]);
    if (!vecs[0]) throw new Error("Empty embedding result");
    queryVec = vecs[0];
  } catch (err) {
    if (err instanceof Error && err.message === "Empty embedding result") throw err;
    throw new Error(`Ollama embedding failed at ${config.ollamaBaseUrl}. Is Ollama running?`);
  }

  const results = await col.query({
    queryEmbeddings: [queryVec!],
    nResults: topK,
    include: ["documents", "metadatas", "distances"] as any,
  });

  const docs = results.documents[0] ?? [];
  const metas = results.metadatas[0] ?? [];
  const distances = results.distances?.[0] ?? [];

  return docs
    .map((doc, i) => {
      const meta = metas[i] as Record<string, unknown> | null ?? {};
      return {
        filePath: String(meta["filePath"] ?? ""),
        content: doc ?? "",
        score: 1 - (distances[i] ?? 0),
        startLine: Number(meta["startLine"] ?? 0),
        endLine: Number(meta["endLine"] ?? 0),
      };
    })
    .sort((a, b) => b.score - a.score);
}
