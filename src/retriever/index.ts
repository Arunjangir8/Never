import { detectFilePaths } from "./fileDetector.js";
import { retrieveChunks } from "./retriever.js";
import { buildContext } from "./contextBuilder.js";
import { config } from "../config.js";

export async function getContext(query: string): Promise<string> {
  // 1. Check for explicit file references in the query
  const directFiles = await detectFilePaths(query, config.projectPath);

  if (directFiles.length > 0) {
    const snippets = directFiles.map(
      (f) =>
        `  <file path="${f.filePath}" source="direct">\n` +
        `    <![CDATA[\n${f.content}\n    ]]>\n` +
        `  </file>`
    );
    return `<context>\n${snippets.join("\n")}\n</context>\n\n<query>${query}</query>`;
  }

  // 2. Fall back to vector search + context builder
  const chunks = await retrieveChunks(query);
  return buildContext(chunks, query);
}
