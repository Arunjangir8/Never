import { generateResponse } from "../llm/ollamaClient.js";
import { getModel } from "../llm/modelRouter.js";
import { parseUpdates, tryParseJson } from "./updateParser.js";
import {
  buildPlannerSystemPrompt,
  buildPlannerUserPrompt,
  buildSystemPrompt,
  buildTaskSystemPrompt,
  buildTaskUserPrompt,
  buildUserPrompt,
} from "../llm/promptBuilder.js";
import { folderFileHandler } from "../utils/folderFileHandler.js";
import type { FileUpdate, SubTask } from "../types.js";

const MAX_TASKS = 6;

function isPlaceholder(p: string): boolean {
  return p.includes("<") || /^(relative\/)?path\/to\//.test(p);
}

export function parsePlan(raw: string): SubTask[] {
  const parsed = tryParseJson(raw);
  if (!parsed || typeof parsed !== "object") return [];

  const list = (parsed as { tasks?: unknown }).tasks;
  if (!Array.isArray(list)) return [];

  const tasks: SubTask[] = [];
  const seen = new Set<string>();

  for (const entry of list) {
    if (!entry || typeof entry !== "object") continue;
    const rec = entry as Record<string, unknown>;

    const file = String(rec["file"] ?? rec["path"] ?? "").trim().replace(/^[/\\]+/, "");
    const goal = String(rec["goal"] ?? rec["instruction"] ?? rec["summary"] ?? "").trim();
    if (!file || !goal || isPlaceholder(file)) continue;
    if (seen.has(file)) continue;

    seen.add(file);
    tasks.push({
      file,
      action: rec["action"] === "create" ? "create" : "edit",
      goal,
    });
    if (tasks.length === MAX_TASKS) break;
  }

  return tasks;
}

export async function planTasks(query: string, context: string): Promise<SubTask[]> {
  const raw = await generateResponse(
    buildPlannerSystemPrompt(context),
    buildPlannerUserPrompt(query),
    getModel("code"),
    true
  );
  return parsePlan(raw);
}

function taskContext(task: SubTask): string {
  if (task.action === "create") {
    return JSON.stringify({ files: [], note: `${task.file} does not exist yet` }, null, 2);
  }

  try {
    return JSON.stringify(
      { files: [{ path: task.file, content: folderFileHandler.readFile(task.file) }] },
      null,
      2
    );
  } catch {
    return JSON.stringify({ files: [], note: `${task.file} not found on disk` }, null, 2);
  }
}

export async function runTask(
  task: SubTask,
  originalQuery: string,
  fullContext: string
): Promise<FileUpdate[]> {
  const auto = task.file === "";

  const system = auto
    ? buildSystemPrompt(fullContext)
    : buildTaskSystemPrompt(task, taskContext(task));
  const user = auto
    ? buildUserPrompt(originalQuery)
    : buildTaskUserPrompt(task, originalQuery);

  const model = getModel("code");

  let updates = parseUpdates(await generateResponse(system, user, model, true));

  if (updates.length === 0) {
    const retry = await generateResponse(
      system,
      `${user}\n\nYour previous answer was not valid JSON. Return ONLY the JSON object, nothing else.`,
      model,
      true
    );
    updates = parseUpdates(retry);
  }

  if (auto) return updates;

  const onTarget = updates.filter((u) => u.relativePath === task.file);
  return onTarget.length > 0 ? onTarget : updates;
}
