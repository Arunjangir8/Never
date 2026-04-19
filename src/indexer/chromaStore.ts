import { ChromaClient } from "chromadb";
import type { Collection } from "chromadb";
import { config } from "../config.js";
import type { FileChunk } from "../types.js";

const client = new ChromaClient({ path: config.chromaUrl });
let collection: Collection | null = null;

async function getCollection(): Promise<Collection> {
  if (!collection) {
    collection = await client.getOrCreateCollection({ name: config.collectionName });
  }
  return collection;
}

export async function upsertChunks(chunks: FileChunk[], embeds: number[][]): Promise<void> {
  const col = await getCollection();
  await col.upsert({
    ids: chunks.map((c) => `${c.filePath}::${c.chunkIndex}`),
    embeddings: embeds,
    documents: chunks.map((c) => c.content),
    metadatas: chunks.map((c) => ({
      filePath: c.filePath,
      startLine: c.startLine,
      endLine: c.endLine,
      chunkIndex: c.chunkIndex,
    })),
  });
}

export async function deleteFileChunks(filePath: string): Promise<void> {
  const col = await getCollection();
  await col.delete({ where: { filePath } });
}
