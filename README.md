# Optimus AI Agent

A fully local RAG-based coding assistant. Indexes your codebase into ChromaDB, retrieves relevant context on every query, and streams answers from Ollama — no cloud, no API keys, no data leaving your machine.

---

## Prerequisites

Before you start, make sure the following are installed and running:

- [ ] **Node.js 18+** — `node --version`
- [ ] **Ollama** — local LLM runtime
- [ ] **ChromaDB** — local vector database
- [ ] **Required models pulled** (see below)

### Install Ollama

```bash
# macOS
brew install ollama

# Linux / WSL
curl -fsSL https://ollama.ai/install.sh | sh
```

### Pull required models

```bash
ollama pull gemma:2b           # general Q&A (~1.7 GB)
ollama pull codellama:7b       # code tasks (~3.8 GB)
ollama pull nomic-embed-text   # embeddings (~274 MB)
```

### Install and start ChromaDB

```bash
pip install chromadb
chroma run --path ./chroma-data
```

ChromaDB will listen on `http://localhost:8000` by default.

---

## Installation

```bash
# 1. Clone / enter the project
cd optimus-ai-agent

# 2. Install Node dependencies
npm install

# 3. Copy and configure environment
cp .env.example .env
```

---

## Configuration

Edit `.env` — every variable has a sensible default:

| Variable | Default | Description |
|---|---|---|
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama server address |
| `CHROMA_URL` | `http://localhost:8000` | ChromaDB server address |
| `PROJECT_PATH` | `./my-project` | Path to the codebase you want to index |
| `GENERAL_MODEL` | `gemma:2b` | Model used for explanations and Q&A |
| `CODE_MODEL` | `codellama:7b` | Model used for code generation and fixes |
| `EMBED_MODEL` | `nomic-embed-text` | Embedding model for vector search |
| `COLLECTION_NAME` | `optimus_codebase` | ChromaDB collection name |
| `TOP_K` | `5` | Number of chunks retrieved per query |

```bash
# Minimal .env for a project at ~/code/my-app
PROJECT_PATH=../my-app
```

---

## Usage

### First-time indexing

Index your project before querying. This scans all source files, chunks them, generates embeddings, and stores them in ChromaDB.

```bash
npm run index
```

Output:
```
Found 42 files. Indexing...
[42/42] Indexed: src/routes/user.ts
Indexed 42 files, 318 chunks total.
```

### Start the interactive REPL

```bash
npm run dev
```

On startup, Optimus checks Ollama and ChromaDB connectivity, then drops you into the REPL:

```
optimus ❯ 
```

### Watch mode (index + auto-reindex on changes)

```bash
npm run watch
```

Starts a full index, then watches the project directory. Any file add/change/delete triggers an automatic re-index within 500ms.

### Production build

```bash
npm run build    # compiles TypeScript → dist/
npm start        # runs compiled output
```

---

## Example queries

```
optimus ❯ explain the authentication flow in this project
```
> Routes to `gemma:2b`. Retrieves auth-related chunks and explains the flow.

```
optimus ❯ fix the bug in src/routes/user.ts
```
> Routes to `codellama:7b`. Reads `src/routes/user.ts` directly (file path detected), streams a fix, then offers to apply it.

```
optimus ❯ add input validation to the createUser function
```
> Routes to `codellama:7b`. Finds `createUser` via vector search, generates updated code with validation.

```
optimus ❯ refactor the database connection to use connection pooling
```
> Routes to `codellama:7b`. Retrieves DB-related chunks, proposes a refactored version with connection pooling.

---

## REPL commands

| Command | Description |
|---|---|
| `/index` | Re-index the entire project |
| `/index src/auth.ts` | Index a single file |
| `/watch` | Start the file watcher |
| `/clear` | Clear conversation history |
| `/models` | List available Ollama models |
| `/revert src/auth.ts` | Restore file from `.optimus.bak` backup |
| `/help` | Show all commands |
| `/exit` | Exit cleanly |

---

## How code updates work

When Optimus generates a code change, it wraps it in structured markers:

```
===START_UPDATE: src/routes/user.ts===
export async function createUser(data: unknown) {
  const parsed = userSchema.parse(data);   // added validation
  return db.users.create(parsed);
}
===END_UPDATE===
```

After streaming completes, Optimus:

1. **Parses** all `START_UPDATE` / `END_UPDATE` blocks from the response
2. **Shows a colored diff** — red for removed lines, green for added lines, with 3 lines of context
3. **Asks for confirmation** before touching any file (30s timeout → auto-decline)
4. **Applies targeted replacement** — finds the function/class by name and replaces only that block
5. **Backs up** the original as `{file}.optimus.bak` before writing

To undo any applied patch:

```
optimus ❯ /revert src/routes/user.ts
```

---

## System requirements

Optimized for **Apple Silicon (M1/M2/M3) with 8 GB RAM**.

- Run **one model at a time** — Ollama unloads the previous model automatically
- `gemma:2b` uses ~2 GB RAM, `codellama:7b` uses ~4 GB RAM
- Embedding (`nomic-embed-text`) is lightweight and runs alongside either model
- For 8 GB machines, avoid running ChromaDB and Ollama simultaneously with other heavy apps

---

## Troubleshooting

### Ollama not running

```
✖ Ollama is not running.
```

```bash
ollama serve          # start the server
ollama list           # verify models are pulled
```

### ChromaDB connection refused

```
✖ ChromaDB is not running.
```

```bash
chroma run --path ./chroma-data
# or with a specific port:
chroma run --path ./chroma-data --port 8000
```

Make sure `CHROMA_URL` in `.env` matches the port ChromaDB is listening on.

### Out of memory / model crashes

Switch to `gemma:2b` for all tasks by setting both models to the same value:

```bash
# .env
GENERAL_MODEL=gemma:2b
CODE_MODEL=gemma:2b
```

Or reduce context size by lowering `TOP_K`:

```bash
TOP_K=3
```

### Empty context returned

The vector store has no data. Re-run the indexer:

```bash
npm run index
```

If the project path is wrong, check `PROJECT_PATH` in `.env`. The path is resolved relative to the project root.

### Embeddings are slow

Embedding is the bottleneck on first index. Subsequent runs only re-embed changed files (via the watcher). To speed up initial indexing, `nomic-embed-text` is the fastest Ollama embedding model — do not swap it for a larger one on 8 GB RAM.

### TypeScript build errors after pulling updates

```bash
npm install          # sync dependencies
npx tsc --noEmit     # check for type errors
```
