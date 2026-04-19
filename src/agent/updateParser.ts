import { resolve } from "path";
import { config } from "../config.js";
import type { CodeUpdate } from "../types.js";

const UPDATE_RE = /===START_UPDATE:\s*(.+?)===\n([\s\S]*?)===END_UPDATE===/g;

export function parseUpdates(llmResponse: string): CodeUpdate[] {
  const updates: CodeUpdate[] = [];
  let match: RegExpExecArray | null;

  while ((match = UPDATE_RE.exec(llmResponse)) !== null) {
    const rawPath = match[1]!.trim();
    const newContent = match[2]!.trimEnd();
    const filePath = resolve(config.projectPath, rawPath);

    // Extract a one-line description from the text immediately before the block
    const before = llmResponse.slice(0, match.index).trimEnd();
    const lastLine = before.split("\n").at(-1)?.trim() ?? "";
    const description = lastLine.length > 0 && lastLine.length < 120 ? lastLine : `Update ${rawPath}`;

    updates.push({ filePath, newContent, description });
  }

  return updates;
}
