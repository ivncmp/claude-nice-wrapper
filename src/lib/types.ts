export interface ClaudeOptions {
  prompt: string;
  stdinContent?: string;
  maxTurns?: number;
  maxBudgetUsd?: number;
  model?: string;
  systemPrompt?: string;
  appendSystemPrompt?: string;
  resumeSessionId?: string;
  continueSession?: boolean;
  allowedTools?: string[];
  additionalArgs?: string[];
}

export interface ClaudeUsage {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
  total: number;
}

export interface ClaudeResult {
  result: string;
  sessionId: string;
  costUsd: number;
  durationMs: number;
  isError: boolean;
  usage?: ClaudeUsage;
  raw?: unknown;
}

export interface HistoryEntry {
  id: string;
  timestamp: string;
  prompt: string;
  result: string;
  sessionId: string;
  costUsd: number;
  durationMs: number;
  model?: string;
  templateUsed?: string;
}

export interface SessionInfo {
  sessionId: string;
  startedAt: string;
  name?: string;
}

export interface TemplateDefinition {
  name: string;
  description?: string;
  prompt: string;
  variables?: TemplateVariable[];
  claudeOptions?: Partial<Pick<ClaudeOptions, 'model' | 'maxTurns' | 'maxBudgetUsd'>>;
}

export interface TemplateVariable {
  name: string;
  source?: 'stdin' | 'arg' | 'flag';
  required?: boolean;
  default?: string;
}

export interface AppConfig {
  memory: {
    autoInject: boolean;
    defaultKeys: string[];
    maxInjectionChars: number;
  };
  life: {
    autoInject: boolean;
    dir: string;
    maxInjectionChars: number;
    maxEntityChars: number;
    pythonBin: string;
  };
  history: {
    maxEntries: number;
  };
  workspace: {
    enabled: boolean;
    dir: string;
    maxInjectionChars: number;
    files: Array<{ file: string; header: string }>;
  };
  chatLog: {
    enabled: boolean;
    dir: string;
    userPrefix: string;
    assistantPrefix: string;
    sectionHeader: string;
  };
  claude: {
    bin: string;
    skipPermissions: boolean;
  };
  defaults: {
    model?: string;
    maxTurns?: number;
    outputFormat?: 'text' | 'json' | 'stream-json';
  };
  debug: boolean;
}
