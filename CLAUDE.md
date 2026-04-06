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

**Core execution:** `src/claude.ts` — `execClaude()` spawns `claude --print --output-format json` as a child process, parses JSON output into `ClaudeResult`. All Claude interactions flow through this single function.

**Commands** (`src/commands/`):
- `ask.ts` — single-shot prompt; injects memory context via `appendSystemPrompt`, saves to history
- `chat.ts` — interactive REPL using readline; tracks session ID across turns via `--resume`
- `history.ts` — list/show/search/clear history entries
- `memory.ts` — CRUD for named memory snippets (markdown files)
- `template.ts` — CRUD and execution of YAML prompt templates with `{{variable}}` interpolation

**Data layer** (`src/lib/`):
- `config.ts` — reads/writes `~/.claude-wrapper/config.json`; provides `getDataDir()` used by all stores
- `history-store.ts` — append-only JSONL file at `~/.claude-wrapper/history.jsonl`
- `memory-store.ts` — one `.md` file per key in `~/.claude-wrapper/memory/`; `buildMemoryContext()` assembles them for system prompt injection
- `template-store.ts` — one `.yaml` file per template in `~/.claude-wrapper/templates/`; `renderTemplate()` does `{{var}}` substitution
- `types.ts` — shared TypeScript interfaces (`ClaudeOptions`, `ClaudeResult`, `HistoryEntry`, `TemplateDefinition`, `AppConfig`)

**Build:** tsup bundles `src/index.ts` into a single ESM file in `dist/` with a `#!/usr/bin/env node` shebang. The package uses `"type": "module"` and Node16/NodeNext module resolution — all local imports must use `.js` extensions.
