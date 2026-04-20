import path from "path";
import { existsSync } from "fs";
import { config } from "../config.js";
import type { CodeUpdate } from "../types.js";

const UPDATE_RE = /={3}START_UPDATE(?:\s*:\s*([^\n=]+?))?=+\s*\n([\s\S]*?)={3}END_UPDATE=+/g;

function extractPathFromText(text: string): string | null {
  const pathRe = /(?:^|[\s"'`(])((?:\.?\.?\/|\/)?[A-Za-z0-9_.\-/]+\.[A-Za-z0-9]+)(?=$|[\s"'`),.:;])/g;
  let m: RegExpExecArray | null;
  while ((m = pathRe.exec(text)) !== null) {
    const candidate = m[1];
    if (!candidate) continue;
    if (/^https?:\/\//i.test(candidate)) continue;
    return candidate;
  }
  return null;
}

function sanitizeContent(content: string): string {
  let out = content.trim();

  // Strip accidental markdown fences inside update blocks
  out = out.replace(/^```\w*\n/, "").replace(/\n```$/, "").trim();

  // Strip accidental array-like wrapper:
  // [
  //   ...code...
  // ]
  if (out.startsWith("[") && out.endsWith("]")) {
    const lines = out.split("\n");
    if (lines.length >= 2 && lines[0]!.trim() === "[" && lines[lines.length - 1]!.trim() === "]") {
      out = lines.slice(1, -1).join("\n").trim();
    }
  }

  // Ignore prompt-template placeholders accidentally returned by the model.
  if (/<\s*complete\s+updated\s+file\s+content/i.test(out)) return "";
  if (/complete\s+updated\s+function\s+block/i.test(out) && out.length < 120) return "";

  return out;
}

function tryParseJsonObject(text: string): unknown | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  // Raw JSON object response
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      return JSON.parse(trimmed);
    } catch {
      // continue
    }
  }

  // ```json ... ``` fenced response
  const fence = trimmed.match(/```json\s*([\s\S]*?)\s*```/i) ?? trimmed.match(/```\s*([\s\S]*?)\s*```/i);
  if (fence?.[1]) {
    try {
      return JSON.parse(fence[1]);
    } catch {
      // continue
    }
  }

  // Prose + JSON mixed response: extract first balanced object and parse it.
  const candidate = extractFirstJsonObject(trimmed);
  if (candidate) {
    try {
      return JSON.parse(candidate);
    } catch {
      // continue
    }
  }

  return null;
}

function extractFirstJsonObject(text: string): string | null {
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === "{") {
      if (depth === 0) start = i;
      depth += 1;
      continue;
    }

    if (ch === "}") {
      if (depth === 0) continue;
      depth -= 1;
      if (depth === 0 && start >= 0) {
        return text.slice(start, i + 1);
      }
    }
  }

  return null;
}

function extractJsonUpdates(parsed: unknown): Array<{ filePath: string; newContent: string; description: string }> {
  if (!parsed || typeof parsed !== "object") return [];

  const obj = parsed as Record<string, unknown>;
  const updates: Array<{ filePath: string; newContent: string; description: string }> = [];

  const rawUpdates = Array.isArray(obj["updates"]) ? (obj["updates"] as unknown[]) : [];
  for (const item of rawUpdates) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const filePath = typeof rec["filePath"] === "string" ? rec["filePath"].trim() : "";
    const newContent = typeof rec["newContent"] === "string" ? sanitizeContent(rec["newContent"]) : "";
    const description = typeof rec["description"] === "string" ? rec["description"] : `Update ${filePath}`;
    if (filePath && newContent) updates.push({ filePath, newContent, description });
  }

  // Also support single-object format: { "filePath": "...", "newContent": "..." }
  if (updates.length === 0) {
    const filePath = typeof obj["filePath"] === "string" ? obj["filePath"].trim() : "";
    const newContent = typeof obj["newContent"] === "string" ? sanitizeContent(obj["newContent"]) : "";
    const description = typeof obj["description"] === "string" ? obj["description"] : `Update ${filePath}`;
    if (filePath && newContent) updates.push({ filePath, newContent, description });
  }

  return updates;
}

function extractLooseJsonLikeUpdates(text: string): Array<{ filePath: string; newContent: string; description: string }> {
  const updates: Array<{ filePath: string; newContent: string; description: string }> = [];

  // Handles model outputs that resemble JSON but are not valid JSON.
  // Example:
  // {
  //   "updates": [{ "filePath": "...", "newContent": "...unescaped \"..." }]
  // }
  const blockRe = /"filePath"\s*:\s*"([^"]+)"[\s\S]*?"newContent"\s*:\s*"([\s\S]*?)"\s*}\s*[,\]]/g;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(text)) !== null) {
    const filePath = m[1]?.trim() ?? "";
    const raw = m[2] ?? "";
    if (!filePath || !raw) continue;

    const newContent = sanitizeContent(
      raw
        .replace(/\\n/g, "\n")
        .replace(/\\t/g, "\t")
        .replace(/\\r/g, "\r")
        .replace(/\\"/g, '"')
    );
    if (!newContent) continue;
    updates.push({ filePath, newContent, description: `Update ${filePath}` });
  }

  return updates;
}

export function parseUpdates(llmResponse: string, fallbackText = "", allowedPaths: string[] = []): CodeUpdate[] {
  const updates: CodeUpdate[] = [];
  const fallbackPath = extractPathFromText(fallbackText);
  const projectRoot = path.resolve(config.projectPath);
  const projectFolderName = path.basename(projectRoot);
  const normalizedAllowed = new Set(
    allowedPaths
      .map((p) => p && resolveFilePath(p, projectRoot, projectFolderName))
      .filter((p): p is string => Boolean(p))
  );

  function isAllowedTarget(filePath: string): boolean {
    if (!filePath.startsWith(projectRoot)) return false;
    if (normalizedAllowed.size > 0 && normalizedAllowed.has(filePath)) return true;
    if (existsSync(filePath)) return true;
    return false;
  }

  // Preferred: strict JSON object output
  const parsedJson = tryParseJsonObject(llmResponse);
  if (parsedJson) {
    for (const jsonUpdate of extractJsonUpdates(parsedJson)) {
      const filePath = resolveFilePath(jsonUpdate.filePath, projectRoot, projectFolderName);
      if (!filePath || !jsonUpdate.newContent) continue;
      if (!isAllowedTarget(filePath)) {
        console.warn(`\x1b[33m⚠  Ignored unsafe/new target: ${filePath}\x1b[0m`);
        continue;
      }
      updates.push({ filePath, newContent: jsonUpdate.newContent, description: jsonUpdate.description });
    }
    if (updates.length > 0) return updates;
  }

  // Fallback: malformed JSON-like payload (common model behavior with unescaped quotes)
  for (const loose of extractLooseJsonLikeUpdates(llmResponse)) {
    const filePath = resolveFilePath(loose.filePath, projectRoot, projectFolderName);
    if (!filePath || !loose.newContent) continue;
    if (!isAllowedTarget(filePath)) {
      console.warn(`\x1b[33m⚠  Ignored unsafe/new target: ${filePath}\x1b[0m`);
      continue;
    }
    updates.push({ filePath, newContent: loose.newContent, description: loose.description });
  }
  if (updates.length > 0) return updates;

  let match: RegExpExecArray | null;
  while ((match = UPDATE_RE.exec(llmResponse)) !== null) {
    const rawPath = (match[1] ?? fallbackPath ?? "").trim();
    const filePath = resolveFilePath(rawPath, projectRoot, projectFolderName);
    const newContent = sanitizeContent(match[2] ?? "");
    if (filePath && newContent && isAllowedTarget(filePath)) {
      updates.push({ filePath, newContent, description: `Update ${rawPath}` });
    } else if (filePath && newContent) {
      console.warn(`\x1b[33m⚠  Ignored unsafe/new target: ${filePath}\x1b[0m`);
    }
  }

  // Fallback: markdown code block with a file path comment on the first line
  // e.g. ```typescript\n// src/index.ts\n...```
  if (updates.length === 0) {
    const fallback = /```(?:\w+)?\n\/\/\s*(.+?\.[a-z]+)\n([\s\S]*?)```/g;
    while ((match = fallback.exec(llmResponse)) !== null) {
      const filePath = resolveFilePath(match[1]!.trim(), projectRoot, projectFolderName);
      const newContent = sanitizeContent(match[2] ?? "");
      if (filePath && newContent && isAllowedTarget(filePath)) {
        updates.push({ filePath, newContent, description: `Fallback update ${match[1]!.trim()}` });
        console.warn("\x1b[33m⚠  Used fallback parser — LLM ignored START_UPDATE markers.\x1b[0m");
        console.warn("\x1b[33m   Tip: re-run your query if the context was insufficient.\x1b[0m");
      } else if (filePath && newContent) {
        console.warn(`\x1b[33m⚠  Ignored unsafe/new target: ${filePath}\x1b[0m`);
      }
    }
  }

  if (updates.length === 0) {
    console.warn("\x1b[33m⚠  No file updates detected in LLM response.\x1b[0m");
    console.warn("\x1b[33m   The LLM may have given an explanation only, or ignored the output format.\x1b[0m");
  }

  return updates;
}

function resolveFilePath(rawPath: string, projectRoot: string, projectFolderName: string): string {
  const cleaned = rawPath.trim().replace(/^['"`]|['"`]$/g, "");
  if (!cleaned) return "";

  // Absolute path already inside project root
  if (path.isAbsolute(cleaned)) {
    if (cleaned.startsWith(projectRoot)) return cleaned;

    // Handle paths like /my-project/index.ts when projectRoot already ends with my-project
    const needle = `/${projectFolderName}/`;
    const idx = cleaned.indexOf(needle);
    if (idx >= 0) {
      const relInsideProject = cleaned.slice(idx + needle.length);
      return path.resolve(projectRoot, relInsideProject);
    }

    // Last resort: map absolute-looking path to project relative to avoid writing outside workspace
    return path.resolve(projectRoot, cleaned.replace(/^\/+/, ""));
  }

  let relative = cleaned.replace(/^\.\//, "").replace(/^\/+/, "");

  // Avoid duplicating my-project/my-project/... when model returns project-prefixed path
  const projectPrefix = `${projectFolderName}/`;
  if (relative.startsWith(projectPrefix)) {
    relative = relative.slice(projectPrefix.length);
  }

  return path.resolve(projectRoot, relative);
}
