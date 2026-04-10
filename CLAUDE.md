# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

`claude-wrapper` (`cw`) is a CLI wrapper around the `claude --print` command. It adds history, persistent memory, interactive chat, and YAML-based prompt templates on top of the Claude Code CLI. It requires the `claude` CLI to be installed and on PATH.

## Build & Dev Commands

```bash
npm run build          # Build with tsup (output: dist/)
npm run dev            # Build in watch mode
npm link               # Install `cw` globally for local testing
```

No test framework is configured yet. No linter is configured.

## Architecture

**Entry point:** `src/index.ts` — sets up Commander CLI program. The bare `cw <prompt>` invocation is a shorthand that delegates to `runAsk()`.

**Core execution:** `src/claude.ts` — `execClaude()` spawns `claude --print --output-format json --dangerously-skip-permissions` as a child process, parses JSON output into `ClaudeResult`. All Claude interactions flow through this single function. Also exports `readStdin()` for piped input.

**Commands** (`src/commands/`):
- `ask.ts` — single-shot prompt; injects memory + life context via `appendSystemPrompt`, saves to history
- `chat.ts` — interactive REPL using readline; tracks session ID across turns via `--resume`; system prompt only injected on first turn
- `history.ts` — list/show/search/clear history entries
- `memory.ts` — CRUD for named memory snippets (markdown files)
- `template.ts` — CRUD and execution of YAML prompt templates with `{{variable}}` interpolation
- Config commands are registered directly in `index.ts` (`cw config set/get`)

**Data layer** (`src/lib/`):
- `config.ts` — reads/writes `~/.claude-wrapper/config.json`; provides `getDataDir()` used by all stores; supports dot-notation keys for deep get/set
- `history-store.ts` — append-only JSONL file at `~/.claude-wrapper/history.jsonl`
- `memory-store.ts` — one `.md` file per key in `~/.claude-wrapper/memory/` (keys are slugified for filenames); `buildMemoryContext()` assembles them for system prompt injection
- `template-store.ts` — one `.yaml` file per template in `~/.claude-wrapper/templates/`; `renderTemplate()` does `{{var}}` substitution
- `life-store.ts` — optional PARA knowledge base integration; has two modes: semantic search (via bundled `scripts/search_facts.py`) when a query is provided, or full scan of `~/life/{projects,areas,resources}/**/summary.md` as fallback; injected alongside memory context
- `workspace-store.ts` — reads bootstrap files (`IDENTITY.md`, `SOUL.md`, `USER.md`, `MEMORY.md`) from `~/.openclaw/workspace/` to inject personality/identity context; truncated to 16000 chars
- `chat-log-store.ts` — human-readable daily conversation log at `~/life/chats/YYYY-MM-DD.md`; also provides `buildDayChatContext()` to inject today's conversation history. Strips Openclaw metadata blocks from user messages before logging
- `session-state.ts` — tracks per-session token counts in `~/.claude-wrapper/session-state.json`; used by `ask.ts` to auto-reset sessions that exceed `--max-session-tokens`
- `recent-history.ts` — parses Claude JSONL session files to extract recent user messages within a time window; used to inject conversational continuity on session reset
- `types.ts` — shared TypeScript interfaces (`ClaudeOptions`, `ClaudeResult`, `HistoryEntry`, `TemplateDefinition`, `AppConfig`)

**Context injection pipeline:** Context is assembled in `ask.ts` from multiple sources in this priority order: day chat log (unshifted to front), workspace bootstrap files, memory, and life context. All parts are joined with `"\n\n---\n\n"` and passed to Claude via `--append-system-prompt`. Memory is truncated to `config.memory.maxInjectionChars` (default 4000), life to `config.life.maxInjectionChars` (default 12000), and workspace to 16000 chars. In `chat.ts`, injection happens on the first turn only (subsequent turns use `--resume`).

**Session management:** `ask.ts` supports `--max-session-tokens <n>` which checks `session-state.ts` before resuming — if the session exceeds the token threshold, it drops the `--resume` flag and starts fresh. Token counts are persisted after each call via `updateSessionTokens()`.

**Key CLI flags** shared across commands: `--no-memory`, `--memory <keys>` (comma-separated), `--no-life`, `--no-history`, `--raw`, `--token-footer`, `--max-session-tokens <n>`, `--history-dir <path>`, `-c/--continue` (resume last session), `-r/--resume <id>`.

**Build:** tsup bundles `src/index.ts` into a single ESM file in `dist/` with a `#!/usr/bin/env node` shebang. The package uses `"type": "module"` and Node16/NodeNext module resolution — all local imports must use `.js` extensions.
