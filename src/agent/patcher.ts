import { readFile, writeFile, copyFile, access } from "fs/promises";
import { dirname } from "path";
import { mkdir } from "fs/promises";
import { showDiff, summarizeDiff } from "./differ.js";
import { askConfirmation } from "./confirmationPrompt.js";
import type { CodeUpdate } from "../types.js";

const G = "\x1b[32m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

function bakPath(filePath: string): string {
  return `${filePath}.optimus.bak`;
}

// Attempt targeted replacement: find the first function/class block in newContent
// and replace its counterpart in the original. Falls back to full overwrite.
function targetedReplace(original: string, newContent: string): string {
  // Extract the first top-level identifier from newContent (function/class/const name)
  const sigRe = /^(?:export\s+)?(?:async\s+)?(?:function|class|const|let|var)\s+(\w+)/m;
  const sig = sigRe.exec(newContent);
  if (!sig) return newContent; // no recognisable signature → full replace

  const name = sig[1]!;
  // Build a regex that matches the same declaration block in the original
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const blockRe = new RegExp(
    `((?:export\\s+)?(?:async\\s+)?(?:function|class|const|let|var)\\s+${escapedName}[\\s\\S]*?)` +
      `(?=\\n(?:export\\s+)?(?:async\\s+)?(?:function|class|const|let|var)\\s+\\w|$)`,
    "m"
  );

  if (blockRe.test(original)) {
    return original.replace(blockRe, newContent);
  }
  return newContent; // identifier not found → full replace
}

export async function applyUpdate(update: CodeUpdate): Promise<void> {
  let original: string | null = null;
  try {
    original = await readFile(update.filePath, "utf-8");
  } catch {
    // New file — ensure directory exists
    await mkdir(dirname(update.filePath), { recursive: true });
  }

  const finalContent =
    original !== null ? targetedReplace(original, update.newContent) : update.newContent;

  if (original !== null) {
    // Backup before writing
    await copyFile(update.filePath, bakPath(update.filePath));
    console.log(`${DIM}  Backup saved: ${bakPath(update.filePath)}${RESET}`);
    console.log(`  ${summarizeDiff(original, finalContent)}`);
  }

  await writeFile(update.filePath, finalContent, "utf-8");
  console.log(`${G}✔ Applied: ${update.filePath}${RESET}`);
}

export async function applyAllUpdates(updates: CodeUpdate[]): Promise<void> {
  for (const update of updates) {
    console.log(`\n── Update: ${update.description}`);
    await showDiff(update.filePath, update.newContent);

    const confirmed = await askConfirmation(`Apply changes to ${update.filePath}?`);
    if (confirmed) {
      await applyUpdate(update);
    } else {
      console.log(`${DIM}  Skipped.${RESET}`);
    }
  }
}

export async function revertUpdate(filePath: string): Promise<void> {
  const bak = bakPath(filePath);
  try {
    await access(bak);
  } catch {
    throw new Error(`No backup found for ${filePath}`);
  }
  await copyFile(bak, filePath);
  console.log(`${G}✔ Reverted: ${filePath}${RESET}`);
}
