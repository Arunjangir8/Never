import { getContext } from "../retriever/index.js";
import { detectQueryType, getModel } from "../llm/modelRouter.js";
import { buildSystemPrompt, buildGeneralSystemPrompt, buildUserPrompt } from "../llm/promptBuilder.js";
import { streamResponse } from "../llm/ollamaClient.js";
import { parseUpdates } from "./updateParser.js";
import { printSources, printSeparator, printError } from "../cli/display.js";
import { folderFileHandler } from "../utils/folderFileHandler.js";

// ─── Main Orchestrator ────────────────────────────────────────────────────────

export async function runQuery(userQuery: string): Promise<void> {

  // 1. VECTOR RETRIEVAL — find relevant files from the codebase
  process.stdout.write("\x1b[2mSearching codebase for relevant context...\x1b[0m\n");
  let context: string;
  try {
    context = await getContext(userQuery);
  } catch (err) {
    printError(err instanceof Error ? err.message : String(err));
    return;
  }

  // Extract sources from JSON context
  let sources: string[] = [];
  try {
    const parsed = JSON.parse(context) as { files?: Array<{ path: string }> };
    sources = [...new Set((parsed.files ?? []).map((f) => f.path))];
  } catch { /* context parse failed, sources stays empty */ }
  if (sources.length > 0) printSources(sources);
  printSeparator();

  // 2. LLM — stream response using user query + retrieved file context
  process.stdout.write("\n\x1b[1mOptimus:\x1b[0m ");

  const type = detectQueryType(userQuery);
  const model = getModel(type);
  // const { type, model } = await getModel(userQuery); -- uncomment if you want dynamic model selection based on query type

  const systemPrompt =
    type === "general"
      ? buildGeneralSystemPrompt()
      : buildSystemPrompt(context);

  let fullResponse = "";
  try {
    for await (const token of streamResponse(
      systemPrompt,
      buildUserPrompt(userQuery),
      model
    )) {
      process.stdout.write(token);
      fullResponse += token;
    }
  } catch (err) {
    printError(err instanceof Error ? err.message : String(err));
    return;
  }
  console.log("\n");
  printSeparator();

  // General queries end here — no file updates
  if (type === "general") return;

  // 3. PARSE — extract structured updates from LLM response
  const updates = parseUpdates(fullResponse);
  if (updates.length === 0) return;

  // 4. APPLY — route each update to fullfile or patchs handler
  for (const update of updates) {
    console.log(`\n── ${update.summary}`);
    try {
      if (update.type === "fullfile") {
        folderFileHandler.updateFile(update.relativePath, update.content);
        console.log(`\x1b[32m✔ fullfile applied: ${update.relativePath}\x1b[0m`);
      } else {
        folderFileHandler.applyPatches(update.relativePath, update.patches);
        console.log(`\x1b[32m✔ ${update.patches.length} patch(es) applied: ${update.relativePath}\x1b[0m`);
      }
    } catch (err) {
      printError(`Failed on ${update.relativePath}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log("\n\x1b[32m✓ All changes applied successfully.\x1b[0m");
}