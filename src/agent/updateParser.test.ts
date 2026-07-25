import { test } from "node:test";
import assert from "node:assert/strict";
import { parseUpdates, tryParseJson } from "./updateParser.js";

// Covers the shapes local models actually emit. If this breaks, the agent
// silently applies nothing.

test("parses a plain update map", () => {
  const updates = parseUpdates(
    JSON.stringify({
      "index.ts": {
        updateType: "fullfile",
        summary: "add a greeting",
        fullfile: "export const hi = 1;\n",
      },
    })
  );

  assert.equal(updates.length, 1);
  assert.deepEqual(updates[0], {
    type: "fullfile",
    relativePath: "index.ts",
    content: "export const hi = 1;",
    summary: "add a greeting",
  });
});

test("recovers JSON wrapped in a code fence and prose", () => {
  const updates = parseUpdates(
    'Sure! Here is the change:\n```json\n{"a.ts":{"updateType":"fullfile","summary":"s","fullfile":"x"}}\n```\nHope that helps.'
  );

  assert.equal(updates.length, 1);
  assert.equal(updates[0]!.relativePath, "a.ts");
});

test("recovers raw newlines inside JSON strings", () => {
  // Ollama models often emit literal newlines instead of \n.
  const raw = '{"a.ts":{"updateType":"fullfile","summary":"s","fullfile":"line1\nline2"}}';
  const updates = parseUpdates(raw);

  assert.equal(updates.length, 1);
  const u = updates[0]!;
  assert.equal(u.type, "fullfile");
  assert.equal(u.type === "fullfile" && u.content, "line1\nline2");
});

test("recovers the flat single-file format", () => {
  const updates = parseUpdates(
    JSON.stringify({
      path: "src/a.ts",
      updateType: "fullfile",
      summary: "s",
      fullfile: "x",
    })
  );

  assert.equal(updates.length, 1);
  assert.equal(updates[0]!.relativePath, "src/a.ts");
});

test("strips leading slashes so writes stay inside the project", () => {
  const updates = parseUpdates(
    JSON.stringify({
      "/index.ts": { updateType: "fullfile", summary: "s", fullfile: "x" },
    })
  );

  assert.equal(updates[0]!.relativePath, "index.ts");
});

test("skips schema placeholder paths", () => {
  const updates = parseUpdates(
    JSON.stringify({
      "<relative path>": { updateType: "fullfile", summary: "s", fullfile: "x" },
      "path/to/file.ts": { updateType: "fullfile", summary: "s", fullfile: "x" },
    })
  );

  assert.deepEqual(updates, []);
});

test("drops patches with an empty find, keeps the rest", () => {
  const updates = parseUpdates(
    JSON.stringify({
      "a.ts": {
        updateType: "patchs",
        summary: "s",
        patchs: [
          { find: "", replace: "nope" },
          { find: "const a = 1", replace: "const a = 2" },
        ],
      },
    })
  );

  assert.equal(updates.length, 1);
  const u = updates[0]!;
  assert.equal(u.type === "patchs" && u.patches.length, 1);
});

test("returns no updates for non-JSON and for empty content", () => {
  assert.deepEqual(parseUpdates("I cannot help with that."), []);
  assert.deepEqual(
    parseUpdates(JSON.stringify({ "a.ts": { updateType: "fullfile", fullfile: "  " } })),
    []
  );
  assert.equal(tryParseJson("   "), null);
});
