# Refactoring Plan — Public Release

This document tracks the changes needed to make `cw` publishable as a generic open-source tool, free of personal tool dependencies, hardcoded paths, and language-specific strings.

**Status:** Planned (not started)

---

## Problems Identified

### P1 — Hardcoded personal paths (blockers)

| File | Hardcoded path | Impact |
|------|---------------|--------|
| `workspace-store.ts:6` | `~/.openclaw/workspace` | Workspace files directory not configurable |
| `chat-log-store.ts:5` | `~/life/chats` | Daily log directory not configurable |
| `life-store.ts` (Python) | `Path.home() / "life"` | PARA root in Python script ignores TS config |
| `life-store.ts` | debug writes to `~/.claude-wrapper/debug.log` | Silently writes debug output |

### P2 — Hardcoded Spanish strings (blockers)

| File | String | Should be |
|------|--------|-----------|
| `chat-log-store.ts:42` | `"## Conversación de hoy"` | Configurable section header |
| `chat-log-store.ts:57` | `"Yo: "` | Configurable user prefix |
| `chat-log-store.ts:57` | `"Assistant: "` | Configurable assistant prefix |
| `search_facts.py` | Spanish comments throughout | English |

### P3 — Hardcoded external tool integrations (blockers)

| File | Integration | Description |
|------|------------|-------------|
| `workspace-store.ts` | Openclaw | Path `~/.openclaw/workspace` is Openclaw-specific |
| `chat-log-store.ts` | Openclaw | `extractUserMessage()` strips Openclaw metadata blocks |
| `recent-history.ts:24` | Telegram | `stripTelegramMetadata()` strips Telegram message format |
| `recent-history.ts:60` | Telegram | Detection via `"(untrusted metadata)"` string |
| `README.md` | Openclaw | Historical references in docs (already cleaned up) |

### P4 — Configuration gaps (quality)

| Feature | Current | Should be |
|---------|---------|-----------|
| Workspace dir | Hardcoded `~/.openclaw/workspace` | `workspace.dir` in config |
| Workspace files list | Hardcoded array in code | `workspace.files` in config |
| Chat log dir | Hardcoded `~/life/chats` | `chatLog.dir` in config |
| Chat log user prefix | Hardcoded `"Yo:"` | `chatLog.userPrefix` in config |
| Chat log assistant prefix | Hardcoded `"Assistant:"` | `chatLog.assistantPrefix` in config |
| Chat log section header | Hardcoded `"## Conversación de hoy"` | `chatLog.sectionHeader` in config |
| Workspace max chars | Hardcoded `16000` | `workspace.maxInjectionChars` in config |
| Entity summary max chars | Hardcoded `1500` in life-store | `life.maxEntityChars` in config |
| Recent history window | Hardcoded `1` hour in ask.ts | `recentHistory.windowHours` in config |
| Recent history max chars | Hardcoded `3000` in ask.ts | `recentHistory.maxChars` in config |
| Python script path | Computed relative to `__dirname` | `LIFE_SEARCH_BIN` env var or config |
| Debug logging | Always writes to `debug.log` | `debug` flag in config or env var |

### P5 — Code quality issues (should fix)

| Issue | Location | Description |
|-------|----------|-------------|
| Duplicated context assembly | `ask.ts`, `chat.ts` | Same pattern repeated; should be shared function |
| Inconsistent context sources | `ask.ts` vs `chat.ts` | ask injects workspace+daychat, chat doesn't |
| No file locking | all stores | Concurrent calls can corrupt JSONL/JSON files |
| Inefficient history reads | `history-store.ts` | Full file scan on every list/search/clear |
| Silent debug writes | `life-store.ts` | Writes to debug.log without user consent |
| `--dangerously-skip-permissions` | `claude.ts` | Always passed; should be opt-in flag |

---

## Refactoring Plan

### Phase 1 — Parameterize all paths and strings

**Goal:** Zero hardcoded personal paths or strings. Everything configurable via `~/.claude-wrapper/config.json` with sensible generic defaults.

#### 1a. Extend `AppConfig` in `types.ts`

```typescript
interface AppConfig {
  memory: { autoInject: boolean; defaultKeys: string[]; maxInjectionChars: number };
  life: { autoInject: boolean; dir: string; maxInjectionChars: number; maxEntityChars: number };
  history: { maxEntries: number };
  workspace: {
    enabled: boolean;
    dir: string;                    // default: "" (disabled)
    maxInjectionChars: number;      // default: 16000
    files: Array<{ file: string; header: string }>;
  };
  chatLog: {
    enabled: boolean;
    dir: string;                    // default: "" (disabled)
    userPrefix: string;             // default: "User:"
    assistantPrefix: string;        // default: "Assistant:"
    sectionHeader: string;          // default: "## Today's conversation"
  };
  recentHistory: {
    windowHours: number;            // default: 1
    maxChars: number;               // default: 3000
  };
  debug: boolean;                   // default: false
}
```

#### 1b. Update `config.ts` defaults

Add new sections with generic English defaults. `workspace.dir` and `chatLog.dir` default to `""` (disabled) — users opt in by setting the path.

#### 1c. Refactor `workspace-store.ts`

- Accept `dir` and `files` from config instead of hardcoded constants
- Return `""` immediately if `dir` is empty

#### 1d. Refactor `chat-log-store.ts`

- Accept `dir`, `userPrefix`, `assistantPrefix`, `sectionHeader` from config
- Return `""` immediately if `dir` is empty
- Remove `extractUserMessage()` Openclaw-specific logic OR make it a generic "strip metadata blocks" option in config

#### 1e. Refactor `recent-history.ts`

- Remove `stripTelegramMetadata()` or rename to `stripMetadataBlocks()` and make it generic
- Remove Telegram-specific detection string `"(untrusted metadata)"`
- Accept `windowHours` and `maxChars` from config

#### 1f. Refactor `life-store.ts`

- Pass `life.dir` and `life.maxEntityChars` from config to all functions
- Remove hardcoded `1500` entity char limit
- Make debug logging conditional on `config.debug`
- Pass `LIFE_SEARCH_BIN` env var as override for Python script path

#### 1g. Update Python script `search_facts.py`

- Accept `--life-dir` argument instead of hardcoded `Path.home() / "life"`
- Translate all comments to English

---

### Phase 2 — Remove external tool coupling

**Goal:** No code references to Openclaw, Telegram, or any specific third-party integration.

#### 2a. Remove Openclaw references

- `workspace-store.ts`: Rename concept to "workspace bootstrap" (already generic) — just remove the hardcoded path
- `chat-log-store.ts`: Remove `extractUserMessage()` Openclaw-specific block stripping, or make it a generic "strip fenced code block metadata" utility that's off by default
- All docs: Remove remaining Openclaw mentions (already cleaned up in this pass)

#### 2b. Remove Telegram references

- `recent-history.ts`: Remove `stripTelegramMetadata()`, the `"(untrusted metadata)"` detection string, and the function entirely. The metadata stripping was a personal workaround — not useful for general users.

---

### Phase 3 — Consolidate context assembly

**Goal:** Single shared function for assembling the system prompt context, used by both `ask.ts` and `chat.ts`.

#### 3a. Create `src/lib/context-builder.ts`

```typescript
export interface ContextOptions {
  memory?: boolean | string[];   // false = skip, string[] = specific keys
  life?: boolean;
  workspace?: boolean;
  chatLog?: boolean;
  lifeQuery?: string;
  historyDir?: string;
}

export async function buildSystemPromptContext(
  opts: ContextOptions,
  config: AppConfig
): Promise<string>
```

- Encapsulates the full assembly pipeline
- Both `ask.ts` and `chat.ts` call this
- `chat.ts` passes `{ workspace: false, chatLog: false }` to maintain current behavior (or we align them)

#### 3b. Decide on ask vs chat parity

Either:
- **Option A:** Align chat with ask (inject workspace + chatLog on first turn too)
- **Option B:** Keep them different but make it explicit config: `chat.injectWorkspace`, `chat.injectChatLog`

---

### Phase 4 — Code quality improvements

**Goal:** Cleaner, more robust codebase suitable for public contributions.

#### 4a. Make `--dangerously-skip-permissions` opt-in

In `claude.ts`, only pass this flag when the user explicitly opts in via `--skip-permissions` flag or config. Document the security implications.

#### 4b. Structured error handling

Replace silent `catch {}` patterns with structured logging (to stderr when `debug: true`).

#### 4c. Optimize history reads

For `history-store.ts`, read JSONL from the end of file for `list` (most recent N entries) using a streaming approach, rather than reading the entire file.

---

## Execution Order

```
Phase 1 → Phase 2 → Phase 3 → Phase 4
```

Phases 1 and 2 are blockers for public release. Phases 3 and 4 are quality improvements that can ship incrementally after.

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
    "maxEntityChars": 1500
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
  "recentHistory": {
    "windowHours": 1,
    "maxChars": 3000
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
| `src/types.ts` | 1a | Extend `AppConfig` |
| `src/lib/config.ts` | 1b | New default config sections |
| `src/lib/workspace-store.ts` | 1c, 2a | Accept config, remove hardcoded path |
| `src/lib/chat-log-store.ts` | 1d, 2a | Accept config, remove hardcoded path + Spanish strings + Openclaw stripping |
| `src/lib/recent-history.ts` | 1e, 2b | Accept config, remove Telegram stripping |
| `src/lib/life-store.ts` | 1f | Accept config, conditional debug, env var for script path |
| `src/scripts/search_facts.py` | 1g, 2a | `--life-dir` arg, English comments |
| `src/lib/context-builder.ts` | 3a | New file: shared context assembly |
| `src/commands/ask.ts` | 3b | Use context-builder |
| `src/commands/chat.ts` | 3b | Use context-builder |
| `src/claude.ts` | 4a | Make `--dangerously-skip-permissions` opt-in |
| `src/lib/history-store.ts` | 4c | Optimize tail reads |
