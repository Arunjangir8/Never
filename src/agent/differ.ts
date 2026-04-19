import { readFile } from "fs/promises";

const R = "\x1b[31m";
const G = "\x1b[32m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";
const CONTEXT_LINES = 3;

// Myers-style LCS diff — returns edit script as array of ops
type Op = { type: "eq" | "add" | "del"; line: string };

function diffLines(original: string[], updated: string[]): Op[] {
  const m = original.length;
  const n = updated.length;

  // DP table for LCS lengths
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i]![j] =
        original[i] === updated[j]
          ? 1 + dp[i + 1]![j + 1]!
          : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }

  const ops: Op[] = [];
  let i = 0, j = 0;
  while (i < m || j < n) {
    if (i < m && j < n && original[i] === updated[j]) {
      ops.push({ type: "eq", line: original[i]! });
      i++; j++;
    } else if (j < n && (i >= m || dp[i]![j + 1]! >= dp[i + 1]![j]!)) {
      ops.push({ type: "add", line: updated[j]! });
      j++;
    } else {
      ops.push({ type: "del", line: original[i]! });
      i++;
    }
  }
  return ops;
}

function renderWithContext(ops: Op[]): string {
  // Find indices of changed ops
  const changed = new Set<number>();
  ops.forEach((op, i) => { if (op.type !== "eq") changed.add(i); });

  const visible = new Set<number>();
  for (const idx of changed) {
    for (let k = idx - CONTEXT_LINES; k <= idx + CONTEXT_LINES; k++) {
      if (k >= 0 && k < ops.length) visible.add(k);
    }
  }

  const lines: string[] = [];
  let lastVisible = -1;
  for (let i = 0; i < ops.length; i++) {
    if (!visible.has(i)) continue;
    if (lastVisible !== -1 && i > lastVisible + 1) {
      lines.push(`${DIM}  ...${RESET}`);
    }
    const op = ops[i]!;
    if (op.type === "add") lines.push(`${G}+ ${op.line}${RESET}`);
    else if (op.type === "del") lines.push(`${R}- ${op.line}${RESET}`);
    else lines.push(`${DIM}  ${op.line}${RESET}`);
    lastVisible = i;
  }
  return lines.join("\n");
}

export async function showDiff(filePath: string, newContent: string): Promise<void> {
  let original = "";
  try {
    original = await readFile(filePath, "utf-8");
  } catch {
    console.log(`${G}[new file] ${filePath}${RESET}`);
    console.log(newContent.split("\n").map((l) => `${G}+ ${l}${RESET}`).join("\n"));
    return;
  }

  const ops = diffLines(original.split("\n"), newContent.split("\n"));
  const hasChanges = ops.some((o) => o.type !== "eq");
  if (!hasChanges) {
    console.log(`${DIM}  No changes.${RESET}`);
    return;
  }

  console.log(`\n${DIM}--- ${filePath} (original)${RESET}`);
  console.log(`${DIM}+++ ${filePath} (updated)${RESET}\n`);
  console.log(renderWithContext(ops));
}

export function summarizeDiff(original: string, updated: string): string {
  const ops = diffLines(original.split("\n"), updated.split("\n"));
  const added = ops.filter((o) => o.type === "add").length;
  const removed = ops.filter((o) => o.type === "del").length;
  return `${added} lines added, ${removed} lines removed`;
}
