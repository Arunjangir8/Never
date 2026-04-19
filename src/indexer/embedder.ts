import { OllamaEmbeddings } from "@langchain/ollama";
import { config } from "../config.js";

const embeddings = new OllamaEmbeddings({
  model: config.embedModel,
  baseUrl: config.ollamaBaseUrl,
});

async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw new Error("Unreachable");
}

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const CONCURRENCY = 3;
  const results: number[][] = new Array(texts.length);

  for (let i = 0; i < texts.length; i += CONCURRENCY) {
    const batch = texts.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map((text) => withRetry(() => embeddings.embedQuery(text)))
    );
    batchResults.forEach((vec, j) => {
      results[i + j] = vec;
    });
  }

  return results;
}
