import { readFile, writeFile, copyFile, access } from "fs/promises";
import { dirname } from "path";
import { mkdir } from "fs/promises";
import type { CodeUpdate } from "../types.js";
import { config } from "../config.js";

const R = "\x1b[31m";
const G = "\x1b[32m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

// ── Diff ──────────────────────────────────────────────────────────────────────

type Op = { type: "eq" | "add" | "del"; line: string };

function diffLines(a: string[], b: string[]): Op[] {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--)
    for (let j = n - 1; j >= 0; j--)
      dp[i]![j] = a[i] === b[j] ? 1 + dp[i + 1]![j + 1]! : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);

  const ops: Op[] = [];
  let i = 0, j = 0;
  while (i < m || j < n) {
    if (i < m && j < n && a[i] === b[j]) { ops.push({ type: "eq",  line: a[i]! }); i++; j++; }
    else if (j < n && (i >= m || dp[i]![j + 1]! >= dp[i + 1]![j]!)) { ops.push({ type: "add", line: b[j]! }); j++; }
    else { ops.push({ type: "del", line: a[i]! }); i++; }
  }
  return ops;
}

function showDiff(filePath: string, original: string, updated: string): void {
  const ops = diffLines(original.split("\n"), updated.split("\n"));
  if (!ops.some((o) => o.type !== "eq")) { console.log(`${DIM}  No changes.${RESET}`); return; }

  const changed = new Set<number>();
  ops.forEach((op, i) => { if (op.type !== "eq") changed.add(i); });
  const visible = new Set<number>();
  for (const idx of changed)
    for (let k = idx - 3; k <= idx + 3; k++)
      if (k >= 0 && k < ops.length) visible.add(k);

  console.log(`\n${DIM}--- ${filePath} (original)${RESET}`);
  console.log(`${DIM}+++ ${filePath} (updated)${RESET}\n`);
  let last = -1;
  for (let i = 0; i < ops.length; i++) {
    if (!visible.has(i)) continue;
    if (last !== -1 && i > last + 1) console.log(`${DIM}  ...${RESET}`);
    const op = ops[i]!;
    if (op.type === "add") console.log(`${G}+ ${op.line}${RESET}`);
    else if (op.type === "del") console.log(`${R}- ${op.line}${RESET}`);
    else console.log(`${DIM}  ${op.line}${RESET}`);
    last = i;
  }
}

function summarizeDiff(original: string, updated: string): string {
  const ops = diffLines(original.split("\n"), updated.split("\n"));
  return `${ops.filter((o) => o.type === "add").length} lines added, ${ops.filter((o) => o.type === "del").length} lines removed`;
}

// ── Patcher ───────────────────────────────────────────────────────────────────

function bakPath(filePath: string): string { return `${filePath}.optimus.bak`; }

export async function applyUpdate(update: CodeUpdate): Promise<void> {
  let original: string | null = null;
  try { original = await readFile(update.filePath, "utf-8"); } catch {
    if (!config.allowNewFiles) {
      console.log(`\x1b[33m⚠ Skipped new file (ALLOW_NEW_FILES=false): ${update.filePath}\x1b[0m`);
      return;
    }
    await mkdir(dirname(update.filePath), { recursive: true });
  }

  if (original !== null) {
    if (config.backupBeforeWrite) {
      await copyFile(update.filePath, bakPath(update.filePath));
      console.log(`${DIM}  Backup: ${bakPath(update.filePath)}${RESET}`);
    }
    console.log(`  ${summarizeDiff(original, update.newContent)}`);
  }

  await writeFile(update.filePath, update.newContent, "utf-8");
  console.log(`${G}✔ Applied: ${update.filePath}${RESET}`);
}

export async function applyAllUpdates(updates: CodeUpdate[]): Promise<void> {
  for (const update of updates) {
    console.log(`\n── ${update.description}`);
    let original = "";
    try { original = await readFile(update.filePath, "utf-8"); } catch {
      console.log(`${G}[new file] ${update.filePath}${RESET}`);
      console.log(update.newContent.split("\n").map((l) => `${G}+ ${l}${RESET}`).join("\n"));
    }
    if (original) showDiff(update.filePath, original, update.newContent);
    await applyUpdate(update);
  }
}

export async function revertUpdate(filePath: string): Promise<void> {
  const bak = bakPath(filePath);
  try { await access(bak); } catch { throw new Error(`No backup found for ${filePath}`); }
  await copyFile(bak, filePath);
  console.log(`${G}✔ Reverted: ${filePath}${RESET}`);
}