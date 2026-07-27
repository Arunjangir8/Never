# Optimus AI Agent

A local RAG coding assistant. It indexes a codebase into ChromaDB, retrieves the
relevant chunks for your question, and answers with a model running on your own
machine via Ollama. No API keys, no data leaving your laptop.

It can also **edit files** — always after showing you the change and asking.

Local is the default, not the limit: one `PROVIDER=` switch points it at
OpenRouter, Groq, MiniMax, OpenAI, Gemini or Anthropic instead. Embeddings
stay local either way.

---

## Quickstart

Install the two servers once. Optimus starts them for you after that.

```bash
brew install ollama         # macOS (Linux: curl -fsSL https://ollama.ai/install.sh | sh)
pip install chromadb
```

Then:

```bash
npm install
cp .env.example .env
```

Open `.env` and set **`PROJECT_PATH`** to the folder you want Optimus to read
and edit. That one setting is the whole security boundary, Optimus cannot touch
anything outside it.

```bash
PROJECT_PATH=../my-app
```

Run it:

```bash
npm run index      # one-time: build the vector index
npm run dev        # start chatting
```

On startup Optimus will:

1. Start **Ollama** if it isn't already running
2. Start **ChromaDB** if it isn't already running
3. Check the models it needs, and offer to `ollama pull` any that are missing
4. Drop you into the chat

`/exit` (or Ctrl+C outside the chat) shuts the servers back down.

When you quit, Optimus stops the servers it started.

The two rules that matter:

- **Already running?** Optimus reuses it and never double-starts, whether it's
  in this terminal, another one, or the Ollama desktop app.
- **Started by someone else?** Optimus never stops it on exit. Only servers it
  launched itself get shut down, so quitting can't kill work you had running.

Set `AUTO_START=false` to run the servers yourself, or `AUTO_STOP=false` to
leave Optimus-started ones up after you quit.

Server output goes to `.optimus-logs/`. Each run starts from an empty log, and
a log is deleted once its server is stopped, so nothing accumulates. The one
exception is a server that **failed to start**: its log is kept on purpose,
because it's the only clue why.

Running two copies of Optimus at once is the one rough edge: the second reuses
the first's servers, so whichever quits first takes them down. Use
`AUTO_STOP=false` if you work that way.

Inside the chat, `/status` prints the live provider, models and paths. Check it
first when something behaves unexpectedly.

### Models

Optimus pulls these on first run if you approve:

| Model | Size | Used for |
|---|---|---|
| `nomic-embed-text` | ~274 MB | Embeddings. Always needed, even on a hosted provider. |
| `gemma:2b` | ~1.7 GB | Chat and explanations. Only checked when `PROVIDER=local`. |
| `qwen2.5-coder:7b` | ~4.7 GB | Code edits and the bug-fixer. Only checked when `PROVIDER=local`. |

---

## Configuration

Every variable has a working default. You normally only touch `PROJECT_PATH`.

| Variable | Default | What it does |
|---|---|---|
| `PROVIDER` | `local` | `local` \| `openrouter` \| `groq` \| `minimax` \| `openai` \| `gemini` \| `anthropic`. An unknown value warns and falls back to `local`. |
| `PROJECT_PATH` | `./my-project` | Folder Optimus reads and edits. Hard boundary. |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama server |
| `CHROMA_URL` | `http://localhost:8000` | ChromaDB server |
| `CHROMA_PATH` | `./chroma-data` | Where ChromaDB stores data when Optimus starts it |
| `AUTO_START` | `true` | Start Ollama/ChromaDB if they aren't running |
| `AUTO_STOP` | `true` | On exit, stop only the servers Optimus started |
| `AUTO_PULL_MODELS` | `false` | Pull missing models without asking |
| `COLLECTION_NAME` | `optimus_codebase` | ChromaDB collection |
| `TOP_K` | `5` | Chunks retrieved per query |
| `LOCAL_GENERAL_MODEL` | `gemma:2b` | Used for explanations and chat |
| `LOCAL_CODE_MODEL` | `qwen2.5-coder:7b` | Used for code edits and the bug-fixer. That's the `.env.example` value; with no `.env` at all the built-in fallback is `codellama:7b-instruct`. |
| `LOCAL_EMBED_MODEL` | `nomic-embed-text` | Embeddings. Always local. |
| `ALLOW_NEW_FILES` | `false` | Let the model create files that don't exist |
| `BACKUP_BEFORE_WRITE` | `true` | Write `<file>.optimus.bak` before overwriting |
| `MAX_DEBUG_CHUNKS` | `10` | Cap on chunks per `npm run debug` run |
| `WATCH_AUTOFIX` | `false` | Run the bug-fixer on every save in watch mode |

### Hosted providers

Set `PROVIDER` to one of these and fill in its key. Nothing else changes —
retrieval, indexing and the safety rails work the same.

| `PROVIDER` | Key | Model var (default) | Notes |
|---|---|---|---|
| `openrouter` | `OPENROUTER_API_KEY` | `OPENROUTER_MODEL` (`deepseek/deepseek-r1:free`) | One key, most open models. Free ones end in `:free`. |
| `groq` | `GROQ_API_KEY` | `GROQ_MODEL` (`llama-3.3-70b-versatile`) | Fastest, largest free tier. |
| `minimax` | `MINIMAX_API_KEY` | `MINIMAX_MODEL` (`MiniMax-M2.5`) | Has a $0 tier. |
| `openai` | `OPENAI_API_KEY` | `OPENAI_MODEL` (`gpt-4o-mini`) | Paid. Set `OPENAI_BASE_URL` only for a different compatible host. |
| `gemini` | `GEMINI_API_KEY` | `GEMINI_MODEL` (`gemini-2.0-flash`) | |
| `anthropic` | `ANTHROPIC_API_KEY` | `ANTHROPIC_MODEL` (`claude-3-haiku-20240307`) | Paid. |

OpenRouter, Groq, MiniMax and OpenAI all speak the OpenAI protocol and share
one client; each carries its own `*_BASE_URL` (already defaulted), so
`PROVIDER=` is the only switch you touch. Gemini and Anthropic use their own
clients.

Two things stay local no matter the provider: **embeddings** always run through
Ollama (`nomic-embed-text`), and only `local` swaps model by query type — a
hosted provider uses its one model for both chat and code.

A hosted provider with no key set fails at query time with an explicit
`Set <PROVIDER>_API_KEY in .env, or use PROVIDER=local`, not a silent fallback.

Put real keys in `.env` only — it is gitignored. `.env.example` must stay
placeholder-only.

---

## Commands

```bash
npm run dev              # interactive chat (default)
npm run index            # index PROJECT_PATH into ChromaDB
npm run watch            # index, then re-index on every save
npm run debug -- <file>  # run the Red/Blue bug-fixer on one file
npm run debug            # run it across the project (slow — see note below)
npm run dev -- --help    # modes and where config lives

npm test                 # unit tests
npm run typecheck        # tsc --noEmit
npm run build && npm start
```

### In-chat commands

| Command | Description |
|---|---|
| `/status` | Show active provider, models, project path, safety rails |
| `/index` | Re-index the whole project |
| `/index src/auth.ts` | Index one file (path relative to `PROJECT_PATH`) |
| `/watch` | Start the file watcher |
| `/models` | List pulled Ollama models |
| `/revert src/auth.ts` | Restore a file from its `.optimus.bak` |
| `/clear` | Clear the screen |
| `/help` | Show commands |
| `/exit` | Quit |

---

## How file edits work

1. Your question is classified as **code** or **general** (keyword match, see
   `src/llm/modelRouter.ts`).
2. General → answered as plain prose, nothing is written.
3. Code → the model returns JSON describing per-file updates:
   - `fullfile` — replace the whole file
   - `createNew` — create a file (needs `ALLOW_NEW_FILES=true`)
   - `patchs` — find/replace (**hosted providers only**; local models can't
     reproduce a snippet byte-for-byte reliably enough to be safe)
4. The parser repairs what small models get wrong on the way out — fenced
   blocks, trailing prose, raw newlines and bad escapes inside strings — so a
   nearly-valid response still lands as updates instead of an error
   (`src/agent/updateParser.ts`, covered by `updateParser.test.ts`).
5. Optimus prints each proposed change and **asks before writing anything**.
6. On approval it backs up each file to `<file>.optimus.bak`, then writes.
7. `/revert <file>` restores the backup.

Nothing outside `PROJECT_PATH` can be touched, and a patch that matches zero or
more than one place in a file is rejected rather than guessed at.

---

## The Red/Blue bug-fixer

`npm run debug -- src/thing.ts` runs a two-agent pass:

- **Red** reads each chunk and reports bugs, edge cases and risks.
- You approve sending those findings on.
- **Blue** turns the findings into concrete file updates.
- You approve again before anything is written.

**Give it one file at a time.** Each chunk is one LLM round-trip, which is
5–20 s on a local 7B model. Running it project-wide is why `MAX_DEBUG_CHUNKS`
exists (default 10); the run tells you when it truncates.

---

## Getting good results from small local models

- **Ask for one thing per message.** "add input validation to createUser" works;
  "refactor the whole auth layer" does not.
- **Name the file** — `fix the off-by-one in src/utils/paging.ts`. A literal path
  in your message bypasses vector search and feeds the model the real file.
- **Re-index after editing outside Optimus** (`/index <file>`), or retrieval
  serves stale chunks.
- **A bigger code model is the highest-leverage change.** `gemma:2b` cannot
  reliably produce a whole valid file; `qwen2.5-coder:7b` can. If output arrives
  malformed, that's usually the cause.
- Keep `ALLOW_NEW_FILES=false` until you trust the setup — it stops a confused
  model from scattering files through your project.

---

## System requirements

Runs on an 8 GB Apple Silicon Mac, one model at a time (Ollama unloads the
previous one automatically).

- `gemma:2b` ≈ 2 GB RAM, `qwen2.5-coder:7b` ≈ 5 GB
- `nomic-embed-text` is small and runs alongside either
- On 8 GB, don't run other heavy apps next to Ollama + ChromaDB

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `✖ Ollama is not installed` | `brew install ollama` |
| `✖ ChromaDB is not installed` | `pip install chromadb`, then check `which chroma` |
| `✖ X did not come up within Ns` | Read `.optimus-logs/x.log`, kept for exactly this case. Usually the port is taken by something else. |
| `✖ X is not reachable` + "Remote host" | `CHROMA_URL`/`OLLAMA_BASE_URL` points off-machine, so Optimus can't start it. Start it there, or point back at localhost. |
| `PROJECT_PATH does not exist` | Fix `PROJECT_PATH` in `.env` |
| `⚠ No valid JSON detected in LLM response` | Model too small for structured output — use a 7B coder model |
| `Refusing to create X (ALLOW_NEW_FILES=false)` | Intentional. Set `ALLOW_NEW_FILES=true` if you want new files. |
| `Patch target is ambiguous` | The snippet appears more than once; retry, or switch to a `fullfile` edit |
| `No backup found for X` | The edit ran with `BACKUP_BEFORE_WRITE=false` |
| Answers cite code you already deleted | Stale index — `/index` again |

---

## Layout

```
src/
  index.ts           entry point, CLI modes, startup checks
  config.ts          all env parsing, single source of truth
  cli/               REPL, slash commands, terminal output
  indexer/           scan → chunk → embed → ChromaDB
  retriever/         query → chunks → prompt context
  llm/               provider clients, model routing, prompts
  agent/
    orchestrator.ts  the chat pipeline (LangGraph)
    updateParser.ts  tolerant JSON → FileUpdate[]
    applyUpdates.ts  the only place that writes to disk
    bug-fixer/       Red + Blue agent pipeline
  utils/
    services.ts            starts Ollama/ChromaDB, checks models
    folderFileHandler.ts   sandboxed file I/O, backups
```
