import path from "path";
import { existsSync } from "fs";
import { config } from "../config.js";
import type { CodeUpdate } from "../types.js";

function sanitizeContent(content: string): string {
  let out = content.trim();
  out = out.replace(/^```\w*\n/, "").replace(/\n```$/, "").trim();
  if (/<\s*complete\s+updated\s+file\s+content/i.test(out)) return "";
  if (/complete\s+updated\s+function\s+block/i.test(out) && out.length < 120) return "";
  return out;
}

function tryParseJson(text: string): unknown | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  // Plain JSON object
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try { return JSON.parse(trimmed); } catch { /* continue */ }
  }

  // Fenced JSON block (model ignored the no-fence rule)
  const fence = trimmed.match(/```json\s*([\s\S]*?)\s*```/i) ?? trimmed.match(/```\s*([\s\S]*?)\s*```/i);
  if (fence?.[1]) {
    try { return JSON.parse(fence[1]); } catch { /* continue */ }
  }

  // JSON embedded in prose — find first balanced { }
  let start = -1, depth = 0, inString = false, escaped = false;
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i]!;
    if (inString) {
      if (escaped) { escaped = false; continue; }
      if (ch === "\\") { escaped = true; continue; }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === "{") { if (depth === 0) start = i; depth++; }
    if (ch === "}") {
      if (depth === 0) continue;
      if (--depth === 0 && start >= 0) {
        try { return JSON.parse(trimmed.slice(start, i + 1)); } catch { break; }
      }
    }
  }

  return null;
}

function resolveFilePath(rawPath: string, projectRoot: string, projectFolderName: string): string {
  const cleaned = rawPath.trim().replace(/^['"`]|['"`]$/g, "");
  if (!cleaned) return "";

  if (path.isAbsolute(cleaned)) {
    if (cleaned.startsWith(projectRoot)) return cleaned;
    const needle = `/${projectFolderName}/`;
    const idx = cleaned.indexOf(needle);
    if (idx >= 0) return path.resolve(projectRoot, cleaned.slice(idx + needle.length));
    return path.resolve(projectRoot, cleaned.replace(/^\/+/, ""));
  }

  let relative = cleaned.replace(/^\.\//, "").replace(/^\/+/, "");
  if (relative.startsWith(`${projectFolderName}/`)) relative = relative.slice(projectFolderName.length + 1);
  return path.resolve(projectRoot, relative);
}

export function parseUpdates(llmResponse: string, _fallbackText = "", allowedPaths: string[] = []): CodeUpdate[] {
  const projectRoot = path.resolve(config.projectPath);
  const projectFolderName = path.basename(projectRoot);

  const normalizedAllowed = new Set(
    allowedPaths
      .map((p) => resolveFilePath(p, projectRoot, projectFolderName))
      .filter(Boolean)
  );

  function isAllowed(filePath: string): boolean {
    if (!filePath.startsWith(projectRoot)) return false;
    if (normalizedAllowed.size > 0 && normalizedAllowed.has(filePath)) return true;
    return existsSync(filePath);
  }

  const parsed = tryParseJson(llmResponse);
  if (!parsed || typeof parsed !== "object") {
    console.warn("\x1b[33m⚠  No JSON detected — LLM gave a general response.\x1b[0m");
    return [];
  }

  const obj = parsed as Record<string, unknown>;
  const rawUpdates = Array.isArray(obj["updates"]) ? obj["updates"] : obj["filePath"] ? [obj] : [];
  const updates: CodeUpdate[] = [];

  for (const item of rawUpdates) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const filePath = resolveFilePath(String(rec["filePath"] ?? ""), projectRoot, projectFolderName);
    const newContent = sanitizeContent(String(rec["newContent"] ?? ""));
    const description = String(rec["description"] ?? `Update ${filePath}`);

    if (!filePath || !newContent) continue;

    if (!isAllowed(filePath)) {
      console.warn(`\x1b[33m⚠  Ignored unsafe target: ${filePath}\x1b[0m`);
      continue;
    }

    updates.push({ filePath, newContent, description });
  }

  if (updates.length === 0) {
    console.warn("\x1b[33m⚠  No file updates found in LLM response.\x1b[0m");
  }

  return updates;
}