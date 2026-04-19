import { readFile } from "fs/promises";
import { resolve } from "path";
import { scanDirectory } from "./fileScanner.js";
import { chunkFile } from "./chunker.js";
import { generateEmbeddings } from "./embedder.js";
import { upsertChunks, deleteFileChunks } from "./chromaStore.js";
import type { FileChunk } from "../types.js";

export async function indexFile(filePath: string): Promise<number> {
  const content = await readFile(filePath, "utf-8");
  const chunks = chunkFile(filePath, content);
  if (chunks.length === 0) return 0;
  const embeddings = await generateEmbeddings(chunks.map((c) => c.content));
  await upsertChunks(chunks, embeddings);
  return chunks.length;
}

export async function deleteFile(filePath: string): Promise<void> {
  await deleteFileChunks(filePath);
}

export async function indexProject(projectPath: string): Promise<void> {
  const absPath = resolve(projectPath);
  const files = await scanDirectory(absPath);
  console.log(`Found ${files.length} files. Indexing...`);

  let totalChunks = 0;
  let indexed = 0;

  for (const file of files) {
    try {
      const count = await indexFile(file);
      totalChunks += count;
      indexed++;
      process.stdout.write(`\r[${indexed}/${files.length}] Indexed: ${file}`);
    } catch (err) {
      console.error(`\nFailed to index ${file}:`, err);
    }
  }

  console.log(`\nIndexed ${indexed} files, ${totalChunks} chunks total.`);
}
