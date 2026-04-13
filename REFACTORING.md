# Refactoring Plan — Public Release

This document tracks the changes needed to make `cw` publishable as a generic open-source tool, free of personal tool dependencies, hardcoded paths, and language-specific strings.

**Status:** Complete (4e deferred — low priority)
**Last updated:** 2026-04-13

---

## Problems Identified

### P1 — Hardcoded personal paths (blockers)

| File | Line | Hardcoded path | Impact |
|------|------|---------------|--------|
| `workspace-store.ts` | 6 | `~/.openclaw/workspace` | Workspace dir not configurable |
| `chat-log-store.ts` | 5 | `~/life/chats` | Daily log dir not configurable |
| `life-store.ts` | 25 | `~/life` (fallback when `life.dir` is `""`) | Life dir active even when config looks "disabled" |
| `life-store.ts` | 13 | `~/.claude-wrapper/debug.log` | Debug output written unconditionally |
| `search_facts.py` | 24 | `~/life` | Python script ignores TS config entirely |

### P2 — Hardcoded Spanish strings (blockers)

| File | Line | String | Should be |
|------|------|--------|-----------|
| `chat-log-store.ts` | 41 | `"## Conversación de hoy"` | Configurable section header |
| `chat-log-store.ts` | 57 | `"Yo: "` | Configurable user prefix |
| `chat-log-store.ts` | 57 | `"Assistant: "` | Configurable assistant prefix |
| `search_facts.py` | throughout | 25+ Spanish comments and docstrings | English |

### P3 — Hardcoded external tool integrations (blockers)

| File | Line | Integration | Description |
|------|------|------------|-------------|
| `workspace-store.ts` | 6 | Openclaw | Path `~/.openclaw/workspace` is Openclaw-specific |
| `chat-log-store.ts` | 12-33 | Openclaw | `extractUserMessage()` strips Openclaw metadata blocks |
| `recent-history.ts` | 24-28 | Telegram | `stripTelegramMetadata()` function |
| `recent-history.ts` | 60 | Telegram | Detection via `"(untrusted metadata)"` string |
| `index.ts` | 68 | Openclaw | CLI help text: `"Openclaw sessions dir..."` |
| `ask.ts` | 170 | — | Comment: `"Save human-readable chat log to ~/life/chats/"` |
| `CLAUDE.md` | 38, 39, 49, 65, 67 | Openclaw | Multiple references to `~/.openclaw/workspace/`, Openclaw metadata stripping |
| `README.md` | 177, 190, 276, 277 | Openclaw | References to `~/.openclaw/workspace/` and `~/life/chats/` as hardcoded paths |

### P4 — Configuration gaps (quality)

| Feature | Current | Should be |
|---------|---------|-----------|
| Workspace dir | Hardcoded `~/.openclaw/workspace` | `workspace.dir` in config |
| Workspace files list | Hardcoded array in code | `workspace.files` in config |
| Workspace max chars | Hardcoded `16000` | `workspace.maxInjectionChars` |
| Chat log dir | Hardcoded `~/life/chats` | `chatLog.dir` in config |
| Chat log user prefix | `"Yo:"` | `chatLog.userPrefix` |
| Chat log assistant prefix | `"Assistant:"` | `chatLog.assistantPrefix` |
| Chat log section header | Spanish string | `chatLog.sectionHeader` |
| Entity summary max chars | `1500` (duplicated in lines 206, 267) | `life.maxEntityChars` |
| Recent history window | `1` hour in function default | `recentHistory.windowHours` |
| Recent history max chars | `3000` in function default | `recentHistory.maxChars` |
| Python binary path | `"python3"` | `life.pythonBin` or env var |
| Python script path | `join(__dirname, "scripts", ...)` | `LIFE_SEARCH_BIN` env var |
| Debug logging | Always on | `debug` flag in config |
| Claude binary path | `"claude"` | `claude.bin` or `CLAUDE_BIN` env var |
| Skip permissions flag | Always on | `claude.skipPermissions` (default: `true`) |
| Data directory | `~/.claude-wrapper` | `CW_DATA_DIR` env var override |

### P5 — Bugs (must fix)

| Bug | Location | Description |
|-----|----------|-------------|
| Shallow config merge | `config.ts:39` | `{ ...DEFAULT_CONFIG, ...parsed }` is shallow — setting any key in a section (e.g., `memory.autoInject`) loses all other defaults in that section (`defaultKeys`, `maxInjectionChars`). **Corrupts config on partial overrides.** |
| Chat doesn't reinject context on resume | `chat.ts:125` | `appendSystemPrompt: !sessionId ? appendSystemPrompt : undefined` — on `--resume`, system prompt is `undefined`, so memory/life context is lost. |
| Data loss on invalid date | `history.ts:78` → `history-store.ts:52` | Invalid `--before` date → `new Date(x).getTime()` = `NaN` → filter `>= NaN` is always false → ALL entries deleted. |
| extractUserMessage corrupts code | `chat-log-store.ts:29` | Uses `lastIndexOf("```")` — any user message containing triple backticks (code snippets) gets truncated in the chat log. |
| History JSONL single-line corruption | `history-store.ts:69` | `JSON.parse(line)` inside `.map()` — a single corrupted line throws and breaks ALL history commands. No per-line error handling. |
| `life.dir: ""` doesn't mean disabled | `life-store.ts:24` | Empty `life.dir` falls back to `~/life` instead of disabling. Config looks like "disabled" but feature is active. |
| `history.maxEntries` never enforced | `history-store.ts` | Config value exists but is never applied — history grows unbounded. |
| Chat readline concurrency | `chat.ts:105` | Async handler in `rl.on("line")` — readline doesn't await, so typing during a pending response can interleave requests. |

### P6 — Dead code (should remove)

| Dead code | Location | Description |
|-----------|----------|-------------|
| `buildRecentHistoryContext()` | `recent-history.ts` | Exported, never imported anywhere. `--history-dir` flag exists but feature is not wired. |
| `getSessionIdleMinutes()` | `session-state.ts:34` | Exported, never called. |
| `listLifeEntities()` | `life-store.ts:286` | Exported, never called. |
| `ClaudeOptions.outputFormat` | `types.ts:4` | Defined but never used in `buildArgs()`. |
| `--history-dir` flag | `index.ts:68`, `ask.ts` | Declared in CLI but never connected to `buildRecentHistoryContext`. |

### P7 — Security (should fix)

| Issue | Location | Severity |
|-------|----------|----------|
| `--dangerously-skip-permissions` always on | `claude.ts:82` | **High** — every invocation bypasses Claude's permission system with no opt-out |
| Full env passthrough | `claude.ts:11` | Medium — `{ ...process.env }` passes all env vars including secrets to child process |
| Silent directory creation | `chat-log-store.ts:56` | Low — creates `~/life/chats/` without user consent |
| No config schema validation | `config.ts:68-87` | Low — any value can be set, no type checking |

### P8 — Code quality (should fix)

| Issue | Location | Description |
|-------|----------|-------------|
| Duplicated context assembly | `ask.ts:63-109`, `chat.ts:72-91` | Same pattern repeated; should be shared function |
| Duplicated list display | `history.ts:17-32 / 83-97`, `memory.ts:38-46 / 78-86` | Default action duplicates list subcommand verbatim |
| Inconsistent context sources | `ask.ts` vs `chat.ts` | ask injects workspace+daychat, chat doesn't |
| Chat doesn't save to daily log | `chat.ts` | `addChatLog()` never called — chat conversations missing from day-chat context |
| No file locking | all stores | Concurrent `cw` calls can corrupt JSONL/JSON files |
| Silent `catch {}` blocks | `claude.ts:67`, `life-store.ts:13` | Swallow errors without logging |
| `mkdir` on every call | `chat-log-store.ts:56` | `mkdir(CHATS_DIR, { recursive: true })` called on every log write instead of once |
| PARA collection mismatch | `life-store.ts:110` vs `search_facts.py:131-162` | TS scans 3 top-level dirs, Python scans 6 specific sub-paths — different results for the same query |
| Token total may double-count | `claude.ts:56` | `total = input + output + cacheWrite + cacheRead` — semantics depend on Claude CLI output format |
| `readStdin()` no timeout | `claude.ts:128-143` | If stdin stream errors, it hangs forever |
| Session state unbounded | `session-state.ts` | Old sessions never pruned from `session-state.json` |
| Template variable typos silent | `template-store.ts:62` | Unresolved `{{vars}}` are silently removed instead of erroring |

---

## Refactoring Plan

### Phase 0 — Bug fixes (pre-refactor)

**Goal:** Fix data-loss bugs and security issues that affect current users, without restructuring.

#### 0a. Fix shallow config merge — DONE

In `config.ts`, replace `{ ...DEFAULT_CONFIG, ...parsed }` with a deep merge that preserves nested defaults:

```typescript
function deepMerge(defaults: any, overrides: any): any {
  const result = { ...defaults };
  for (const key in overrides) {
    if (typeof defaults[key] === "object" && !Array.isArray(defaults[key]) && typeof overrides[key] === "object") {
      result[key] = deepMerge(defaults[key], overrides[key]);
    } else {
      result[key] = overrides[key];
    }
  }
  return result;
}
```

#### 0b. Fix history data loss on invalid date — DONE

In `history-store.ts`, validate the `before` date before filtering:

```typescript
const cutoff = new Date(before).getTime();
if (isNaN(cutoff)) throw new Error(`Invalid date: "${before}"`);
```

#### 0c. Fix JSONL parse resilience — DONE

In `history-store.ts`, wrap `JSON.parse` per line:

```typescript
const entries = lines.filter(l => l.trim()).flatMap(line => {
  try { return [JSON.parse(line) as HistoryEntry]; }
  catch { return []; }
});
```

#### 0d. Fix `extractUserMessage` triple-backtick bug — DONE

Entire `extractUserMessage()` function removed. Chat log now uses raw user prompt (trimmed).

#### 0e. Make `--dangerously-skip-permissions` opt-in — DONE

Flag is now controlled by `config.claude.skipPermissions` (default: `false`). Claude binary path also configurable via `config.claude.bin`.

---

### Phase 1 — Parameterize all paths and strings

**Goal:** Zero hardcoded personal paths or strings. Everything configurable via `~/.claude-wrapper/config.json` with sensible generic defaults.

#### 1a. Extend `AppConfig` in `src/lib/types.ts` — DONE

```typescript
export interface AppConfig {
  memory: {
    autoInject: boolean;
    defaultKeys: string[];
    maxInjectionChars: number;
  };
  life: {
    autoInject: boolean;
    dir: string;               // default: "" (disabled — no fallback to ~/life)
    maxInjectionChars: number;
    maxEntityChars: number;    // default: 1500
    pythonBin: string;         // default: "python3"
  };
  history: {
    maxEntries: number;        // default: 1000 (and enforce it)
  };
  workspace: {
    enabled: boolean;
    dir: string;               // default: "" (disabled)
    maxInjectionChars: number; // default: 16000
    files: Array<{ file: string; header: string }>;
  };
  chatLog: {
    enabled: boolean;
    dir: string;               // default: "" (disabled)
    userPrefix: string;        // default: "User:"
    assistantPrefix: string;   // default: "Assistant:"
    sectionHeader: string;     // default: "## Today's conversation"
  };
  claude: {
    bin: string;               // default: "claude"
    skipPermissions: boolean;  // default: false
  };
  defaults: {
    model?: string;
    maxTurns?: number;
    outputFormat?: "text" | "json" | "stream-json";
  };
  debug: boolean;              // default: false
}
```

#### 1b. Update `config.ts` defaults and fix deep merge — DONE

- [x] Add all new sections with generic English defaults
- [x] `workspace.dir`, `chatLog.dir`, and `life.dir` default to `""` (disabled)
- [x] `life.dir: ""` means **disabled** — `~/life` fallback removed from `life-store.ts`
- [x] Replace shallow spread with `deepMerge()`
- [x] Support `CW_DATA_DIR` env var to override `~/.claude-wrapper`

#### 1c. Refactor `workspace-store.ts` — DONE

- [x] Accept `dir`, `files`, `maxInjectionChars` from config instead of hardcoded constants
- [x] Return `""` immediately if `dir` is empty or `enabled` is false
- [x] Remove `~/.openclaw/workspace` path entirely

#### 1d. Refactor `chat-log-store.ts` — DONE

- [x] Accept `dir`, `userPrefix`, `assistantPrefix`, `sectionHeader` from config
- [x] Return `""` immediately if `dir` is empty or `enabled` is false
- [x] Remove `extractUserMessage()` (Openclaw-specific)
- [x] Remove all Spanish strings

#### 1e. Refactor `recent-history.ts` — DONE

- [x] Accept `windowHours` and `maxChars` from config
- [x] Remove `stripTelegramMetadata()` entirely
- [x] Remove `"(untrusted metadata)"` detection string

#### 1f. Refactor `life-store.ts` — DONE

- [x] Read `life.dir`, `life.maxEntityChars`, `life.pythonBin` from config
- [x] When `life.dir` is `""`, return `""` immediately — no fallback to `~/life`
- [x] Make debug logging conditional on `config.debug`
- [x] Replace `1500` magic number with `config.life.maxEntityChars`
- [x] Pass `--life-dir` to Python script
- [x] Fix `summaryPath.replace(...)` to use `join(dirname(...), "items.json")`
- [x] Support `LIFE_SEARCH_BIN` env var for Python script path override

#### 1g. Update `search_facts.py` — DONE

- [x] Add `--life-dir` argument (required); remove hardcoded `LIFE_DIR = Path.home() / "life"`
- [x] Translate all comments and docstrings to English
- [x] Remove emoji from output strings

#### 1h. Enforce `history.maxEntries` — DONE

History is pruned after each append if count exceeds `config.history.maxEntries`.

---

### Phase 2 — Remove external tool coupling

**Goal:** No code references to Openclaw, Telegram, or any specific third-party integration.

#### 2a. Remove Openclaw references — DONE

- [x] `workspace-store.ts`: Remove hardcoded `~/.openclaw/workspace` (done in 1c)
- [x] `chat-log-store.ts`: Remove `extractUserMessage()` Openclaw stripping (done in 1d)
- [x] `index.ts:68`: Change `--history-dir` description from `"Openclaw sessions dir..."` to generic description
- [x] `ask.ts:170`: Remove comment referencing `~/life/chats/`

#### 2b. Remove Telegram references — DONE

- [x] `recent-history.ts`: Deleted `stripTelegramMetadata()`, `"(untrusted metadata)"` detection, and all related code

#### 2c. Update documentation — remove all hardcoded path references — DONE

- [x] **`CLAUDE.md`**: Removed all references to `~/.openclaw/workspace/`, `~/life/chats/`, Openclaw metadata stripping, and Telegram. Replaced with config key references.
- [x] **`README.md`**: Removed all hardcoded path references. Workspace and chatLog now described as configurable via config keys.

#### 2d. Remove dead code — DONE

- [x] `recent-history.ts` — deleted entirely (file + `--history-dir` flag + `recentHistory` config section)
- [x] `getSessionIdleMinutes()` from `session-state.ts` — deleted
- [x] `listLifeEntities()` from `life-store.ts` — deleted
- [x] `outputFormat` from `ClaudeOptions` in `types.ts` — deleted

---

### Phase 3 — Consolidate context assembly

**Goal:** Single shared function for building system prompt context, fixing the chat resume bug and context inconsistency.

#### 3a. Create `src/lib/context-builder.ts` — DONE

Shared `buildSystemPromptContext()` function. Both `ask.ts` and `chat.ts` now call it with the same interface.

#### 3b. Fix chat resume context loss — DONE

`appendSystemPrompt` is now always passed in `chat.ts`, not conditionally on `!sessionId`.

#### 3c. Add `addChatLog()` to chat.ts — DONE

Chat conversations are now saved to the daily chat log via `addChatLog()`.

#### 3d. Decide on ask vs chat parity — DONE (Option A)

Both ask and chat now inject the same context sources (workspace, chatLog, memory, life) via the shared context-builder.

---

### Phase 4 — Code quality improvements

**Goal:** Cleaner, more robust codebase suitable for public contributions.

#### 4a. Deduplicate list display — DONE

Extracted `printEntryList()` in `history.ts` and `printKeyList()` in `memory.ts`. Default action and list subcommand now share the same function.

#### 4b. Add chat input locking — DONE

`rl.pause()` before sending, `rl.resume()` after response. Prevents concurrent requests.

#### 4c. Prune session state — DONE

Sessions older than 7 days are pruned on every `updateSessionTokens()` call.

#### 4d. Structured error handling — DONE

Silent `catch {}` blocks in `workspace-store.ts`, `life-store.ts`, and `history-store.ts` now log errors via `debugLog()` or `if (config.debug) console.error(...)`. Expected "file not found" catches (memory, template, session stores) left silent as they handle normal control flow.

#### 4e. Optimize history reads — DEFERRED

Low priority now that `maxEntries` is enforced (capped at 1000 lines). Reading the full file is acceptable at that size. A streaming tail-read can be added later if history files grow large.

#### 4f. Fix `readStdin()` timeout — DONE

`readStdin()` in `claude.ts` now has a 5-second timeout via `setTimeout`. The timeout is cleared on normal `end` event.

#### 4g. Validate template variables — DONE

`renderTemplate()` now warns to stderr about unresolved variables before removing them.

#### 4h. PARA collection alignment — DONE

Python `search_facts.py` now uses recursive directory discovery matching the TypeScript `discoverEntities()` approach. `_all_search_paths()` recursively walks `projects/`, `areas/`, `resources/` looking for directories containing `items.json`, instead of hardcoding 6 specific sub-paths. Collection filter (`--collection`) still maps to scoped base directories but discovers entities recursively within them.

---

## Execution Order

```
Phase 0 (bugs)  →  Phase 1 (parameterize)  →  Phase 2 (decouple)  →  Phase 3 (consolidate)  →  Phase 4 (quality)
```

- **Phase 0** can ship immediately as a patch release — fixes data-loss bugs and security.
- **Phases 1 + 2** are blockers for public release. Can be done together since 2 builds on 1.
- **Phase 3** fixes the chat resume bug (critical) and cleans up duplication. Should ship with or right after Phase 1.
- **Phase 4** is incremental quality work. Ship anytime after Phase 2.

---

## New Default Config (post-refactor)

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
    "maxInjectionChars": 12000,
    "maxEntityChars": 1500,
    "pythonBin": "python3"
  },
  "workspace": {
    "enabled": false,
    "dir": "",
    "maxInjectionChars": 16000,
    "files": [
      { "file": "IDENTITY.md", "header": "## Identity" },
      { "file": "SOUL.md",     "header": "## Soul / Personality" },
      { "file": "USER.md",     "header": "## User Profile" },
      { "file": "MEMORY.md",   "header": "## System Memory" }
    ]
  },
  "chatLog": {
    "enabled": false,
    "dir": "",
    "userPrefix": "User:",
    "assistantPrefix": "Assistant:",
    "sectionHeader": "## Today's conversation"
  },
  "claude": {
    "bin": "claude",
    "skipPermissions": false
  },
  "history": {
    "maxEntries": 1000
  },
  "defaults": {
    "model": null,
    "maxTurns": null,
    "outputFormat": null
  },
  "debug": false
}
```

---

## Files Requiring Changes

| File | Phase | Changes |
|------|-------|---------|
| `src/lib/config.ts` | 0a, 1b | Deep merge fix, new defaults, `CW_DATA_DIR` env var |
| `src/lib/history-store.ts` | 0b, 0c, 1h, 4e | Date validation, JSONL resilience, enforce maxEntries, optimize reads |
| `src/lib/chat-log-store.ts` | 0d, 1d, 2a | Fix backtick bug, parameterize, remove Openclaw/Spanish |
| `src/claude.ts` | 0e, 1a | Skip-permissions opt-in, configurable binary path |
| `src/lib/types.ts` | 1a | Extend `AppConfig` with all new sections |
| `src/lib/workspace-store.ts` | 1c, 2a | Accept config, remove hardcoded Openclaw path |
| `src/lib/recent-history.ts` | 2d | **Deleted** |
| `src/lib/life-store.ts` | 1f, 2d, 4h | Accept config, remove fallback, conditional debug, fix path replace |
| `src/scripts/search_facts.py` | 1g, 4h | `--life-dir` arg, English, configurable collections |
| `src/index.ts` | 2a | Remove Openclaw from help text |
| `src/lib/context-builder.ts` | 3a | **New file**: shared context assembly |
| `src/commands/ask.ts` | 2a, 3a, 3d | Remove hardcoded comment, use context-builder |
| `src/commands/chat.ts` | 3b, 3c, 3d, 4b | Fix resume bug, use context-builder, add chat log, input locking |
| `src/commands/history.ts` | 4a | Deduplicate list display |
| `src/commands/memory.ts` | 4a | Deduplicate list display |
| `src/lib/session-state.ts` | 2d, 4c | Remove dead code, add pruning |
| `src/lib/template-store.ts` | 4g | Warn on unresolved variables |
| `CLAUDE.md` | 2c | Remove all hardcoded paths (`~/.openclaw/`, `~/life/`), Openclaw/Telegram refs; use config key references |
| `README.md` | 2c | Remove all hardcoded paths, Openclaw refs; document paths as configurable via config keys |
| `package.json` | — | Add `engines`, `author`, `repository` fields |

---

## Open Decisions

1. ~~**`--history-dir` / recent history injection**~~ — **Resolved:** removed. `recent-history.ts` deleted, `--history-dir` flag removed, `recentHistory` config section removed.

2. ~~**Chat + ask parity**~~ — **Resolved:** Option A implemented. Both use shared `context-builder.ts`.

3. **`cw init` wizard:** With so many optional features (workspace, chatLog, life), should we add an interactive `cw init` command to guide setup? Not blocking for release but strongly recommended.

4. **Package name:** Resolve `"claude-wrapper"` (package.json) vs `claude-nice-wrapper` (directory/repo) vs `cw` (binary name). Pick one canonical name.
