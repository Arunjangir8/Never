import { ChromaClient } from "chromadb";
import { generateEmbeddings } from "../indexer/embedder.js";
import { config } from "../config.js";
import type { QueryResult } from "../types.js";

const client = new ChromaClient({ path: config.chromaUrl });

export async function retrieve(query: string): Promise<QueryResult[]> {
  const [queryVec] = await generateEmbeddings([query]);
  const col = await client.getOrCreateCollection({ name: config.collectionName });

  const results = await col.query({
    queryEmbeddings: [queryVec!],
    nResults: config.topK,
    include: ["documents", "metadatas", "distances"] as any,
  });

  const docs = results.documents[0] ?? [];
  const metas = results.metadatas[0] ?? [];
  const distances = results.distances?.[0] ?? [];

  return docs.map((doc, i) => ({
    filePath: String((metas[i] as any)?.filePath ?? ""),
    content: doc ?? "",
    score: 1 - (distances[i] ?? 0),
  }));
}
