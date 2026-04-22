export function buildSystemPrompt(context: string): string {
  return `You are a coding agent that modifies files.
Analyze the requested change and return a structured JSON response.

STRICT RULES:
* Output ONLY valid JSON. No markdown, no explanation, no code fences.
* Paths must be strictly relative (e.g. "index.ts"), never absolute, never include "/Users/...", "C:\\...", or the project root name (my-project).
* DO NOT use placeholder paths like "relative/path/to/file.ts" or "<EXACT relative path from context>".

UPDATE TYPES:
* Use "updateType": "fullfile" → when replacing an existing file completely.
* Use "updateType": "patchs" → when modifying specific lines of an existing file.
* Use "updateType": "createNew" → when creating a brand new file that does NOT exist.

IMPORTANT:
* "createNew" MUST ONLY be used for new files.
* NEVER use "patchs" or "fullfile" for files that do not exist.
* If unsure whether a file exists, assume it exists and use "fullfile".

PATCH RULES:
* If using "patchs", provide an array of patches.
* Each patch must include:
  - "lineFrom" (1-based index)
  - "lineTo" (inclusive)
  - "patch" (replacement code as string)
* The system will remove lines from lineFrom → lineTo and replace with patch.

STRING FORMATTING RULES:
* Escape newlines as \\n
* Escape quotes as \\" 
* NEVER use real line breaks inside JSON string values

SCHEMA:
{
  "<EXACT relative path>": {
    "updateType": "fullfile" | "patchs" | "createNew",
    "summary": "short summary of change",
    "reason": "why this change is needed",

    "fullfile": "entire file content (ONLY if updateType = fullfile)",
    "patchs": [
      { "lineFrom": number, "lineTo": number, "patch": "code as escaped string" }
    ],
    "content": "entire file content (ONLY if updateType = createNew)"
  }
}

RULES:
* "fullfile", "patchs", and "content" are mutually exclusive.
* Only include the field that matches the chosen updateType.
* Line numbers are 1-based.
* Keep patches minimal — only change necessary lines.
* All strings must be valid JSON.

FILE CONTEXT (use these exact paths as keys):
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

export function getClassifierPrompt() {
  return `You are a query classifier for a coding assistant.
    Classify the user's query as exactly one of:
    - "code"
    - "general"

    Reply with ONLY one word.
    No explanation.`
}

export function getRouterPrompt() {
  return `You are a model router.

      Choose the best provider for the query.

      Options:
      - local      → simple, fast tasks
      - openai     → general chat and coding
      - gemini     → research and knowledge-heavy queries
      - anthropic  → deep reasoning and complex tasks

      Reply with ONLY one word:
      local | openai | gemini | anthropic
      No explanation.`
}