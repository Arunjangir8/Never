import path from "path";
import { config } from "../config.js";
import { FileUpdate, PatchEntry } from "../types.js";


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
function fixLLMEscapes(text: string): string {
  return text.replace(/\\\\"/g, '\\\\\\"');
}

const VALID_ESCAPES = new Set(['"', "\\", "/", "b", "f", "n", "r", "t"]);

function fixInvalidEscapes(text: string): string {
  let result = "";
  let inString = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;

    if (!inString) {
      if (ch === '"') inString = true;
      result += ch;
      continue;
    }

    if (ch === '"') { inString = false; result += ch; continue; }

    if (ch === "\\") {
      const next = text[i + 1];
      if (next === undefined) { result += ch; continue; }
      if (VALID_ESCAPES.has(next)) { result += ch + next; i++; continue; }
      if (next === "u" && /^[0-9a-fA-F]{4}$/.test(text.slice(i + 2, i + 6))) {
        result += text.slice(i, i + 6);
        i += 5;
        continue;
      }
      result += next;
      i++;
      continue;
    }

    result += ch;
  }

  return result;
}

function closeTruncated(text: string): string | null {
  const stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (escaped) { escaped = false; continue; }
    if (ch === "\\" && inString) { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") stack.push("}");
    else if (ch === "[") stack.push("]");
    else if (ch === "}" || ch === "]") stack.pop();
  }

  if (inString || stack.length === 0) return null;
  if (!/[}\]]$/.test(text.trimEnd())) return null;

  return text + stack.reverse().join("");
}

// Pull JSON out of an LLM reply. Tries each candidate until one parses,
// because small models add fences, prose, raw newlines and bad escapes.
export function tryParseJson(text: string): unknown | null {
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
    const fixed = fixLLMEscapes(raw);
    const attempts = [
      raw,
      sanitizeJson(raw),
      replaceBackticks(raw),
      sanitizeJson(replaceBackticks(raw)),
      // Recovery passes for LLM escape mistakes — tried after canonical ones
      fixed,
      sanitizeJson(fixed),
      replaceBackticks(fixed),
      sanitizeJson(replaceBackticks(fixed)),
      fixInvalidEscapes(raw),
      sanitizeJson(fixInvalidEscapes(raw)),
      fixInvalidEscapes(sanitizeJson(raw)),
    ];
    for (const attempt of attempts) {
      try { return JSON.parse(attempt); } catch { }
    }
  }

  for (const raw of candidates) {
    for (const base of [
      raw,
      sanitizeJson(raw),
      fixInvalidEscapes(raw),
      sanitizeJson(fixInvalidEscapes(raw)),
    ]) {
      const closed = closeTruncated(base);
      if (!closed) continue;
      try {
        const parsed: unknown = JSON.parse(closed);
        console.warn(
          "⚠ Response was cut off at the model's output limit — recovered the " +
            "complete files. Ask for fewer files per request to avoid this."
        );
        return parsed;
      } catch { }
    }
  }

  return null;
}

const projectRoot = path.resolve(config.projectPath);

function normalizeRelativePath(p: string): string {
  let cleaned = p.trim();

  cleaned = cleaned.replace(/^[/\\]+/, "");

  if (path.isAbsolute(cleaned) && cleaned.startsWith(projectRoot)) {
    return path.relative(projectRoot, cleaned);
  }

  if (path.isAbsolute(cleaned)) {
    const projectFolderName = path.basename(projectRoot);
    const needle = `/${projectFolderName}/`;
    const idx = cleaned.indexOf(needle);
    if (idx >= 0) return cleaned.slice(idx + 1);
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

function isFlatUpdate(obj: Record<string, unknown>): boolean {
  return typeof obj["updateType"] === "string" &&
    (typeof obj["path"] === "string" || typeof obj["filePath"] === "string");
}

function parseSingleUpdate(relativePath: string, rec: Record<string, unknown>): FileUpdate | null {
  const updateType = String(rec["updateType"] ?? "");
  const summary = String(rec["summary"] ?? `Update ${relativePath}`);

  if (updateType === "createNew") {
    const content = String(rec["content"] ?? "").trim();
    if (!content) { console.warn(`⚠ Empty content for ${relativePath}`); return null; }
    return { type: "createNew", relativePath, content, summary };
  }

  if (updateType === "fullfile") {
    const content = String(rec["fullfile"] ?? "").trim();
    if (!content) { console.warn(`⚠ Empty fullfile for ${relativePath}`); return null; }
    return { type: "fullfile", relativePath, content, summary };
  }

  if (updateType === "patchs") {
    const raw = rec["patchs"];
    if (!Array.isArray(raw) || raw.length === 0) { console.warn(`⚠ Empty patchs for ${relativePath}`); return null; }

    const patches: PatchEntry[] = raw
      .filter((p): p is Record<string, unknown> => !!p && typeof p === "object")
      .map((p) => ({
        find: String(p["find"] ?? ""),
        replace: String(p["replace"] ?? ""),
      }))
      .filter((p) => p.find.length > 0);

    if (patches.length === 0) { console.warn(`⚠ No valid patches for ${relativePath}`); return null; }
    return { type: "patchs", relativePath, patches, summary };
  }

  console.warn(`⚠ Unknown updateType "${updateType}" for ${relativePath}`);
  return null;
}

export function parseUpdates(llmResponse: string): FileUpdate[] {
  const parsed = tryParseJson(llmResponse);

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    console.warn("⚠ No valid JSON detected in LLM response.");
    return [];
  }

  const obj = parsed as Record<string, unknown>;
  const updates: FileUpdate[] = [];

  if (isFlatUpdate(obj)) {
    const rawPath = String(obj["path"] ?? obj["filePath"] ?? "").trim();
    const relativePath = normalizeRelativePath(rawPath);
    if (!relativePath || isPlaceholderPath(relativePath)) {
      console.warn("⚠ Flat update has missing or placeholder path.");
      return [];
    }
    console.warn("⚠ LLM used flat format — recovering...");
    const update = parseSingleUpdate(relativePath, obj);
    if (update) updates.push(update);
    return updates;
  }

  for (const [rawPath, value] of Object.entries(obj)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    if (isPlaceholderPath(rawPath)) { console.warn(`⚠ Skipping placeholder path "${rawPath}"`); continue; }
    const relativePath = normalizeRelativePath(rawPath);
    const update = parseSingleUpdate(relativePath, value as Record<string, unknown>);
    if (update) updates.push(update);
  }

  if (updates.length === 0) console.warn("⚠ No file updates found in LLM response.");
  return updates;
}