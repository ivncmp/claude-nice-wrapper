# cw - Claude Wrapper

A CLI wrapper around `claude --print` that adds **persistent memory**, **life/PARA knowledge injection**, **conversation history**, **interactive chat**, and **YAML prompt templates** on top of the Claude Code CLI.

Every prompt you send through `cw` is automatically enriched with personal context before reaching Claude. Memory snippets, life knowledge, workspace identity files, and today's conversation log are all assembled and injected as system prompt context — so Claude always knows who you are and what you've been talking about.

## Requirements

- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed and on PATH
- Node.js 18+
- Python 3 (optional, for semantic life/PARA search)

## Install

```bash
npm install -g claude-wrapper
```

Or for local development:

```bash
git clone <repo-url>
cd claude-nice-wrapper
npm install && npm run build && npm link
```

---

## Commands

### `cw <prompt>` - Quick prompt (shorthand for `cw ask`)

```bash
cw "explain this error"
echo "some code" | cw "review this"
cw -c "and what about this?"          # continue last session
cw -r abc123 "follow up"              # resume specific session
```

Piped stdin is appended to the prompt separated by `---`.

### `cw ask <prompt>` - Single-shot prompt

Same as the bare `cw <prompt>` but as an explicit subcommand. Accepts all flags.

### `cw chat` - Interactive conversation

Opens a readline REPL for multi-turn conversation. Memory and life context are injected on the first turn only; subsequent turns use `--resume` to maintain the session.

```bash
cw chat                    # new conversation
cw chat -c                 # continue last conversation
cw chat -r <session-id>    # resume a specific session
cw chat -m claude-3-opus   # use a specific model
```

Type `exit` or `quit` (or Ctrl+C) to end the session. The session ID is saved to `~/.claude-wrapper/current-session.json` for `-c` to pick up later.

### `cw memory` - Persistent memory snippets

Named markdown snippets stored in `~/.claude-wrapper/memory/`. By default, **all memory snippets are injected into every prompt** as system context, up to a configurable character limit.

```bash
cw memory set coding-style "Use functional patterns, avoid classes"
cw memory set project-context "Working on a billing system rewrite"
cw memory list                      # list all memory keys
cw memory get coding-style          # show a specific snippet
cw memory search "billing"          # search by key name or content
cw memory delete coding-style       # remove a snippet
```

Keys are slugified for filenames (e.g. `coding-style` becomes `coding-style.md`). Memory is truncated to `memory.maxInjectionChars` (default: **4000 chars**) when injected.

Use `--no-memory` to skip injection, or `--memory key1,key2` to inject only specific keys.

### `cw template` - Reusable YAML prompt templates

Templates are YAML files with `{{variable}}` placeholders, stored in `~/.claude-wrapper/templates/`.

```bash
cw template add review -p "Review this code for bugs: {{code}}"
cw template add review -f review-template.yaml    # import from file
cw template list
cw template show review
cw template run review --var code="$(cat src/main.ts)"
cw template delete review
```

#### Template YAML format

```yaml
name: review
description: Code review prompt
prompt: |
  Review the following code for bugs, security issues, and style:
  
  {{code}}
  
  Focus on: {{focus}}
variables:
  - name: code
    source: stdin      # automatically filled from piped input
    required: true
  - name: focus
    default: "correctness"
claudeOptions:
  model: claude-sonnet-4-20250514
  maxTurns: 3
```

Variable sources: `stdin` (from pipe), `arg`, or `flag` (from `--var key=value`). Unresolved optional variables are silently removed from the rendered prompt.

### `cw history` - Prompt/response history

Every prompt and response is saved to an append-only JSONL file at `~/.claude-wrapper/history.jsonl`. Each entry includes: prompt, response, session ID, cost, duration, model, and timestamp.

```bash
cw history list                     # last 20 entries
cw history list -n 50               # last 50 entries
cw history show <id>                # full details of an entry
cw history search "keyword"         # search prompts and responses
cw history clear                    # clear all history
cw history clear --before 2024-01-01  # clear entries before a date
```

Use `--no-history` to skip saving a particular prompt.

### `cw config` - Configuration

Configuration is stored in `~/.claude-wrapper/config.json`. Supports dot-notation for nested keys.

```bash
cw config                             # show all config
cw config set defaults.model sonnet
cw config set memory.maxInjectionChars 8000
cw config set life.autoInject false
cw config get memory.autoInject
```

#### Default configuration

```json
{
  "memory": {
    "autoInject": true,
    "defaultKeys": [],
    "maxInjectionChars": 4000
  },
  "life": {
    "autoInject": true,
    "dir": "",
    "maxInjectionChars": 12000
  },
  "history": {
    "maxEntries": 1000
  },
  "defaults": {
    "model": null,
    "maxTurns": null,
    "outputFormat": null
  }
}
```

---

## Context injection (how it all works)

Every time you run `cw`, multiple context sources are assembled and injected into Claude via `--append-system-prompt`. This happens automatically and transparently. Here's what gets injected and in what order:

### 1. Day chat log (highest priority, injected first)

A human-readable log of today's conversations is maintained at `~/life/chats/YYYY-MM-DD.md`. Every exchange is appended in the format:

```
Yo: <user message>
Assistant: <assistant response>
```

On each new prompt, today's full chat log is loaded and prepended to the context so Claude has continuity of what you've discussed today. Messages coming from Openclaw have their metadata blocks (untrusted metadata JSON) stripped before logging.

### 2. Workspace identity (from `~/.openclaw/workspace/`)

Bootstrap files that define the assistant's personality and the user's profile:

| File | Purpose |
|------|---------|
| `IDENTITY.md` | Who the assistant is |
| `SOUL.md` | Personality and tone |
| `USER.md` | User profile information |
| `MEMORY.md` | System-level memory |

These are read from `~/.openclaw/workspace/` and injected in order, up to **16,000 chars** total. Missing files are silently skipped.

### 3. Memory snippets (from `~/.claude-wrapper/memory/`)

All your saved memory snippets (or a filtered subset via `--memory key1,key2`), up to **4,000 chars** (configurable via `memory.maxInjectionChars`).

### 4. Life/PARA knowledge base (from `~/life/`)

Your personal knowledge base organized using the [PARA method](https://fortelabs.com/blog/para/) (Projects, Areas, Resources, Archive). The system scans:

```
~/life/
  projects/
    <project-name>/summary.md
  areas/
    <area-name>/summary.md
    people/
      <person-name>/summary.md
    systems/
      <system-name>/summary.md
  resources/
    <resource-name>/summary.md
```

Each entity is a folder with a `summary.md` file. The system has **two modes**:

- **Semantic search** (when a query/prompt is available): Runs `scripts/search_facts.py` to find entities relevant to your prompt. Returns matching entity summaries + top relevant facts. The "owner" entity (identified by `category: "owner"` in its `items.json`) is always included for identity resolution.

- **Full scan** (fallback, no query or search fails): Reads `~/life/index.md` as overview, then scans all `summary.md` files in order. Each summary is truncated to 1,500 chars.

Life context is capped at **12,000 chars** (configurable via `life.maxInjectionChars`). Use `--no-life` to skip, or `cw config set life.autoInject false` to disable globally.

### Context assembly

All parts are joined with `---` separators and passed as a single `--append-system-prompt` argument:

```
[Day chat log] --- [Workspace identity] --- [Memory snippets] --- [Life/PARA context]
```

In **chat mode**, this injection happens on the **first turn only**. Subsequent turns use `--resume` to maintain the session, so context is already established.

---

## Session management

### Session tokens and auto-reset

`cw` tracks token usage per session in `~/.claude-wrapper/session-state.json`. When using `--max-session-tokens <n>` with `--resume`, if the session has exceeded the token threshold, the resume is dropped and a fresh session starts automatically. This prevents runaway context growth in long-running sessions.

```bash
# Auto-reset after 100k tokens
cw -r my-session --max-session-tokens 100000 "next question"
```

### Recent history on reset

When a session resets (via `--history-dir`), recent user messages from Claude's JSONL session files can be extracted and injected to maintain conversational continuity. Only user messages from the last hour are included (up to 3,000 chars), with Telegram metadata stripped.

---

## All flags reference

| Flag | Commands | Description |
|------|----------|-------------|
| `-m, --model <model>` | ask, chat | Model to use (overrides `defaults.model`) |
| `-c, --continue` | ask, chat | Continue the last conversation session |
| `-r, --resume <id>` | ask, chat | Resume a specific session by ID |
| `--system-prompt <text>` | ask | Override the system prompt entirely |
| `--no-memory` | ask, chat | Skip memory snippet injection |
| `--memory <keys>` | ask | Inject only specific memory keys (comma-separated) |
| `--no-life` | ask, chat | Skip life/PARA context injection |
| `--no-history` | ask | Don't save this exchange to history |
| `--raw` | ask, template run | Print the full raw JSON response from Claude |
| `-o, --output-format <fmt>` | ask | Output format: `text`, `json`, `stream-json` |
| `--token-footer` | ask | Append a token usage summary to the response |
| `--max-turns <n>` | ask, chat | Maximum agent turns per invocation |
| `--max-budget-usd <n>` | ask | Maximum spend in USD for this call |
| `--max-session-tokens <n>` | ask | Reset session if total tokens exceed this |
| `--history-dir <path>` | ask | Openclaw sessions dir for recent history on reset |

---

## Data storage

```
~/.claude-wrapper/
  config.json              # all configuration
  history.jsonl            # append-only prompt/response history
  session-state.json       # per-session token counts
  current-session.json     # last chat session ID (for -c flag)
  debug.log                # debug output from life-store
  memory/                  # named memory snippets (*.md)
  templates/               # prompt templates (*.yaml)

~/.openclaw/workspace/
  IDENTITY.md              # assistant identity
  SOUL.md                  # personality/tone
  USER.md                  # user profile
  MEMORY.md                # system memory

~/life/
  index.md                 # life overview
  chats/YYYY-MM-DD.md      # daily conversation logs
  projects/*/summary.md    # PARA: project summaries
  areas/*/summary.md       # PARA: area summaries
  resources/*/summary.md   # PARA: resource summaries
```

## License

MIT
