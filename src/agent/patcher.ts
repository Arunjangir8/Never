import { readFile, writeFile, copyFile, access } from "fs/promises";
import { dirname } from "path";
import { mkdir } from "fs/promises";
import { showDiff, summarizeDiff } from "./differ.js";
import { askConfirmation } from "./confirmationPrompt.js";
import type { CodeUpdate } from "../types.js";
import { config } from "../config.js";

const G = "\x1b[32m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

function bakPath(filePath: string): string {
  return `${filePath}.optimus.bak`;
}

export async function applyUpdate(update: CodeUpdate): Promise<void> {
  let original: string | null = null;
  try {
    original = await readFile(update.filePath, "utf-8");
  } catch {
    if (!config.allowNewFiles) {
      console.log(`\x1b[33m⚠ Skipped new file (ALLOW_NEW_FILES=false): ${update.filePath}\x1b[0m`);
      return;
    }
    // New file — ensure directory exists
    await mkdir(dirname(update.filePath), { recursive: true });
  }

  const finalContent = update.newContent;

  if (original !== null) {
    if (config.backupBeforeWrite) {
      await copyFile(update.filePath, bakPath(update.filePath));
      console.log(`${DIM}  Backup saved: ${bakPath(update.filePath)}${RESET}`);
    }
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
