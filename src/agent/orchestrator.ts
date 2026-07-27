import { getContext } from "../retriever/index.js";
import { detectQueryType, getModel } from "../llm/modelRouter.js";
import { buildGeneralSystemPrompt, buildUserPrompt } from "../llm/promptBuilder.js";
import { streamResponse } from "../llm/ollamaClient.js";
import { planTasks, runTask } from "./subtasks.js";
import {
  printSources,
  printSeparator,
  printError,
  printPlan,
  printTaskHeader,
  printRunSummary,
  printDiff,
  spinner,
  type TaskState,
} from "../cli/display.js";
import { askChoice } from "../cli/prompt.js";
import { applyUpdates } from "./applyUpdates.js";
import { folderFileHandler } from "../utils/folderFileHandler.js";
import type { SubTask } from "../types.js";

import { StateGraph, END, START, Annotation } from "@langchain/langgraph";

type QueryType = "code" | "general";

// Graph state shape
const AgentState = Annotation.Root({
  userQuery:    Annotation<string>(),
  context:      Annotation<string>({ default: () => "", reducer: (_, v) => v }),
  sources:      Annotation<string[]>({ default: () => [], reducer: (_, v) => v }),
  queryType:    Annotation<QueryType>({ default: () => "general", reducer: (_, v) => v }),
  tasks:        Annotation<SubTask[]>({ default: () => [], reducer: (_, v) => v }),
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

// Node 3a (general queries only): stream a conversational answer
async function streamLLMResponse(state: AgentStateType): Promise<Partial<AgentStateType>> {
  process.stdout.write("\n\x1b[1mOptimus:\x1b[0m ");

  const model = getModel("general");
  let fullResponse = "";

  try {
    for await (const token of streamResponse(
      buildGeneralSystemPrompt(),
      buildUserPrompt(state.userQuery),
      model
    )) {
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

// Node 3b: split the request into file-sized subtasks
async function planNode(state: AgentStateType): Promise<Partial<AgentStateType>> {
  const spin = spinner("Planning subtasks…");

  let tasks: SubTask[] = [];
  try {
    tasks = await planTasks(state.userQuery, state.context);
  } catch (err) {
    spin.stop();
    return { error: err instanceof Error ? err.message : String(err) };
  }
  spin.stop();
  if (tasks.length === 0) {
    tasks = [{ file: "", action: "edit", goal: state.userQuery }];
    console.log("\x1b[2mPlanner returned no plan — running as a single task.\x1b[0m");
  } else {
    printPlan(tasks);
  }

  return { tasks };
}

const CHOICES = ["y", "s", "a", "q"] as const;
const PROMPT =
  "\x1b[33m  apply this change?\x1b[0m \x1b[2m[y]es (default) / [s]kip / [a]ll remaining / [q]uit:\x1b[0m ";

function currentContent(relativePath: string): string | null {
  try {
    return folderFileHandler.readFile(relativePath);
  } catch {
    return null;
  }
}

// Node 4: run the tasks one at a time, reviewing and writing each change
async function executeTasks(state: AgentStateType): Promise<Partial<AgentStateType>> {
  const { tasks } = state;
  const states: TaskState[] = tasks.map(() => "pending");
  let applyAll = false;

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i]!;
    printTaskHeader(i, tasks.length, task, states);

    const spin = spinner(`Working on ${task.file || "the request"}…`);
    let updates;
    try {
      updates = await runTask(task, state.userQuery, state.context);
    } catch (err) {
      spin.stop();
      printError(err instanceof Error ? err.message : String(err));
      states[i] = "failed";
      continue;
    }
    spin.stop();

    if (updates.length === 0) {
      printError(`No usable change produced for ${task.file || "this task"}.`);
      states[i] = "failed";
      continue;
    }

    let appliedHere = 0;
    let quit = false;

    for (const update of updates) {
      printDiff(update, update.type === "createNew" ? null : currentContent(update.relativePath));

      if (!applyAll) {
        const answer = await askChoice(PROMPT, CHOICES);
        if (answer === "q") { quit = true; break; }
        if (answer === "s") { console.log("\x1b[2m  skipped.\x1b[0m"); continue; }
        if (answer === "a") applyAll = true;
      }

      const { ok } = applyUpdates([update]);
      appliedHere += ok;
    }

    states[i] = appliedHere > 0 ? "done" : "skipped";

    if (quit) {
      console.log("\n\x1b[2mStopped. Remaining steps were not run.\x1b[0m");
      break;
    }
  }

  printRunSummary(states);
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

// General questions get a streamed answer, code requests get the plan pipeline
function routeAfterQueryType(state: AgentStateType): string {
  return state.queryType === "general" ? "stream_llm" : "plan_tasks";
}

function shouldContinueAfterPlan(state: AgentStateType): string {
  return state.error ? "handle_error" : "execute_tasks";
}

// Build and compile the graph
const graph = new StateGraph(AgentState)
  .addNode("retrieve_context", retrieveContext)
  .addNode("route_query",      routeQuery)
  .addNode("stream_llm",       streamLLMResponse)
  .addNode("plan_tasks",       planNode)
  .addNode("execute_tasks",    executeTasks)
  .addNode("handle_error",     handleError)

  .addEdge(START, "retrieve_context")
  .addConditionalEdges("retrieve_context", shouldContinueAfterRetrieval, {
    route_query:  "route_query",
    handle_error: "handle_error",
  })
  .addConditionalEdges("route_query", routeAfterQueryType, {
    stream_llm: "stream_llm",
    plan_tasks: "plan_tasks",
  })
  .addConditionalEdges("plan_tasks", shouldContinueAfterPlan, {
    execute_tasks: "execute_tasks",
    handle_error:  "handle_error",
  })
  .addConditionalEdges("stream_llm", (s: AgentStateType) => (s.error ? "handle_error" : END), {
    handle_error: "handle_error",
    [END]:        END,
  })
  .addEdge("execute_tasks", END)
  .addEdge("handle_error",  END)
  .compile();

// Entry point
export async function runQuery(userQuery: string): Promise<void> {
  await graph.invoke({ userQuery });
}
