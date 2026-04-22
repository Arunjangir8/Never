import path from "path";
import { config } from "../config.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export type PatchEntry = {
  lineFrom: number;
  lineTo: number;
  patch: string;
};

export type FileUpdate =
  | { type: "fullfile"; relativePath: string; content: string; summary: string }
  | { type: "patchs"; relativePath: string; patches: PatchEntry[]; summary: string };

// ── Sanitizers ────────────────────────────────────────────────────────────────

// Fix 1: Replace backtick template literals with proper JSON double-quoted strings
function replaceBackticks(text: string): string {
  return text.replace(/`([\s\S]*?)`/g, (_, inner: string) => {
    const escaped = inner
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\n/g, "\\n")
      .replace(/\r/g, "\\r")
      .replace(/\t/g, "\\t");
    return `"${escaped}"`;
  });
}

// Fix 2: Escape unescaped newlines/tabs inside JSON string values
function sanitizeJson(text: string): string {
  let result = "";
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;

    if (escaped) { result += ch; escaped = false; continue; }
    if (ch === "\\" && inString) { result += ch; escaped = true; continue; }
    if (ch === '"') { inString = !inString; result += ch; continue; }

    if (inString) {
      if (ch === "\n") { result += "\\n"; continue; }
      if (ch === "\r") { result += "\\r"; continue; }
      if (ch === "\t") { result += "\\t"; continue; }
    }

    result += ch;
  }

  return result;
}

// ── JSON Parser ───────────────────────────────────────────────────────────────

function tryParseJson(text: string): unknown | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const candidates: string[] = [];

  const fence =
    trimmed.match(/```json\s*([\s\S]*?)\s*```/i) ??
    trimmed.match(/```\s*([\s\S]*?)\s*```/i);
  if (fence?.[1]) candidates.push(fence[1]);

  if (trimmed.startsWith("{")) candidates.push(trimmed);

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) candidates.push(trimmed.slice(start, end + 1));

  for (const raw of candidates) {
    // Try: as-is → backtick-fixed → sanitized → both fixes combined
    const attempts = [
      raw,
      sanitizeJson(raw),
      replaceBackticks(raw),
      sanitizeJson(replaceBackticks(raw)),
    ];
    for (const attempt of attempts) {
      try { return JSON.parse(attempt); } catch { /* continue */ }
    }
  }

  return null;
}

// ── Path Helpers ──────────────────────────────────────────────────────────────

const projectRoot = path.resolve(config.projectPath);

function normalizeRelativePath(p: string): string {
  const cleaned = p.trim();

  // If absolute path within project root, make it relative
  if (path.isAbsolute(cleaned) && cleaned.startsWith(projectRoot)) {
    return path.relative(projectRoot, cleaned);
  }

  // If absolute but not under root, try to find "my-project/" segment
  if (path.isAbsolute(cleaned)) {
    const projectFolderName = path.basename(projectRoot);
    const needle = `/${projectFolderName}/`;
    const idx = cleaned.indexOf(needle);
    if (idx >= 0) return cleaned.slice(idx + 1); // keep "my-project/..."
  }

  return cleaned;
}

function isPlaceholderPath(p: string): boolean {
  return (
    p.includes("<") ||
    p === "relative/path/to/file.ts" ||
    p === "path/to/file.ts" ||
    p === "<EXACT relative path from context>"
  );
}

// ── Single Update Parser ──────────────────────────────────────────────────────

function isFlatUpdate(obj: Record<string, unknown>): boolean {
  return typeof obj["updateType"] === "string" &&
    (typeof obj["path"] === "string" || typeof obj["filePath"] === "string");
}

function parseSingleUpdate(relativePath: string, rec: Record<string, unknown>): FileUpdate | null {
  const updateType = String(rec["updateType"] ?? "");
  const summary = String(rec["summary"] ?? `Update ${relativePath}`);

  if (updateType === "fullfile") {
    const content = String(rec["fullfile"] ?? "").trim();
    if (!content) { console.warn(`\x1b[33m⚠  Empty fullfile for ${relativePath}\x1b[0m`); return null; }
    return { type: "fullfile", relativePath, content, summary };
  }

  if (updateType === "patchs") {
    const raw = rec["patchs"];
    if (!Array.isArray(raw) || raw.length === 0) { console.warn(`\x1b[33m⚠  Empty patchs for ${relativePath}\x1b[0m`); return null; }
    const patches: PatchEntry[] = raw
      .filter((p): p is Record<string, unknown> => !!p && typeof p === "object")
      .map((p) => ({
        lineFrom: Number(p["lineFrom"]),
        lineTo: Number(p["lineTo"]),
        patch: String(p["patch"] ?? ""),
      }))
      .filter((p) => p.lineFrom > 0 && p.lineTo >= p.lineFrom);
    if (patches.length === 0) { console.warn(`\x1b[33m⚠  No valid patches for ${relativePath}\x1b[0m`); return null; }
    return { type: "patchs", relativePath, patches, summary };
  }

  console.warn(`\x1b[33m⚠  Unknown updateType "${updateType}" for ${relativePath}\x1b[0m`);
  return null;
}

// ── Main Export ───────────────────────────────────────────────────────────────

export function parseUpdates(llmResponse: string): FileUpdate[] {
  const parsed = tryParseJson(llmResponse);

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    console.warn("\x1b[33m⚠  No valid JSON detected in LLM response.\x1b[0m");
    return [];
  }

  const obj = parsed as Record<string, unknown>;
  const updates: FileUpdate[] = [];

  // Fallback: flat { "path": "...", "updateType": "..." }
  if (isFlatUpdate(obj)) {
    const rawPath = String(obj["path"] ?? obj["filePath"] ?? "").trim();
    const relativePath = normalizeRelativePath(rawPath);
    if (!relativePath || isPlaceholderPath(relativePath)) {
      console.warn("\x1b[33m⚠  Flat update has missing or placeholder path.\x1b[0m");
      return [];
    }
    console.warn(`\x1b[33m⚠  LLM used flat format — recovering...\x1b[0m`);
    const update = parseSingleUpdate(relativePath, obj);
    if (update) updates.push(update);
    return updates;
  }

  // Normal: { "my-project/index.ts": { ... } }
  for (const [rawPath, value] of Object.entries(obj)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    if (isPlaceholderPath(rawPath)) {
      console.warn(`\x1b[33m⚠  Skipping placeholder path "${rawPath}"\x1b[0m`);
      continue;
    }
    const relativePath = normalizeRelativePath(rawPath);
    const update = parseSingleUpdate(relativePath, value as Record<string, unknown>);
    if (update) updates.push(update);
  }

  if (updates.length === 0) console.warn("\x1b[33m⚠  No file updates found in LLM response.\x1b[0m");
  return updates;
}