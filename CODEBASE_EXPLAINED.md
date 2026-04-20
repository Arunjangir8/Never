# Optimus AI Agent — Codebase Explained

A plain-English walkthrough of every file, how they connect, and how a query flows from your keyboard to a file change on disk.

---

## Table of Contents

1. [The Big Picture](#1-the-big-picture)
2. [End-to-End Query Flow](#2-end-to-end-query-flow)
3. [File Structure](#3-file-structure)
4. [Entry Point — `src/index.ts`](#4-entry-point--srcindexts)
5. [Configuration — `src/config.ts`](#5-configuration--srcconfigts)
6. [Shared Types — `src/types.ts`](#6-shared-types--srctypests)
7. [Indexer Layer — `src/indexer/`](#7-indexer-layer--srcindexer)
8. [Retriever Layer — `src/retriever/`](#8-retriever-layer--srcretriever)
9. [LLM Layer — `src/llm/`](#9-llm-layer--srcllm)
10. [Agent Layer — `src/agent/`](#10-agent-layer--srcagent)
11. [CLI Layer — `src/cli/`](#11-cli-layer--srccli)
12. [Utils — `src/utils/`](#12-utils--srcutils)
13. [How All Files Connect](#13-how-all-files-connect)
14. [Key Concepts Explained Simply](#14-key-concepts-explained-simply)

---

## 1. The Big Picture

Optimus is a **fully local coding assistant** that runs in your terminal. It reads your codebase, understands it, and answers questions or makes code changes — nothing leaves your machine.

Three things make it work:

| What | Role |
|---|---|
| **Your codebase** | The source of truth — indexed once, searched on every query |
| **Ollama** | Runs AI models locally (like ChatGPT but offline) |
| **ChromaDB** | A local database that stores your code in a searchable vector format |

---

## 2. End-to-End Query Flow

```
You type: "fix the bug in src/routes/user.ts"
                      │
                      ▼
            src/cli/repl.ts          ← reads your input
                      │
                      ▼
    src/agent/orchestrator.ts        ← coordinates everything
          │                │
          ▼                ▼
  fileDetector.ts     retriever.ts   ← find relevant code
          │                │
          └──────┬──────────┘
                 ▼
        contextBuilder.ts            ← formats code for the AI
                 │
                 ▼
          modelRouter.ts             ← picks the right model
                 │
                 ▼
          ollamaClient.ts            ← streams AI response
                 │
                 ▼
          updateParser.ts            ← extracts file changes from response
                 │
                 ▼
            patcher.ts               ← shows diff → asks confirm → writes file
```

---

## 3. File Structure

```
src/
├── index.ts                  ← entry point
├── config.ts                 ← all settings
├── types.ts                  ← shared TypeScript types
│
├── indexer/
│   ├── fileScanner.ts        ← finds source files
│   ├── chunker.ts            ← splits files into chunks
│   ├── embedder.ts           ← converts chunks to vectors
│   ├── chromaStore.ts        ← saves/deletes vectors in ChromaDB
│   ├── indexer.ts            ← orchestrates the indexing pipeline
│   └── watcher.ts            ← watches for file changes, auto re-indexes
│
├── retriever/
│   ├── fileDetector.ts       ← reads files mentioned directly in query
│   ├── retriever.ts          ← searches ChromaDB for relevant chunks
│   ├── contextBuilder.ts     ← formats chunks into AI-ready context
│   └── index.ts              ← public entry point: getContext()
│
├── llm/
│   ├── modelRouter.ts        ← picks gemma:2b or codellama:7b
│   ├── promptBuilder.ts      ← builds the system prompt
│   └── ollamaClient.ts       ← streams/invokes Ollama
│
├── agent/
│   ├── orchestrator.ts       ← runs the full query pipeline
│   ├── updateParser.ts       ← parses file updates from LLM response
│   └── patcher.ts            ← diff display + confirmation + file writing
│
├── cli/
│   ├── repl.ts               ← the interactive prompt loop
│   ├── commands.ts           ← handles /slash commands
│   └── display.ts            ← colored terminal output helpers
│
└── utils/
    └── folderFileHandler.ts  ← generates folder structure text
```

---

## 4. Entry Point — `src/index.ts`

The first file that runs. It:

1. Loads your `.env` settings
2. Pings Ollama (`http://localhost:11434`) and ChromaDB (`/api/v1/heartbeat`) to check they're running
3. Reads the CLI argument to decide the mode:

| Command | Mode |
|---|---|
| `npm run index` | Index project then exit |
| `npm run watch` | Index then watch for file changes |
| `npm run dev` | Start the interactive REPL |

If either service is offline it prints a helpful error and exits.

---

## 5. Configuration — `src/config.ts`

One place for all settings. Every other file imports from here instead of reading `.env` directly.

| Setting | Default | What it controls |
|---|---|---|
| `ollamaBaseUrl` | `http://localhost:11434` | Where Ollama is running |
| `chromaUrl` | `http://localhost:8201` | Where ChromaDB is running |
| `projectPath` | `./my-project` | The folder of code to index |
| `allowNewFiles` | `false` | Whether the AI can create new files |
| `backupBeforeWrite` | `false` | Save a `.bak` before overwriting |
| `generalModel` | `gemma:2b` | Model for explanations/Q&A |
| `codeModel` | `codellama:7b` | Model for writing/fixing code |
| `embedModel` | `nomic-embed-text` | Model that converts text to vectors |
| `collectionName` | `optimus_codebase` | ChromaDB collection name |
| `topK` | `5` | How many chunks to retrieve per query |

---

## 6. Shared Types — `src/types.ts`

TypeScript interfaces shared across the whole codebase:

- `FileChunk` — a piece of a file (path, content, line numbers, chunk index)
- `QueryResult` — a retrieved chunk with a relevance score
- `DirectFile` — a full file read directly from disk
- `CodeUpdate` — a file change the AI wants to make (path + new content)
- `AgentResponse` — the final answer (text, source files, model used)

---

## 7. Indexer Layer — `src/indexer/`

Reads your codebase and stores it in ChromaDB. Run once before querying.

```
fileScanner → chunker → embedder → chromaStore
```

### `fileScanner.ts`
Walks your project folder recursively. Skips `node_modules`, `.git`, `dist`, `build`, `__pycache__`. Only includes: `.ts`, `.js`, `.py`, `.go`, `.java`, `.cpp`, `.c`, `.rs`, `.md`, `.json`, `.yaml`, `.yml`. Returns a flat list of absolute file paths.

### `chunker.ts`
Splits a file into overlapping 60-line chunks with a 10-line overlap. Overlap ensures code at chunk boundaries isn't lost. A 200-line file becomes chunks at lines 1–60, 51–110, 101–160, 151–200.

### `embedder.ts`
Sends chunks to Ollama's `nomic-embed-text` model and gets back vectors (lists of numbers). Processes 3 chunks at a time, retries up to 3 times on failure.

### `chromaStore.ts`
Saves chunks to ChromaDB with their vectors and metadata (file path, line numbers). Each chunk gets a unique ID: `filePath::chunkIndex`. Also handles deleting all chunks for a file when it's removed.

### `indexer.ts`
Orchestrates the pipeline: scan → chunk → embed → store. Prints progress like `[12/42] Indexed: src/auth.ts`.

### `watcher.ts`
Uses `chokidar` to watch your project folder. On file add/change → re-index. On file delete → remove from ChromaDB. Uses a 500ms debounce so rapid saves don't trigger multiple re-indexes.

---

## 8. Retriever Layer — `src/retriever/`

Finds the most relevant code for a given query.

### `fileDetector.ts`
Checks if your query mentions a file path directly (e.g. `src/auth.ts`). If found, reads that file from disk immediately — faster and more accurate than vector search for explicit file references.

### `retriever.ts`
Converts the query to a vector, then asks ChromaDB for the `topK` most similar chunks. Returns results sorted by relevance score (higher = more relevant).

### `contextBuilder.ts`
Takes retrieved chunks, merges overlapping chunks from the same file, and formats everything into an XML-like context string for the AI. Stops adding chunks once the total reaches ~24,000 characters to stay within the AI's context window.

### `index.ts`
Public entry point. Exports `getContext(query)` which runs `fileDetector` and `retriever` in parallel, then passes results to `contextBuilder`.

---

## 9. LLM Layer — `src/llm/`

Handles all communication with Ollama.

### `modelRouter.ts`
Picks the right model based on keywords in your query:
- Words like `explain`, `what is`, `how does`, `why` → `gemma:2b` (fast, general)
- Words like `fix`, `write`, `refactor`, `debug`, `add`, `change` → `codellama:7b` (code-focused)
- Default: code model

### `promptBuilder.ts`
Builds the system prompt — the instructions that tell the AI how to behave. Critically, it instructs the AI to respond with a strict JSON format when making code changes:

```json
{
  "updates": [
    { "filePath": "my-project/index.ts", "newContent": "...complete file..." }
  ]
}
```

This structured format is what allows Optimus to reliably parse and apply changes.

### `ollamaClient.ts`
The actual HTTP client for Ollama. Two modes:
- `streamResponse()` — streams tokens one by one (used for interactive queries so you see output as it generates)
- `generateResponse()` — waits for the full response (used for non-interactive tasks)

Catches connection errors and shows a helpful message instead of crashing.

---

## 10. Agent Layer — `src/agent/`

Everything that happens after the AI responds.

### `orchestrator.ts`
The brain of the query pipeline. Steps:

1. Calls `getContext()` to retrieve relevant code
2. Picks the model via `modelRouter`, builds the prompt via `promptBuilder`
3. Streams the response from Ollama token by token to your terminal
4. After streaming, checks for **heuristic shortcuts** first:
   - If you said "remove comments" → strips them deterministically (no AI parsing needed)
   - If you said "change X to Y" → does a direct string replace
5. If no shortcut applies, calls `updateParser` to extract AI-generated file updates
6. Calls `applyAllUpdates` to show diffs and write files

### `updateParser.ts`
Extracts file update instructions from the AI's raw text. AI models don't always follow the exact format they're told, so this parser tries multiple strategies in order:

1. **Strict JSON** — `JSON.parse()` directly on the response
2. **Fenced JSON** — extracts from ` ```json ... ``` ` blocks
3. **Mixed prose + JSON** — scans character by character to find the first balanced `{}` object
4. **Loose JSON-like** — regex extraction for malformed JSON with unescaped quotes
5. **START_UPDATE markers** — `===START_UPDATE: path===...===END_UPDATE===` format
6. **Markdown code block** — ` ```typescript\n// src/file.ts\n...``` ` fallback

Safety: verifies every target path is inside the project root and the file already exists (unless `ALLOW_NEW_FILES=true`).

### `patcher.ts`
Three responsibilities in one file:

**Diff** — implements an LCS (Longest Common Subsequence) diff algorithm. Shows changed lines in red/green with 3 lines of context around each change, just like `git diff`.

**Confirmation** — asks `Apply changes to file.ts? [y/N]` before touching anything. Auto-declines after 30 seconds if you don't respond.

**Writing** — optionally backs up the original as `file.ts.optimus.bak`, then writes the new content. The `/revert` command restores from this backup.

---

## 11. CLI Layer — `src/cli/`

Everything the user sees and types. Untouched by the simplification.

### `repl.ts`
The `optimus ❯` prompt loop. Reads your input, routes `/commands` to `commands.ts`, and sends everything else to `orchestrator.ts`. Keeps the last 6 conversation turns in memory.

### `commands.ts`
Handles all `/slash` commands:

| Command | What it does |
|---|---|
| `/index` | Re-index the entire project |
| `/index src/auth.ts` | Index a single file |
| `/watch` | Start the file watcher |
| `/clear` | Clear conversation history and terminal |
| `/models` | Run `ollama list` and show available models |
| `/revert src/auth.ts` | Restore file from `.optimus.bak` backup |
| `/help` | Show all commands |
| `/exit` | Exit cleanly |

### `display.ts`
Colored terminal output helpers: banner, errors (red ✖), success (green ✔), separator lines, source file list, and a spinner animation.

---

## 12. Utils — `src/utils/`

### `folderFileHandler.ts`
Generates a text representation of the project's folder structure. Shown after indexing so you can see what was scanned.

---

## 13. How All Files Connect

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
  │     │     │     │     └── src/indexer/chromaStore.ts
  │     │     │     └── src/retriever/contextBuilder.ts
  │     │     ├── src/llm/modelRouter.ts
  │     │     ├── src/llm/promptBuilder.ts
  │     │     ├── src/llm/ollamaClient.ts
  │     │     ├── src/agent/updateParser.ts
  │     │     └── src/agent/patcher.ts
  │     └── src/cli/commands.ts
  │           ├── src/indexer/indexer.ts
  │           └── src/indexer/watcher.ts
  ├── src/indexer/indexer.ts
  │     ├── src/indexer/fileScanner.ts
  │     ├── src/indexer/chunker.ts
  │     ├── src/indexer/embedder.ts
  │     └── src/indexer/chromaStore.ts
  └── src/indexer/watcher.ts
```

---

## 14. Key Concepts Explained Simply

**What is a vector/embedding?**
Every piece of text can be represented as a point in space — similar texts are close together, different texts are far apart. An embedding is just the coordinates of that point (a list of ~768 numbers). Searching means: convert your query to coordinates, find the nearest code chunks.

**What is ChromaDB?**
A database designed for storing and searching vectors. You give it a vector, it returns the closest matches. Think of it as a "similarity search engine" for your code.

**What is RAG?**
Retrieval-Augmented Generation. Instead of asking the AI to answer from memory, you first *retrieve* relevant code, *augment* the prompt with it, then let the AI *generate* an answer. This is why Optimus knows about your specific codebase.

**Why two AI models?**
`gemma:2b` is small and fast — good for explaining things. `codellama:7b` is trained specifically on code — better at writing and fixing it. Using the right model for the right task gives better results without wasting RAM.

**What is debouncing in the watcher?**
When you save a file, your editor may fire multiple "file changed" events rapidly. Debouncing waits 500ms after the *last* event before re-indexing, so the file is only processed once per save.

**What is the 30-second timeout?**
If you walk away mid-query, Optimus won't wait forever to write to your files. After 30 seconds with no response it auto-declines the change — a safety measure against accidental writes.

**What is `.optimus.bak`?**
Before overwriting a file (when `BACKUP_BEFORE_WRITE=true`), Optimus saves a copy as `filename.ts.optimus.bak`. Run `/revert filename.ts` to restore it.

---

*Reflects the current simplified codebase: 23 source files across 6 layers.*
