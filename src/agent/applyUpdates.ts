import type { FileUpdate } from "../types.js";
import { folderFileHandler } from "../utils/folderFileHandler.js";
import { printError, printSuccess } from "../cli/display.js";

// The only place that writes to disk. Used by the chat orchestrator and the
// Red/Blue pipeline so both get the same rails. One bad update doesn't
// abort the rest.
export function applyUpdates(updates: FileUpdate[]): { ok: number; failed: number } {
  let ok = 0;
  let failed = 0;

  for (const update of updates) {
    console.log(`\n${update.summary}`);
    try {
      switch (update.type) {
        case "fullfile":
          folderFileHandler.updateFile(update.relativePath, update.content);
          printSuccess(`updated ${update.relativePath}`);
          break;
        case "patchs":
          folderFileHandler.applyPatches(update.relativePath, update.patches);
          printSuccess(
            `${update.patches.length} patch(es) applied to ${update.relativePath}`
          );
          break;
        case "createNew":
          folderFileHandler.createFile(update.relativePath, update.content);
          printSuccess(`created ${update.relativePath}`);
          break;
      }
      ok++;
    } catch (err) {
      failed++;
      printError(
        `${update.relativePath}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  console.log(
    failed === 0
      ? `\n\x1b[32m✓ ${ok} change(s) applied.\x1b[0m`
      : `\n\x1b[33m${ok} applied, ${failed} failed.\x1b[0m`
  );

  return { ok, failed };
}
