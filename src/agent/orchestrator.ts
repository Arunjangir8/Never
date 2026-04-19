import { getContext } from "../retriever/index.js";
import { queryLLM } from "../llm/index.js";
import { parseUpdates } from "./updateParser.js";
import { applyAllUpdates } from "./patcher.js";
import { printSources, printSeparator, printError } from "../cli/display.js";

export async function runQuery(userQuery: string): Promise<void> {
  // 1. Retrieve context
  process.stdout.write("\x1b[2mSearching codebase for relevant context...\x1b[0m\n");
  let context: string;
  try {
    context = await getContext(userQuery);
  } catch (err) {
    printError(err instanceof Error ? err.message : String(err));
    return;
  }

  // 2. Show which files were pulled as context
  const sources = [...context.matchAll(/path="([^"]+)"/g)].map((m) => m[1]!);
  if (sources.length > 0) printSources([...new Set(sources)]);

  // 3. Stream LLM response
  printSeparator();
  process.stdout.write("\n\x1b[1mOptimus:\x1b[0m ");

  let fullResponse = "";
  try {
    for await (const token of queryLLM(userQuery, context)) {
      process.stdout.write(token);
      fullResponse += token;
    }
  } catch (err) {
    printError(err instanceof Error ? err.message : String(err));
    return;
  }

  console.log("\n");
  printSeparator();

  // 4. Parse and apply any code updates
  const updates = parseUpdates(fullResponse);
  if (updates.length > 0) {
    console.log(`\n\x1b[33m⚡ ${updates.length} code update(s) detected.\x1b[0m`);
    await applyAllUpdates(updates);
  }
}
