import { readFile } from "fs/promises";
import { resolve } from "path";
import { scanDirectory } from "./fileScanner.js";
import { chunkFile } from "./chunker.js";
import { generateEmbeddings } from "./embedder.js";
import { upsertChunks, deleteFileChunks } from "./chromaStore.js";
import type { FileChunk } from "../types.js";

export async function indexFile(filePath: string): Promise<FileChunk[]> {
  const content = await readFile(filePath, "utf-8");
  const chunks = chunkFile(filePath, content);
  if (chunks.length === 0) return [];
  const embeddings = await generateEmbeddings(chunks.map((c) => c.content));
  await upsertChunks(chunks, embeddings);
  return chunks;
}

export async function deleteFile(filePath: string): Promise<void> {
  await deleteFileChunks(filePath);
}

export async function indexProject(projectPath: string): Promise<FileChunk[]> {
  const absPath = resolve(projectPath);
  const files = await scanDirectory(absPath);
  console.log(`Found ${files.length} files. Indexing...`);

  const allChunks: FileChunk[] = [];
  let totalChunks = 0;
  let indexed = 0;

  for (const file of files) {
    try {
      const chunks = await indexFile(file);
      allChunks.push(...chunks);
      totalChunks += chunks.length;
      indexed++;
      process.stdout.write(`\r[${indexed}/${files.length}] Indexed: ${file}`);
    } catch (err) {
      console.error(`\nFailed to index ${file}:`, err);
    }
  }

  console.log(`\nIndexed ${indexed} files, ${totalChunks} chunks total.`);
  return allChunks;
}
