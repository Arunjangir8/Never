import { StateGraph, END, START, Annotation } from "@langchain/langgraph";
import { BlueFix, FileChunk, FileUpdate, PipelineMode, RedFinding } from "../../types.js";
import { runRedAgent } from "./redAgent.js";
import { printBlueFindings, printError, printRedFindings, printSeparator } from "../../cli/display.js";
import { askUserPermission } from "../../cli/prompt.js";
import { runBlueAgent } from "./blueAgent.js";
import { parseUpdates } from "../updateParser.js";
import { folderFileHandler } from "../../utils/folderFileHandler.js";

const PipelineState = Annotation.Root({
  chunks: Annotation<FileChunk[]>(),
  mode: Annotation<PipelineMode>(),
  redFindings: Annotation<RedFinding[]>({ default: () => [], reducer: (_, v) => v }),
  userApprovedFix: Annotation<boolean>({ default: () => false, reducer: (_, v) => v }),
  blueUpdates: Annotation<FileUpdate[]>({ default: () => [], reducer: (_, v) => v }),
  applyApproved: Annotation<boolean>({ default: () => false, reducer: (_, v) => v }),
  error: Annotation<string | null>({ default: () => null, reducer: (_, v) => v }),
});

type PipelineStateType = typeof PipelineState.State;

// Node 1: Red Agent

async function redNode(state: PipelineStateType): Promise<Partial<PipelineStateType>> {
  console.log("\n\x1b[31m[Red Agent]\x1b[0m Analyzing chunks...\n");

  try {
    const redFindings: RedFinding[] = [];

    for (const chunk of state.chunks) {
      const finding = await runRedAgent(chunk);
      if (finding) {
        redFindings.push(finding);
        printRedFindings(finding);
        printSeparator();
      }
    }

    return { redFindings };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

// Node 2: Permission

async function permissionNode(state: PipelineStateType): Promise<Partial<PipelineStateType>> {
  const hasFindings = state.redFindings.some(
    (f) => f.bugs.length > 0 || f.edge_cases.length > 0 || f.risks.length > 0
  );

  if (!hasFindings) {
    console.log("\n\x1b[32m✔ No issues found. Skipping Blue Agent.\x1b[0m\n");
    return { userApprovedFix: false };
  }

  const approved = await askUserPermission(
    "\n\x1b[33m Send findings to Blue Agent (Fixer)? (y/n): \x1b[0m"
  );

  return { userApprovedFix: approved };
}

// Node 3: Blue Agent

async function blueNode(state: PipelineStateType): Promise<Partial<PipelineStateType>> {
  console.log("\n\x1b[34m[Blue Agent]\x1b[0m Generating fixes...\n");

  try {
    const blueUpdates: FileUpdate[] = [];

    for (const finding of state.redFindings) {
      const fix = await runBlueAgent(finding);
      if (fix) {
        blueUpdates.push(...fix);
        printBlueFindings(fix);
        printSeparator();
      }
    }
    return { blueUpdates };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

// Node 4: Apply Permission

async function applyPermissionNode(
  state: PipelineStateType
): Promise<Partial<PipelineStateType>> {

  if (!state.blueUpdates || state.blueUpdates.length === 0) {
    console.log("\n\x1b[2mNo updates to apply.\x1b[0m\n");
    return { applyApproved: false };
  }

  const approved = await askUserPermission(
    "\n\x1b[33m Apply these fixes to files? (y/n): \x1b[0m"
  );

  return { applyApproved: approved };
}

// Node 5: parse LLM output and apply file changes
async function parseAndApply(state: PipelineStateType): Promise<Partial<PipelineStateType>> {
  const updates = state.blueUpdates;
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

// Error Node

function handleError(state: PipelineStateType): Partial<PipelineStateType> {
  console.error(`\n\x1b[31m✖ Pipeline error:\x1b[0m ${state.error ?? "Unknown error"}`);
  return {};
}

// Conditional Edges

function shouldContinueAfterRed(state: PipelineStateType): string {
  if (state.error) return "handle_error";
  return "permission";
}

function shouldContinueAfterPermission(state: PipelineStateType): string {
  if (state.error) return "handle_error";
  if (!state.userApprovedFix) return END;
  return "blue";
}

function shouldContinueAfterBlue(state: PipelineStateType): string {
  if (state.error) return "handle_error";
  return "apply_permission";
}

function shouldContinueAfterApplyPermission(state: PipelineStateType): string {
  if (state.error) return "handle_error";
  if (!state.applyApproved) return END;
  return "parse_and_apply";
}

const graph = new StateGraph(PipelineState)
  .addNode("red", redNode)
  .addNode("permission", permissionNode)
  .addNode("blue", blueNode)
  .addNode("apply_permission", applyPermissionNode)
  .addNode("parse_and_apply", parseAndApply)
  .addNode("handle_error", handleError)

  .addEdge(START, "red")

  .addConditionalEdges("red", shouldContinueAfterRed, {
    permission: "permission",
    handle_error: "handle_error",
  })

  .addConditionalEdges("permission", shouldContinueAfterPermission, {
    blue: "blue",
    handle_error: "handle_error",
    [END]: END,
  })

  .addConditionalEdges("blue", shouldContinueAfterBlue, {
    apply_permission: "apply_permission",
    handle_error: "handle_error",
  })

  .addConditionalEdges("apply_permission", shouldContinueAfterApplyPermission, {
    parse_and_apply: "parse_and_apply",
    handle_error: "handle_error",
    [END]: END,
  })

  .addEdge("parse_and_apply", END)
  .addEdge("handle_error", END)
  .compile();

export async function runPipeline(
  chunks: FileChunk[],
  mode: PipelineMode
): Promise<void> {
  await graph.invoke({ chunks, mode });
}