# Optimus AI Agent — Full Codebase Explained

This document explains every file in the project in simple language. No jargon. No assumptions. Just a clear picture of what each file does, why it exists, and how everything connects.

---

## Table of Contents

1. [The Big Picture](#1-the-big-picture)
2. [How a Single Query Works (End to End)](#2-how-a-single-query-works-end-to-end)
3. [Entry Point — `src/index.ts`](#3-entry-point--srcindexts)
4. [Configuration — `src/config.ts`](#4-configuration--srcconfigts)
5. [Shared Types — `src/types.ts`](#5-shared-types--srctypests)
6. [Indexer Layer — `src/indexer/`](#6-indexer-layer--srcindexer)
7. [Retriever Layer — `src/retriever/`](#7-retriever-layer--srcretriever)
8. [LLM Layer — `src/llm/`](#8-llm-layer--srcllm)
9. [Agent Layer — `src/agent/`](#9-agent-layer--srcagent)
10. [CLI Layer — `src/cli/`](#10-cli-layer--srccli)
11. [Utils — `src/utils/`](#11-utils--srcutils)
12. [How All Layers Connect](#12-how-all-layers-connect)
13. [Data Flow Diagrams](#13-data-flow-diagrams)
14. [Key Concepts Explained Simply](#14-key-concepts-explained-simply)

---

## 1. The Big Picture

Optimus is a **local coding assistant** that lives inside your terminal. It reads your codebase, understands it, and answers questions or makes code changes — all without sending anything to the internet.

It has three main jobs:

| Job | What it means |
|---|---|
| **Index** | Read all your source files and store them in a local database so they can be searched later |
| **Retrieve** | When you ask a question, find the most relevant pieces of your code |
| **Answer** | Send your question + the relevant code to a local AI model, get an answer, and optionally apply code changes |

Two external services power this:

- **Ollama** — runs AI models locally on your machine (like ChatGPT but offline)
- **ChromaDB** — a local vector database that stores your code in a searchable format

---

## 2. How a Single Query Works (End to End)

Here is the complete journey of one query from the moment you press Enter to the moment a file gets updated:

```
You type:  "fix the bug in src/routes/user.ts"
                        │
                        ▼
              ┌─────────────────┐
              │   repl.ts       │  ← reads your input
              └────────┬────────┘
                       │
                       ▼
              ┌─────────────────┐
              │ orchestrator.ts │  ← coordinates everything
              └────────┬────────┘
                       │
          ┌────────────┴────────────┐
          ▼                         ▼
  ┌───────────────┐        ┌────────────────┐
  │ fileDetector  │        │  retriever.ts  │
  │ (direct read) │        │ (vector search)│
  └───────┬───────┘        └───────┬────────┘
          │                        │
          └──────────┬─────────────┘
                     ▼
            ┌─────────────────┐
            │ contextBuilder  │  ← formats code snippets for the AI
            └────────┬────────┘
                     │
                     ▼
            ┌─────────────────┐
            │  modelRouter    │  ← picks the right AI model
            └────────┬────────┘
                     │
                     ▼
            ┌─────────────────┐
            │  ollamaClient   │  ← streams response from Ollama
            └────────┬────────┘
                     │
                     ▼
            ┌─────────────────┐
            │  updateParser   │  ← extracts file changes from response
            └────────┬────────┘
                     │
                     ▼
            ┌─────────────────┐
            │    differ.ts    │  ← shows you what changed (red/green diff)
            └────────┬────────┘
                     │
                     ▼
            ┌─────────────────┐
            │ confirmPrompt   │  ← asks "Apply? [y/N]"
            └────────┬────────┘
                     │
                     ▼
            ┌─────────────────┐
            │   patcher.ts    │  ← writes the file to disk
            └─────────────────┘
```

---

## 3. Entry Point — `src/index.ts`

**What it does:** This is the very first file that runs when you start Optimus. Think of it as the front door.

**Step by step:**

1. Loads your `.env` file (your settings)
2. Checks if Ollama is running by pinging `http://localhost:11434`
3. Checks if ChromaDB is running by pinging `http://localhost:8000/api/v1/heartbeat`
4. If either service is offline, it prints an error and exits
5. Reads the command-line argument to decide what mode to run:
   - `npm run index` → runs `--index` mode: indexes your project then exits
   - `npm run watch` → runs `--watch` mode: indexes then keeps watching for file changes
   - `npm run dev` → no argument: starts the interactive REPL (the chat prompt)

```
node src/index.ts --index   →  index and exit
node src/index.ts --watch   →  index and keep watching
node src/index.ts           →  start the chat prompt
```

---

## 4. Configuration — `src/config.ts`

**What it does:** One single place where all settings live. Every other file imports from here instead of reading `.env` directly.

**All settings and their defaults:**

| Setting | Default | What it controls |
|---|---|---|
| `ollamaBaseUrl` | `http://localhost:11434` | Where Ollama is running |
| `chromaUrl` | `http://localhost:8201` | Where ChromaDB is running |
| `projectPath` | `./my-project` | The folder of code you want to index |
| `allowNewFiles` | `false` | Whether the AI can create brand new files |
| `backupBeforeWrite` | `false` | Whether to save a `.bak` file before overwriting |
| `generalModel` | `gemma:2b` | AI model for explanations and Q&A |
| `codeModel` | `codellama:7b` | AI model for writing/fixing code |
| `embedModel` | `nomic-embed-text` | Model that converts text to vectors |
| `collectionName` | `optimus_codebase` | The name of the ChromaDB collection |
| `topK` | `5` | How many code chunks to retrieve per query |

---

## 5. Shared Types — `src/types.ts`

**What it does:** Defines the "shapes" of data that get passed between files. TypeScript uses these to catch mistakes at compile time.

**The types:**

- `FileChunk` — a piece of a file (path, content, line numbers, chunk index). Created by the chunker, stored in ChromaDB.
- `QueryResult` — a chunk that was retrieved from ChromaDB for a query (includes a relevance score).
- `DirectFile` — a full file read directly from disk (when you mention a file path in your query).
- `CodeUpdate` — a file change the AI wants to make (path, new content, description).
- `AgentResponse` — the final answer from the agent (answer text, source files, model used).

---

## 6. Indexer Layer — `src/indexer/`

This layer is responsible for reading your codebase and storing it in ChromaDB so it can be searched later. You run this once before querying.

---

### `fileScanner.ts`

**What it does:** Walks through your project folder and returns a list of all source files worth indexing.

**How it works:**
- Recursively walks every folder
- Skips folders like `node_modules`, `.git`, `dist`, `build`, `__pycache__`
- Only includes files with these extensions: `.ts`, `.js`, `.py`, `.go`, `.java`, `.cpp`, `.c`, `.rs`, `.md`, `.json`, `.yaml`, `.yml`
- Returns a flat list of absolute file paths

---

### `chunker.ts`

**What it does:** Takes a single file's content and splits it into smaller overlapping pieces called "chunks".

**Why chunking?** AI models have a limit on how much text they can process at once. Also, when searching, you want to find the specific relevant section of a file, not the whole file.

**How it works:**
- Splits the file into lines
- Creates chunks of **60 lines** each
- Each chunk overlaps the previous one by **10 lines** (so context at boundaries isn't lost)
- Each chunk remembers its file path, start line, end line, and chunk index

**Example:** A 200-line file becomes chunks at lines 1–60, 51–110, 101–160, 151–200.

---

### `embedder.ts`

**What it does:** Converts text (code chunks) into vectors (lists of numbers) using Ollama's `nomic-embed-text` model.

**Why vectors?** Vectors let you do "semantic search" — finding code that is *conceptually similar* to your query, even if it doesn't share the exact same words.

**How it works:**
- Uses LangChain's `OllamaEmbeddings` to call the local Ollama server
- Processes chunks in batches of 3 at a time (to avoid overwhelming Ollama)
- Retries up to 3 times if a request fails (with increasing delays: 1s, 2s, 3s)
- Returns a list of number arrays — one vector per chunk

---

### `chromaStore.ts`

**What it does:** Saves and deletes chunks in ChromaDB.

**How it works:**
- Connects to ChromaDB using the URL from config
- `upsertChunks()` — saves chunks with their vectors and metadata (file path, line numbers). "Upsert" means insert-or-update, so re-indexing a file just overwrites the old data.
- `deleteFileChunks()` — removes all chunks for a specific file (used when a file is deleted)
- Each chunk gets a unique ID in the format `filePath::chunkIndex`

---

### `indexer.ts`

**What it does:** Orchestrates the full indexing pipeline for one file or an entire project.

**`indexFile(filePath)`:**
1. Reads the file from disk
2. Calls `chunker.ts` to split it into chunks
3. Calls `embedder.ts` to generate vectors for each chunk
4. Calls `chromaStore.ts` to save everything to ChromaDB
5. Returns the number of chunks created

**`indexProject(projectPath)`:**
1. Calls `fileScanner.ts` to get all files
2. Loops through every file and calls `indexFile()` on each
3. Prints progress like `[12/42] Indexed: src/auth.ts`

---

### `watcher.ts`

**What it does:** Watches your project folder for file changes and automatically re-indexes when something changes.

**How it works:**
- Uses the `chokidar` library to watch the filesystem
- Ignores `node_modules`, `.git`, `dist`, etc.
- Listens for three events:
  - `add` → new file created → index it
  - `change` → file modified → re-index it
  - `unlink` → file deleted → remove its chunks from ChromaDB
- Uses a **500ms debounce** — if you save a file multiple times quickly, it only re-indexes once after the last save

---

## 7. Retriever Layer — `src/retriever/`

This layer finds the most relevant code for a given query.

---

### `retriever.ts`

**What it does:** Searches ChromaDB for the most relevant code chunks for a query.

**How it works:**
1. Connects to ChromaDB
2. Converts the query text into a vector using `embedder.ts`
3. Asks ChromaDB: "find me the `topK` chunks whose vectors are closest to this query vector"
4. ChromaDB returns chunks with a "distance" score (lower distance = more similar)
5. Converts distance to a relevance score (score = 1 - distance, so higher = better)
6. Returns results sorted by score, best first

---

### `fileDetector.ts`

**What it does:** Checks if your query directly mentions a file path, and if so, reads that file from disk.

**Why?** If you say "fix the bug in `src/routes/user.ts`", it's faster and more accurate to just read that file directly rather than searching for it in ChromaDB.

**How it works:**
- Uses a regex to find patterns like `src/auth.ts`, `./utils/helper.py`, `/abs/path/file.go` in your query
- Tries to read each matched path from disk
- Returns the file content if found, silently skips if not found

---

### `contextBuilder.ts`

**What it does:** Takes the retrieved chunks and formats them into a clean context string that gets sent to the AI.

**How it works:**
1. Groups chunks by file
2. Merges overlapping chunks from the same file into one continuous block (avoids duplicate lines)
3. Formats each block as an XML-like snippet with the file path, line range, and relevance score
4. Stops adding chunks once the total size reaches ~24,000 characters (to stay within the AI's context window)

**Output looks like:**
```xml
<context>
  <file path="src/auth.ts" lines="10-70" score="0.923">
    <![CDATA[
      ... your code here ...
    ]]>
  </file>
</context>

<query>fix the bug in src/routes/user.ts</query>
```

---

### `index.ts` (retriever)

**What it does:** The public entry point for the retriever layer. Combines `fileDetector`, `retriever`, and `contextBuilder` into one function called `getContext()`.

**How it works:**
1. Runs `fileDetector` and `retriever` in parallel
2. Merges direct file reads + vector search results
3. Passes everything to `contextBuilder` to produce the final context string

---

## 8. LLM Layer — `src/llm/`

This layer handles all communication with Ollama (the local AI).

---

### `modelRouter.ts`

**What it does:** Decides which AI model to use based on what you're asking.

**How it works:**
- Scans your query for keywords
- If it finds words like `explain`, `what is`, `how does`, `why`, `describe` → uses `gemma:2b` (general model, faster)
- If it finds words like `fix`, `write`, `refactor`, `debug`, `implement`, `add`, `change` → uses `codellama:7b` (code model, more accurate for code)
- Defaults to the code model if no keywords match

---

### `promptBuilder.ts`

**What it does:** Builds the system prompt — the instructions that tell the AI how to behave and what format to respond in.

**The system prompt tells the AI:**
- You are Optimus, a coding assistant
- When making code changes, respond ONLY with a JSON object in this exact format:
  ```json
  {
    "updates": [
      {
        "filePath": "my-project/index.ts",
        "newContent": "... complete updated file ..."
      }
    ]
  }
  ```
- Never add explanation text outside the JSON
- Always include the complete file content, not partial snippets
- If no file changes are needed, respond normally (not JSON)

This strict format is what allows Optimus to reliably parse and apply code changes.

---

### `ollamaClient.ts`

**What it does:** The actual HTTP client that talks to Ollama.

**Two modes:**
- `streamResponse()` — streams the response token by token (used for interactive queries so you see output as it's generated)
- `generateResponse()` — waits for the full response before returning (used for non-interactive tasks)

**Error handling:** If Ollama isn't running, it catches the connection error and shows a helpful message instead of a cryptic crash.

---

### `llmClient.ts`

**What it does:** Combines `promptBuilder` + `ollamaClient` + `modelRouter` into one clean function.

**How it works:**
1. Calls `modelRouter` to pick the right model
2. Calls `promptBuilder` to build the system prompt with the context
3. Calls `ollamaClient` to stream the response

---

### `index.ts` (llm)

**What it does:** The public entry point for the LLM layer. Exports `queryLLM()` which is what `orchestrator.ts` calls.

---

## 9. Agent Layer — `src/agent/`

This layer handles everything that happens *after* the AI responds — parsing the response, showing diffs, and applying changes.

---

### `orchestrator.ts`

**What it does:** The brain of the whole operation. Coordinates the full query pipeline.

**Step by step:**
1. Calls `getContext()` to retrieve relevant code
2. Prints which files were found as context
3. Streams the LLM response to the terminal token by token
4. After streaming completes, tries to extract code updates from the response
5. Checks for special "heuristic" cases first:
   - **Comment removal:** If you said "remove comments", it does it deterministically (no AI needed)
   - **Simple value swap:** If you said "change X to Y", it does a direct string replace
6. If neither heuristic applies, uses `updateParser` to extract AI-generated updates
7. Calls `applyAllUpdates()` to show diffs and apply changes

---

### `updateParser.ts`

**What it does:** Extracts file update instructions from the AI's raw text response.

**Why is this complex?** AI models don't always follow the exact format they're told to use. This parser handles many real-world cases:

**Parsing strategies (tried in order):**

1. **Strict JSON** — tries `JSON.parse()` on the response directly. Works when the AI follows instructions perfectly.
2. **Fenced JSON** — looks for ` ```json ... ``` ` blocks and parses the content inside.
3. **Mixed prose + JSON** — scans the text character by character to find the first balanced `{ }` object and parses it.
4. **Loose JSON-like** — uses regex to extract `filePath` and `newContent` even from malformed JSON (e.g. unescaped quotes).
5. **START_UPDATE markers** — looks for the old-style `===START_UPDATE: path===...===END_UPDATE===` format.
6. **Markdown code block fallback** — looks for ` ```typescript\n// src/file.ts\n...``` ` patterns.

**Safety checks:**
- Verifies the target file path is inside the project root (prevents writing outside your project)
- Verifies the file already exists (unless `ALLOW_NEW_FILES=true`)
- Warns and skips any unsafe targets

---

### `differ.ts`

**What it does:** Shows a colored diff between the original file and the proposed new content.

**How it works:**
- Implements a proper **LCS (Longest Common Subsequence)** diff algorithm — the same algorithm used by `git diff`
- Lines removed are shown in red with a `-` prefix
- Lines added are shown in green with a `+` prefix
- Unchanged lines near changes are shown dimmed for context (3 lines above and below each change)
- If there are no changes, it says "No changes."

**Example output:**
```
--- src/index.ts (original)
+++ src/index.ts (updated)

  const x = 1;
- const y = 2;
+ const y = 99;
  return x + y;
```

---

### `confirmationPrompt.ts`

**What it does:** Asks you "Apply changes to file.ts? [y/N]" before touching any file.

**How it works:**
- Opens a readline prompt
- Waits for your input
- Accepts `y` or `yes` (case-insensitive) as confirmation
- **Auto-declines after 30 seconds** if you don't respond (safety measure)
- Returns `true` if confirmed, `false` if declined or timed out

---

### `patcher.ts`

**What it does:** Actually writes the updated file to disk.

**`applyUpdate(update)`:**
1. Tries to read the original file
2. If the file doesn't exist and `ALLOW_NEW_FILES=false`, skips with a warning
3. If `BACKUP_BEFORE_WRITE=true`, copies the original to `filename.optimus.bak`
4. Prints a summary like "3 lines added, 1 line removed"
5. Writes the new content to the file

**`applyAllUpdates(updates)`:**
- Loops through all updates
- For each one: shows the diff → asks for confirmation → applies if confirmed

**`revertUpdate(filePath)`:**
- Looks for `filename.optimus.bak`
- Copies it back over the current file
- Used by the `/revert` command

---

### `agent.ts` (top-level)

A thin wrapper that re-exports the main agent functionality for use by other parts of the app.

---

## 10. CLI Layer — `src/cli/`

This layer handles everything the user sees and types in the terminal.

---

### `repl.ts`

**What it does:** The interactive Read-Eval-Print Loop — the `optimus ❯` prompt you type into.

**How it works:**
- Creates a readline interface connected to stdin/stdout
- Keeps a conversation history of the last 6 turns (user + assistant messages)
- For each line you type:
  - If it starts with `/` → passes to `commands.ts`
  - Otherwise → calls `runQuery()` in `orchestrator.ts`
- Handles `Ctrl+C` gracefully (tells you to use `/exit` instead of crashing)

---

### `commands.ts`

**What it does:** Handles all the `/slash` commands.

| Command | What it does |
|---|---|
| `/index` | Re-indexes the entire project |
| `/index src/auth.ts` | Indexes just one file |
| `/watch` | Starts the file watcher |
| `/clear` | Clears conversation history and the terminal |
| `/models` | Runs `ollama list` and shows available models |
| `/revert src/auth.ts` | Restores the file from its `.optimus.bak` backup |
| `/help` | Prints the command list |
| `/exit` | Exits the process cleanly |

---

### `display.ts`

**What it does:** Colored terminal output helpers used throughout the app.

- `printBanner()` — the Optimus ASCII art header shown on startup
- `printError()` — red `✖` error messages
- `printSuccess()` — green `✔` success messages
- `printSeparator()` — a horizontal line divider
- `printSources()` — lists the source files used as context for a query

---

## 11. Utils — `src/utils/`

---

### `logger.ts`

**What it does:** A simple logging utility for debug/info/error messages with timestamps.

---

### `folderFileHandler.ts`

**What it does:** Generates a text representation of the project's folder structure. Used after indexing to show you what was scanned.

---

## 12. How All Layers Connect

Here is a map of which files import from which:

```
src/index.ts
  ├── src/config.ts
  ├── src/cli/display.ts
  ├── src/cli/repl.ts
  │     ├── src/agent/orchestrator.ts
  │     │     ├── src/retriever/index.ts
  │     │     │     ├── src/retriever/fileDetector.ts
  │     │     │     ├── src/retriever/retriever.ts
  │     │     │     │     ├── src/indexer/embedder.ts
  │     │     │     │     └── src/indexer/chromaStore.ts (read)
  │     │     │     └── src/retriever/contextBuilder.ts
  │     │     ├── src/llm/index.ts
  │     │     │     ├── src/llm/modelRouter.ts
  │     │     │     ├── src/llm/promptBuilder.ts
  │     │     │     └── src/llm/ollamaClient.ts
  │     │     ├── src/agent/updateParser.ts
  │     │     ├── src/agent/differ.ts
  │     │     ├── src/agent/confirmationPrompt.ts
  │     │     └── src/agent/patcher.ts
  │     └── src/cli/commands.ts
  │           ├── src/indexer/indexer.ts
  │           └── src/indexer/watcher.ts
  ├── src/indexer/indexer.ts
  │     ├── src/indexer/fileScanner.ts
  │     ├── src/indexer/chunker.ts
  │     ├── src/indexer/embedder.ts
  │     └── src/indexer/chromaStore.ts (write)
  └── src/indexer/watcher.ts
```

---

## 13. Data Flow Diagrams

### Indexing Flow

```
Your project files
        │
        ▼
  fileScanner.ts          ← finds all .ts, .js, .py, etc. files
        │
        ▼
   chunker.ts             ← splits each file into 60-line chunks
        │
        ▼
   embedder.ts            ← sends chunks to Ollama → gets number vectors
        │
        ▼
  chromaStore.ts          ← saves (chunk text + vector + metadata) to ChromaDB
```

### Query Flow

```
Your query: "fix the bug in src/auth.ts"
        │
        ├──────────────────────────────────────┐
        ▼                                      ▼
 fileDetector.ts                        retriever.ts
 (reads src/auth.ts directly)           (embeds query → searches ChromaDB)
        │                                      │
        └──────────────┬───────────────────────┘
                       ▼
              contextBuilder.ts         ← merges + formats all code snippets
                       │
                       ▼
              modelRouter.ts            ← "fix" keyword → picks codellama:7b
                       │
                       ▼
              promptBuilder.ts          ← wraps context in system prompt
                       │
                       ▼
              ollamaClient.ts           ← streams response from Ollama
                       │
                       ▼
              updateParser.ts           ← extracts JSON { updates: [...] }
                       │
                       ▼
                differ.ts               ← shows red/green diff
                       │
                       ▼
           confirmationPrompt.ts        ← "Apply? [y/N]"
                       │
                       ▼
               patcher.ts              ← writes file to disk
```

---

## 14. Key Concepts Explained Simply

### What is a Vector / Embedding?

Imagine every piece of text can be represented as a point in space. Similar texts are close together, different texts are far apart. An "embedding" is just the coordinates of that point — a list of ~768 numbers. When you search, you convert your query to coordinates and find the nearest code chunks.

### What is ChromaDB?

It's a database designed specifically for storing and searching vectors. You give it a vector and it returns the closest matches. Think of it like a "similarity search engine" for your code.

### What is RAG?

RAG stands for Retrieval-Augmented Generation. Instead of asking the AI to answer from memory, you first *retrieve* relevant information (your code), then *augment* the AI's prompt with that information, then let it *generate* an answer. This is why Optimus can answer questions about your specific codebase.

### Why two AI models?

- `gemma:2b` is small and fast — good for explaining things in plain English
- `codellama:7b` is trained specifically on code — better at writing, fixing, and refactoring code

Using the right model for the right task gives better results without wasting resources.

### What is the 30-second timeout on confirmations?

If you walk away from your terminal mid-query, Optimus won't sit there waiting forever to write to your files. After 30 seconds of no response, it automatically declines the change. This prevents accidental file writes.

### What is debouncing in the watcher?

When you save a file, your editor might trigger multiple "file changed" events in quick succession. Debouncing means Optimus waits 500ms after the *last* event before re-indexing. This prevents re-indexing the same file 5 times in a row when you hit save.

### What is the `.optimus.bak` file?

Before overwriting any file (when `BACKUP_BEFORE_WRITE=true`), Optimus saves a copy as `filename.ts.optimus.bak`. If the AI's change breaks something, you can restore it with `/revert filename.ts`.

---

*This document was generated from the actual source code of the Optimus AI Agent project.*
