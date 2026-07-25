import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// config reads env on import, so set PROJECT_PATH before loading the handler.
const root = fs.mkdtempSync(path.join(os.tmpdir(), "optimus-test-"));
process.env["PROJECT_PATH"] = root;
process.env["ALLOW_NEW_FILES"] = "true";
process.env["BACKUP_BEFORE_WRITE"] = "true";

const { folderFileHandler } = await import("./folderFileHandler.js");

test("confines writes to PROJECT_PATH", () => {
  assert.throws(() => folderFileHandler.readFile("../escaped.txt"), /outside/);
  assert.throws(() => folderFileHandler.updateFile("../../evil.txt", "x"), /outside/);

  // Sibling dir sharing the root prefix, what startsWith() would let through.
  assert.throws(
    () => folderFileHandler.updateFile(`../${path.basename(root)}-evil/x.txt`, "x"),
    /outside/
  );
});

test("backs a file up before overwriting, and /revert restores it", () => {
  folderFileHandler.updateFile("a.txt", "original");
  folderFileHandler.updateFile("a.txt", "clobbered");

  assert.equal(fs.readFileSync(path.join(root, "a.txt"), "utf-8"), "clobbered");

  folderFileHandler.revert("a.txt");
  assert.equal(fs.readFileSync(path.join(root, "a.txt"), "utf-8"), "original");
});

test("applyPatches refuses missing and ambiguous targets", () => {
  folderFileHandler.updateFile("b.ts", "const a = 1;\nconst a = 1;\n");

  assert.throws(
    () => folderFileHandler.applyPatches("b.ts", [{ find: "nope", replace: "x" }]),
    /not found/
  );
  assert.throws(
    () => folderFileHandler.applyPatches("b.ts", [{ find: "const a = 1;", replace: "x" }]),
    /ambiguous/
  );
});
