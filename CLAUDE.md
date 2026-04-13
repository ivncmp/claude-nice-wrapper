# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

`claude-wrapper` (`cw`) is a CLI wrapper around the `claude --print` command. It adds persistent memory, context injection, interactive chat, conversation history, and YAML-based prompt templates on top of the Claude Code CLI. It requires the `claude` CLI to be installed and on PATH.

## Build & Dev Commands

```bash
npm run build          # Build with tsup (output: dist/)
npm run dev            # Build in watch mode
npm link               # Install `cw` globally for local testing
```

No test framework is configured yet. No linter is configured.

## Architecture

**Entry point:** `src/index.ts` — Commander CLI setup. The bare `cw <prompt>` invocation is a shorthand that delegates to `runAsk()`. Config set/get commands are registered directly here.

**Core execution:** `src/claude.ts` — `execClaude()` spawns `claude --print --output-format json --dangerously-skip-permissions` as a child process, parses JSON output into `ClaudeResult`. All Claude interactions flow through this single function. Also exports `readStdin()` for piped input.

**Commands** (`src/commands/`):
- `ask.ts` — single-shot prompt; assembles context from multiple sources via `appendSystemPrompt`, saves to history and daily chat log
- `chat.ts` — interactive REPL using readline; tracks session ID across turns via `--resume`; context only injected on first turn; does NOT inject workspace or day-chat context (inconsistency vs ask.ts)
- `history.ts` — list/show/search/clear history entries
- `memory.ts` — CRUD for named memory snippets (markdown files)
- `template.ts` — CRUD and execution of YAML prompt templates with `{{variable}}` interpolation

**Data layer** (`src/lib/`):
- `config.ts` — reads/writes `~/.claude-wrapper/config.json`; provides `getDataDir()` used by all stores; supports dot-notation keys for deep get/set
- `history-store.ts` — append-only JSONL file at `~/.claude-wrapper/history.jsonl`; scans entire file on every read/search (no indexing)
- `memory-store.ts` — one `.md` file per key in `~/.claude-wrapper/memory/` (keys are slugified for filenames); `buildMemoryContext()` assembles them for system prompt injection
- `template-store.ts` — one `.yaml` file per template in `~/.claude-wrapper/templates/`; `renderTemplate()` does `{{var}}` substitution
- `life-store.ts` — optional PARA knowledge base integration; two modes: semantic search (via bundled `scripts/search_facts.py`) when a query is provided, or full scan of `<life.dir>/{projects,areas,resources}/**/summary.md` as fallback; `life.dir` is configurable via config but defaults empty (disabled); Python script path is computed relative to `__dirname` post-build
- `workspace-store.ts` — reads bootstrap files (`IDENTITY.md`, `SOUL.md`, `USER.md`, `MEMORY.md`) from `config.workspace.dir` to inject personality/identity context; configurable file list via `config.workspace.files`; disabled by default (`workspace.enabled: false`)
- `chat-log-store.ts` — human-readable daily conversation log at `config.chatLog.dir` (`YYYY-MM-DD.md`); prefixes configurable via `config.chatLog.userPrefix` / `config.chatLog.assistantPrefix`; disabled by default (`chatLog.enabled: false`)
- `session-state.ts` — tracks per-session token counts in `~/.claude-wrapper/session-state.json`; used by `ask.ts` to auto-reset sessions that exceed `--max-session-tokens`
- `context-builder.ts` — shared `buildSystemPromptContext()` function used by both `ask.ts` and `chat.ts` to assemble all context sources
- `types.ts` — shared TypeScript interfaces (`ClaudeOptions`, `ClaudeResult`, `HistoryEntry`, `TemplateDefinition`, `AppConfig`)

## Context Injection Pipeline

Context is assembled in `ask.ts` from multiple sources **in this priority order** (highest first):

1. **Day chat log** (`chat-log-store.ts`) — today's conversation history; injected via `unshift` to be highest priority
2. **Workspace bootstrap** (`workspace-store.ts`) — identity/personality files from `config.workspace.dir`
3. **Memory snippets** (`memory-store.ts`) — named markdown snippets; truncated to `config.memory.maxInjectionChars` (default 4,000)
4. **Life/PARA context** (`life-store.ts`) — knowledge base summaries; truncated to `config.life.maxInjectionChars` (default 12,000)

All parts joined with `"\n\n---\n\n"` and passed via `--append-system-prompt`.

**Important inconsistency:** `chat.ts` only injects memory + life (no workspace, no day-chat). This is intentional for now but diverges from `ask.ts` behavior.

## Session Management

`ask.ts` supports `--max-session-tokens <n>`: checks `session-state.ts` before resuming — if the session exceeds the token threshold, drops `--resume` and starts fresh. Token counts persisted after each call via `updateSessionTokens()`.

## Known Issues (for refactoring)

See `REFACTORING.md` for the full list. Key items:

1. **Workspace and chat log** are disabled by default — users must configure `workspace.dir` and `chatLog.dir` to enable them
4. **Context injection inconsistency:** `ask.ts` vs `chat.ts` inject different sources
5. **Duplicated context assembly logic:** not extracted into a shared function
6. **Python script path:** fragile relative path computation post-build
7. **No file locking:** concurrent writes to history/session-state can corrupt data
8. **History inefficiency:** full JSONL scan on every read/search/clear

## Build

tsup bundles `src/index.ts` into a single ESM file in `dist/` with a `#!/usr/bin/env node` shebang. A post-build step copies `src/scripts/` → `dist/scripts/` to bundle the Python search script.

The package uses `"type": "module"` and NodeNext module resolution — all local imports must use `.js` extensions.

## Key CLI Flags

Shared across `ask` and `chat`: `--no-memory`, `--memory <keys>` (comma-separated), `--no-life`, `--no-history`, `--raw`, `--token-footer`, `--max-session-tokens <n>`, `-c/--continue`, `-r/--resume <id>`, `-m/--model`, `--max-turns`, `--max-budget-usd`.
