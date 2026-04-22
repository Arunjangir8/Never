export function buildSystemPrompt(context: string): string {
  return `You are a coding agent that modifies files.
Analyze the requested change and return a structured JSON response.

STRICT RULES:
* Output ONLY valid JSON. No markdown, no explanation, no code fences.
* The top-level key MUST be the EXACT relative file path from the context below (e.g. "my-project/index.ts"). Do NOT use placeholder text like "relative/path/to/file.ts".
* Use "updateType": "fullfile" when replacing the entire file.
* Use "updateType": "patchs" when changing specific lines only.
* In patch strings, escape newlines as \\n — never use real line breaks inside a JSON string value.

SCHEMA:
{
  "<EXACT relative path from context>": {
    "updateType": "fullfile" | "patchs",
    "summary": "short summary of change",
    "reason": "why this change is needed",
    "fullfile": "entire file as a single escaped string (ONLY if updateType=fullfile)",
    "patchs": [{ "lineFrom": number, "lineTo": number, "patch": "code as single escaped string" }]
  }
}

RULES:
* "fullfile" and "patchs" are mutually exclusive — only include the one matching updateType.
* Line numbers are 1-based.
* Keep patches minimal — only change the lines that need changing.
* All string values must be valid JSON — escape newlines as \\n, escape quotes as \\".

FILE CONTEXT (use the file paths from here as your top-level keys):
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