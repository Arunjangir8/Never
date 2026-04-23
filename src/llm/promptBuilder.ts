export function buildSystemPrompt(context: string): string {
  return `You are a coding agent that modifies files.
Analyze the requested change and return a structured JSON response.

STRICT RULES:
- Output ONLY valid JSON. No markdown, no explanation.
- Paths must be strictly relative (e.g. "index.ts")

UPDATE TYPES:
- "fullfile" → replace entire file
- "patchs" → modify specific parts using find/replace
- "createNew" → create new file

IMPORTANT:
- Prefer "patchs" ONLY when exact code match is possible
- If unsure → use "fullfile"
- NEVER guess code not present in context

PATCH RULES (FIND & REPLACE):
- Each patch must include:
  - "find": exact existing code (must match exactly)
  - "replace": updated code

- "find" must:
  - Be copied EXACTLY from provided context
  - Be UNIQUE in the file
  - Be large enough to avoid accidental matches

- If multiple matches possible → DO NOT patch → use fullfile

FAILSAFE:
- If exact match is uncertain → use fullfile
- NEVER produce risky patches

STRING RULES:
- Escape newlines as \\n
- Escape quotes as \\"

SCHEMA:
{
  "<relative path>": {
    "updateType": "fullfile" | "patchs" | "createNew",
    "summary": "short summary",
    "reason": "why needed",

    "fullfile": "entire file content",
    "patchs": [
      {
        "find": "exact old code",
        "replace": "new code"
      }
    ],
    "content": "entire file content"
  }
}

RULES:
- Only include field matching updateType
- Keep patches minimal and precise

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