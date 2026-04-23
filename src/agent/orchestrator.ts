import { getContext } from "../retriever/index.js";
import { detectQueryType, getModel } from "../llm/modelRouter.js";
import { buildSystemPrompt, buildGeneralSystemPrompt, buildUserPrompt } from "../llm/promptBuilder.js";
import { streamResponse } from "../llm/ollamaClient.js";
import { parseUpdates } from "./updateParser.js";
import { printSources, printSeparator, printError } from "../cli/display.js";
import { folderFileHandler } from "../utils/folderFileHandler.js";

import { StateGraph, END, START, Annotation } from "@langchain/langgraph";

type QueryType = "code" | "general";

// Graph state shape
const AgentState = Annotation.Root({
  userQuery:    Annotation<string>(),
  context:      Annotation<string>({ default: () => "", reducer: (_, v) => v }),
  sources:      Annotation<string[]>({ default: () => [], reducer: (_, v) => v }),
  queryType:    Annotation<QueryType>({ default: () => "general", reducer: (_, v) => v }),
  fullResponse: Annotation<string>({ default: () => "", reducer: (_, v) => v }),
  error:        Annotation<string | null>({ default: () => null, reducer: (_, v) => v }),
});

type AgentStateType = typeof AgentState.State;

// Node 1: fetch relevant files from vector store
async function retrieveContext(state: AgentStateType): Promise<Partial<AgentStateType>> {
  process.stdout.write("\x1b[2mSearching codebase for relevant context...\x1b[0m\n");

  try {
    const context = await getContext(state.userQuery);

    let sources: string[] = [];
    try {
      const parsed = JSON.parse(context) as { files?: Array<{ path: string }> };
      sources = [...new Set((parsed.files ?? []).map((f) => f.path))];
    } catch { /* sources stays empty if parse fails */ }

    return { context, sources };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

// Node 2: detect query type and pick the right model
async function routeQuery(state: AgentStateType): Promise<Partial<AgentStateType>> {
  const queryType = detectQueryType(state.userQuery) as QueryType;
  return { queryType };
}

// Node 3: stream the LLM response token by token
async function streamLLMResponse(state: AgentStateType): Promise<Partial<AgentStateType>> {
  process.stdout.write("\n\x1b[1mOptimus:\x1b[0m ");

  const systemPrompt =
    state.queryType === "general"
      ? buildGeneralSystemPrompt()
      : buildSystemPrompt(state.context);

  const model = getModel(state.queryType);
  let fullResponse = "";

  try {
    for await (const token of streamResponse(systemPrompt, buildUserPrompt(state.userQuery), model)) {
      process.stdout.write(token);
      fullResponse += token;
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }

  console.log("\n");
  printSeparator();

  return { fullResponse };
}

// Node 4: parse LLM output and apply file changes
async function parseAndApply(state: AgentStateType): Promise<Partial<AgentStateType>> {
  const updates = parseUpdates(state.fullResponse);
  if (updates.length === 0) return {};

  for (const update of updates) {
    console.log(`\n${update.summary}`);
    try {
      if (update.type === "fullfile") {
        folderFileHandler.updateFile(update.relativePath, update.content);
        console.log(`\x1b[32m✔ fullfile applied: ${update.relativePath}\x1b[0m`);
      } else if (update.type === "patchs") {
        folderFileHandler.applyPatches(update.relativePath, update.patches);
        console.log(`\x1b[32m✔ ${update.patches.length} patch(es) applied: ${update.relativePath}\x1b[0m`);
      } else if (update.type === "createNew") {
        folderFileHandler.createFile(update.relativePath, update.content);
        console.log(`\x1b[32m✔ file created: ${update.relativePath}\x1b[0m`);
      }
    } catch (err) {
      printError(`Failed on ${update.relativePath}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log("\n\x1b[32m✓ All changes applied successfully.\x1b[0m");
  return {};
}

// Error handler node
function handleError(state: AgentStateType): Partial<AgentStateType> {
  printError(state.error ?? "Unknown error");
  return {};
}

// Decide what to do after retrieval
function shouldContinueAfterRetrieval(state: AgentStateType): string {
  if (state.error) return "handle_error";
  if (state.sources.length > 0) {
    printSources(state.sources);
    printSeparator();
  }
  return "route_query";
}

// Decide what to do after streaming
function shouldContinueAfterStream(state: AgentStateType): string {
  if (state.error) return "handle_error";
  if (state.queryType === "general") return END;
  return "parse_and_apply";
}

// Build and compile the graph
const graph = new StateGraph(AgentState)
  .addNode("retrieve_context", retrieveContext)
  .addNode("route_query",      routeQuery)
  .addNode("stream_llm",       streamLLMResponse)
  .addNode("parse_and_apply",  parseAndApply)
  .addNode("handle_error",     handleError)

  .addEdge(START, "retrieve_context")
  .addConditionalEdges("retrieve_context", shouldContinueAfterRetrieval, {
    route_query:  "route_query",
    handle_error: "handle_error",
  })
  .addEdge("route_query", "stream_llm")
  .addConditionalEdges("stream_llm", shouldContinueAfterStream, {
    parse_and_apply: "parse_and_apply",
    handle_error:    "handle_error",
    [END]:           END,
  })
  .addEdge("parse_and_apply", END)
  .addEdge("handle_error",    END)
  .compile();

// Entry point
export async function runQuery(userQuery: string): Promise<void> {
  await graph.invoke({ userQuery });
}