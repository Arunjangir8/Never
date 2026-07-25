import { config } from "../config.js";
import { FileChunk, RedFinding } from "../types.js";

// Patches need an exact byte-for-byte snippet match. Small local models
// can't do that, so they only get the whole-file update types.
const PATCHES_ENABLED = config.provider !== "local";

function updateTypeRules(): string {
  if (!PATCHES_ENABLED) {
    return `UPDATE TYPES (only these two — never use "patchs"):
- "fullfile" → replace the entire file, output the complete new content
- "createNew" → create a new file

IMPORTANT:
- Always output the WHOLE file, never a fragment or a "..." placeholder
- NEVER invent code that is not in the context and not asked for
- Keep everything unrelated to the request exactly as it is`;
  }

  return `UPDATE TYPES:
- "fullfile" → replace entire file
- "patchs" → modify specific parts using find/replace
- "createNew" → create new file

IMPORTANT:
- Prefer "patchs" ONLY when exact code match is possible
- If unsure → use "fullfile"
- NEVER guess code not present in context

PATCH RULES (FIND & REPLACE):
- Each patch must include:
  - "find": exact existing code, copied EXACTLY from the context
  - "replace": updated code
- "find" must be UNIQUE in the file and large enough to avoid accidental matches
- If multiple matches are possible → DO NOT patch → use fullfile

FAILSAFE:
- If exact match is uncertain → use fullfile
- NEVER produce risky patches`;
}

function schemaBlock(): string {
  const patchField = PATCHES_ENABLED
    ? `\n    "patchs": [{ "find": "exact old code", "replace": "new code" }],`
    : "";

  return `SCHEMA:
{
  "<relative path>": {
    "updateType": ${PATCHES_ENABLED ? `"fullfile" | "patchs" | "createNew"` : `"fullfile" | "createNew"`},
    "summary": "short summary",
    "reason": "why needed",
    "fullfile": "entire file content (updateType=fullfile)",${patchField}
    "content": "entire file content (updateType=createNew)"
  }
}

- Include ONLY the field matching updateType
- The top-level key is the file path, e.g. "src/index.ts"`;
}

// PROMPT FOR THE MAIN OPTIMUS ASSISTANT

export function buildSystemPrompt(context: string): string {
  return `You are a coding agent that edits files in a project and creates new ones when needed.
Analyze the requested change and return a structured JSON response.

STRICT RULES:
- Output ONLY valid JSON. No markdown, no code fences, no explanation.
- Paths must be strictly relative to the project root (e.g. "index.ts", "src/api.ts")

${updateTypeRules()}

STRING RULES:
- Escape newlines as \\n
- Escape quotes as \\"

${schemaBlock()}

FILE CONTEXT:
${context}`;
}

export function buildGeneralSystemPrompt(): string {
  return `You are Optimus, a helpful coding assistant embedded in a developer's project. Answer conversationally and concisely. Do not return JSON.`;
}

export function buildUserPrompt(query: string): string {
  const isReplace = /\b(remove|replace|rewrite|delete|clear|start fresh|from scratch|ignore|undo|reset)\b/i.test(query);

  const prefix = isReplace
    ? "[INSTRUCTION: User wants to DISCARD the existing file content. " +
      "Do NOT preserve or echo back what is currently in the file. " +
      "Generate completely new content based only on the user's request.]\n\n"
    : "";

  return `${prefix}${query}`;
}


// RED & BLUE AGENT PROMPTS

export function buildRedSystemPrompt(): string {
  return `You are a Red Team code analyst. Your only job is to find problems in code.
You must respond with ONLY valid JSON — no explanation, no markdown, no code fences.

Return this exact schema:
{
  "chunk_id": "string",
  "file": "string",
  "bugs": [
    { "title": "string", "explanation": "string", "affected": "string" }
  ],
  "edge_cases": [
    { "title": "string", "explanation": "string", "affected": "string" }
  ],
  "risks": [
    { "title": "string", "explanation": "string", "affected": "string" }
  ]
}

Rules:
- If a category has no findings return an empty array []
- Never omit a key even if empty
- "affected" must be the exact function name, variable name, or expression from the code
- Be specific — vague findings like "may cause errors" are not acceptable
- Focus on: null/undefined handling, race conditions, error swallowing,
  unhandled promise rejections, type coercion, unbounded loops,
  resource leaks, silent failures, missing input validation`;
}

export function buildRedUserPrompt(chunk: FileChunk): string {
  return `Analyze this code chunk:

File: ${chunk.filePath}
Lines: ${chunk.startLine}–${chunk.endLine}
Chunk ID: ${chunk.filePath}::${chunk.chunkIndex}

\`\`\`
${chunk.content}
\`\`\`

Return ONLY the JSON. No explanation. No markdown.`;
}

export function buildBlueSystemPrompt(): string {
  return `You are a Blue Team code fixer. You receive structured findings from a Red Team analyst and your job is to generate concrete fixes for each issue.
You must respond with ONLY valid JSON — no explanation, no markdown, no code fences.

STRICT RULES:
- Output ONLY valid JSON. No markdown, no code fences, no explanation.
- Paths must be strictly relative (e.g. "index.ts")

${updateTypeRules()}

STRING RULES:
- Escape newlines as \\n
- Escape quotes as \\"

${schemaBlock()}

FIX RULES:
- Address every issue you can from bugs, edge_cases and risks in one update per file
- Fixes must be concrete code, never vague advice like "add validation"
- Change nothing that is unrelated to the listed issues
- If you cannot fix anything, return {}`;
}

export function buildBlueUserPrompt(finding: RedFinding): string {
  const allIssues = [
    ...finding.bugs.map((i) => ({ ...i, category: "bug" })),
    ...finding.edge_cases.map((i) => ({ ...i, category: "edge_case" })),
    ...finding.risks.map((i) => ({ ...i, category: "risk" })),
  ];

  const issueList = allIssues
    .map(
      (issue, idx) =>
        `${idx + 1}. [${issue.category}]
   Title: ${issue.title}
   Affected: ${issue.affected}
   Explanation: ${issue.explanation}`
    )
    .join("\n\n");

  return `Fix the following issues found in this code chunk based on tech stack used in ${finding.file}:

File: ${finding.file}
Chunk ID: ${finding.chunk_id}

Issues to fix:
${issueList}

Return ONLY the JSON. No explanation. No markdown.`;
}