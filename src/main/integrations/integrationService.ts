import fs from "node:fs";
import path from "node:path";
import type {
  IntegrationAgentDiagnostics,
  IntegrationAgentId,
  IntegrationDiagnostics,
  IntegrationHealth,
  IntegrationInstallResult,
  IntegrationListenerDiagnostics,
} from "../../shared/integrationTypes";
import {
  buildCodeBuddyHookCommand,
  buildCodexHookArgv,
  buildCursorHookCommand,
  detectLegacyHookCommand,
  type HookCommandContext,
} from "../hook/commandBuilder";
import type { SessionStatus } from "../../shared/sessionTypes";

type IntegrationServiceOptions = {
  homeDir: string;
  hookScriptsRoot: string;
  packaged: boolean;
  execPath: string;
  appPath: string;
  now?: () => number;
};

type LastEvent = {
  at: number;
  status: SessionStatus;
};

const AGENT_LABELS: Record<IntegrationAgentId, string> = {
  codex: "Codex",
  cursor: "Cursor",
  codebuddy: "CodeBuddy",
};

function defaultNow() {
  return Date.now();
}

function labelsForHealth(health: IntegrationHealth): {
  healthLabel: string;
  actionLabel: string;
} {
  switch (health) {
    case "active":
      return { healthLabel: "正常", actionLabel: "修复" };
    case "legacy_path":
      return { healthLabel: "待迁移", actionLabel: "迁移" };
    case "repair_needed":
      return { healthLabel: "需修复", actionLabel: "修复" };
    case "not_configured":
    default:
      return { healthLabel: "未配置", actionLabel: "启用" };
  }
}

function cursorHooksMatch(
  hooks: Record<string, unknown>,
  required: Record<string, string>,
): boolean {
  return Object.entries(required).every(([eventName, command]) => {
    const eventEntries = hooks[eventName];
    return (
      Array.isArray(eventEntries) &&
      eventEntries.some(
        (entry) =>
          entry &&
          typeof entry === "object" &&
          (entry as Record<string, unknown>).command === command,
      )
    );
  });
}

function cursorHooksEmpty(hooks: Record<string, unknown>, eventNames: string[]): boolean {
  return eventNames.every((eventName) => {
    const value = hooks[eventName];
    return !Array.isArray(value) || value.length === 0;
  });
}

function readOptionalJson(pathname: string): {
  exists: boolean;
  parsed?: Record<string, unknown>;
  error?: string;
} {
  if (!fs.existsSync(pathname)) {
    return { exists: false };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(pathname, "utf8")) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { exists: true, error: "配置文件结构不是 JSON 对象" };
    }
    return { exists: true, parsed };
  } catch (error) {
    return {
      exists: true,
      error: `配置文件不是合法 JSON：${(error as Error).message}`,
    };
  }
}

function readOptionalText(pathname: string): {
  exists: boolean;
  text?: string;
  error?: string;
} {
  if (!fs.existsSync(pathname)) {
    return { exists: false };
  }

  try {
    return { exists: true, text: fs.readFileSync(pathname, "utf8") };
  } catch (error) {
    return {
      exists: true,
      error: `配置文件无法读取：${(error as Error).message}`,
    };
  }
}

function ensureParentDir(pathname: string) {
  fs.mkdirSync(path.dirname(pathname), { recursive: true });
}

function backupFile(pathname: string, now: () => number): string {
  const backupPath = `${pathname}.bak.${now()}`;
  fs.copyFileSync(pathname, backupPath);
  return backupPath;
}

function formatJson(value: Record<string, unknown>): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function buildCursorCommand(hookScriptPath: string, eventName: string): string {
  return `"${hookScriptPath}" ${eventName}`;
}

function buildCodeBuddyCommand(hookScriptPath: string): string {
  return `"${hookScriptPath}"`;
}

const CURSOR_HOOK_EVENT_NAMES = [
  "sessionStart",
  "stop",
  "beforeSubmitPrompt",
  "afterAgentResponse",
  "afterAgentThought",
  "beforeReadFile",
  "afterFileEdit",
  "beforeMCPExecution",
  "afterMCPExecution",
  "beforeShellExecution",
  "afterShellExecution",
] as const;

function cursorConfigPath(homeDir: string): string {
  return path.join(homeDir, ".cursor", "hooks.json");
}

function codeBuddyConfigPath(homeDir: string): string {
  return path.join(homeDir, ".codebuddy", "settings.json");
}

function cursorHookScriptPath(hookScriptsRoot: string): string {
  return path.join(hookScriptsRoot, "cursor-agent-hook.sh");
}

function codeBuddyHookScriptPath(hookScriptsRoot: string): string {
  return path.join(hookScriptsRoot, "codebuddy-hook.sh");
}

function codexConfigPath(homeDir: string): string {
  return path.join(homeDir, ".codex", "config.toml");
}

function codexSessionsPath(homeDir: string): string {
  return path.join(homeDir, ".codex", "sessions");
}

type CodexNotifyConfig =
  | { kind: "missing" }
  | { kind: "parsed"; argv: string[]; start: number; end: number }
  | { kind: "invalid"; message: string };

function arrayBracketBalance(value: string): number {
  return [...value].reduce((balance, char) => {
    if (char === "[") return balance + 1;
    if (char === "]") return balance - 1;
    return balance;
  }, 0);
}

function readCodexNotifyConfig(text: string): CodexNotifyConfig {
  const pattern = /^notify\s*=\s*/gm;
  const match = pattern.exec(text);
  if (!match || match.index === undefined) {
    return { kind: "missing" };
  }

  const valueStart = match.index + match[0].length;
  let cursor = valueStart;
  let balance = 0;
  let sawBracket = false;

  while (cursor < text.length) {
    const char = text[cursor];
    if (char === "[") {
      sawBracket = true;
    }
    if (sawBracket) {
      balance += arrayBracketBalance(char);
      if (balance === 0) {
        cursor += 1;
        break;
      }
    } else if (!/\s/.test(char)) {
      return { kind: "invalid", message: "Codex config.toml notify 必须是字符串数组" };
    }
    cursor += 1;
  }

  if (!sawBracket || balance !== 0) {
    return { kind: "invalid", message: "Codex config.toml notify 数组不完整" };
  }

  const raw = text.slice(valueStart, cursor).trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return {
      kind: "invalid",
      message: `Codex config.toml notify 不是可解析的字符串数组：${(error as Error).message}`,
    };
  }

  if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === "string")) {
    return { kind: "invalid", message: "Codex config.toml notify 必须是字符串数组" };
  }

  let end = cursor;
  while (end < text.length && text[end] !== "\n") {
    end += 1;
  }
  if (end < text.length && text[end] === "\n") {
    end += 1;
  }

  return { kind: "parsed", argv: parsed, start: match.index, end };
}

function codexNotifyArrayLiteral(argv: string[]): string {
  return `[${argv.map((value) => JSON.stringify(value)).join(", ")}]`;
}

function arraysEqual(left: string[], right: string[]): boolean {
  return (
    left.length === right.length && left.every((value, index) => value === right[index])
  );
}

function upsertCodexNotifyConfig(text: string, argv: string[]): { changed: boolean; text: string } {
  const nextLine = `notify = ${codexNotifyArrayLiteral(argv)}\n`;
  const current = readCodexNotifyConfig(text);

  if (current.kind === "invalid") {
    throw new Error(current.message);
  }
  if (current.kind === "parsed") {
    if (arraysEqual(current.argv, argv)) {
      return { changed: false, text };
    }
    return {
      changed: true,
      text: `${text.slice(0, current.start)}${nextLine}${text.slice(current.end)}`,
    };
  }

  if (!text.trim()) {
    return { changed: true, text: nextLine };
  }

  const firstTableIndex = text.search(/^\[/m);
  if (firstTableIndex === -1) {
    const prefix = text.endsWith("\n") ? text : `${text}\n`;
    return { changed: true, text: `${prefix}${nextLine}` };
  }

  const prefix = text.slice(0, firstTableIndex);
  const suffix = text.slice(firstTableIndex);
  const joiner = prefix.trim().length === 0 ? "" : prefix.endsWith("\n\n") ? "" : "\n";
  return {
    changed: true,
    text: `${prefix}${joiner}${nextLine}${suffix}`,
  };
}

function inspectCodexConfig(
  homeDir: string,
  hookCtx: HookCommandContext,
  lastEvent?: LastEvent,
): IntegrationAgentDiagnostics {
  const configPath = codexConfigPath(homeDir);
  const sessionsPath = codexSessionsPath(homeDir);
  const sessionsExist = fs.existsSync(sessionsPath);
  const config = readOptionalText(configPath);
  const desiredNotifyArgv = buildCodexHookArgv(hookCtx);

  let health: IntegrationHealth = "not_configured";
  let hookInstalled = false;
  let statusMessage = sessionsExist
    ? "自动读取 Codex session 日志，完成通知 notify hook 尚未启用"
    : "未配置 Codex hook，也未找到 session 日志目录";

  if (config.error) {
    health = "repair_needed";
    statusMessage = config.error;
  } else if (config.text !== undefined) {
    const notify = readCodexNotifyConfig(config.text);
    if (notify.kind === "invalid") {
      health = "repair_needed";
      statusMessage = notify.message;
    } else if (notify.kind === "parsed" && arraysEqual(notify.argv, desiredNotifyArgv)) {
      health = "active";
      hookInstalled = true;
      statusMessage = sessionsExist
        ? "已配置 Codex 完成通知 notify hook，并自动读取 session 日志"
        : "已配置 Codex 完成通知 notify hook，等待 Codex session 日志";
    } else if (notify.kind === "parsed") {
      health = "repair_needed";
      statusMessage = "Codex config.toml notify 与当前 CodePal 要求不一致";
    }
  }

  const { healthLabel } = labelsForHealth(health);

  return {
    id: "codex",
    label: AGENT_LABELS.codex,
    supported: true,
    configPath,
    configExists: config.exists,
    hookScriptPath: configPath,
    hookScriptExists: config.exists,
    hookInstalled,
    health,
    healthLabel,
    actionLabel: labelsForHealth(health).actionLabel,
    statusMessage,
    ...(lastEvent ? { lastEventAt: lastEvent.at, lastEventStatus: lastEvent.status } : {}),
  };
}

function inspectCursorConfig(
  homeDir: string,
  hookScriptsRoot: string,
  hookCtx: HookCommandContext,
  lastEvent?: LastEvent,
): IntegrationAgentDiagnostics {
  const configPath = cursorConfigPath(homeDir);
  const hookScriptPath = cursorHookScriptPath(hookScriptsRoot);
  const hookScriptExists = fs.existsSync(hookScriptPath);
  const config = readOptionalJson(configPath);
  const requiredNew = Object.fromEntries(
    CURSOR_HOOK_EVENT_NAMES.map((eventName) => [eventName, buildCursorHookCommand(hookCtx)]),
  ) as Record<string, string>;
  const requiredLegacy = {
    sessionStart: buildCursorCommand(hookScriptPath, "sessionStart"),
    stop: buildCursorCommand(hookScriptPath, "stop"),
  };
  const eventNames = Object.keys(requiredNew);
  const legacyEventNames = Object.keys(requiredLegacy);

  let health: IntegrationHealth = "not_configured";
  let hookInstalled = false;
  let statusMessage = "未配置 CodePal Cursor hooks";

  if (config.error) {
    health = "repair_needed";
    statusMessage = config.error;
  } else if (!config.exists) {
    health = "not_configured";
  } else if (config.parsed) {
    const hooksValue = config.parsed.hooks;
    if (hooksValue && typeof hooksValue === "object" && !Array.isArray(hooksValue)) {
      const hooks = hooksValue as Record<string, unknown>;
      const hooksAreEmpty = cursorHooksEmpty(hooks, eventNames);
      const hasNew = cursorHooksMatch(hooks, requiredNew);
      const hasLegacyExact = cursorHooksMatch(hooks, requiredLegacy);
      const hasLegacyDetect =
        legacyEventNames.every((eventName) => {
          const eventEntries = hooks[eventName];
          if (!Array.isArray(eventEntries)) return false;
          return eventEntries.some(
            (entry) =>
              entry &&
              typeof entry === "object" &&
              detectLegacyHookCommand(
                String((entry as Record<string, unknown>).command ?? ""),
              ),
          );
        }) && !hasNew;
      const hasLegacy = hasLegacyExact || hasLegacyDetect;

      if (hasNew) {
        health = "active";
        hookInstalled = true;
        statusMessage = "已配置用户级 Cursor hooks";
      } else if (hasLegacy) {
        health = "legacy_path";
        hookInstalled = true;
        statusMessage = "检测到旧版 CodePal Cursor hook 命令，建议迁移";
      } else if (!hooksAreEmpty) {
        health = "repair_needed";
        statusMessage = "Cursor hooks.json 与当前 CodePal 要求不一致";
      } else {
        health = "not_configured";
      }
    } else {
      health = "repair_needed";
      statusMessage = "Cursor hooks.json 结构不兼容";
    }
  }

  const { healthLabel, actionLabel } = labelsForHealth(health);

  return {
    id: "cursor",
    label: AGENT_LABELS.cursor,
    supported: true,
    configPath,
    configExists: config.exists,
    hookScriptPath,
    hookScriptExists,
    hookInstalled,
    health,
    healthLabel,
    actionLabel,
    statusMessage,
    ...(lastEvent ? { lastEventAt: lastEvent.at, lastEventStatus: lastEvent.status } : {}),
  };
}

type CodeBuddyRequiredEntry = {
  eventName: string;
  matcher?: string;
  command: string;
};

function codeBuddyRequiredEntries(hookScriptPath: string): CodeBuddyRequiredEntry[] {
  const command = buildCodeBuddyCommand(hookScriptPath);
  return [
    { eventName: "SessionStart", command },
    { eventName: "UserPromptSubmit", command },
    { eventName: "SessionEnd", command },
    { eventName: "Notification", matcher: "permission_prompt", command },
    { eventName: "Notification", matcher: "idle_prompt", command },
  ];
}

function codeBuddyRequiredNewEntries(hookCtx: HookCommandContext): CodeBuddyRequiredEntry[] {
  const command = buildCodeBuddyHookCommand(hookCtx);
  return [
    { eventName: "SessionStart", command },
    { eventName: "UserPromptSubmit", command },
    { eventName: "SessionEnd", command },
    { eventName: "Notification", matcher: "permission_prompt", command },
    { eventName: "Notification", matcher: "idle_prompt", command },
  ];
}

function codeBuddyEveryRequiredSatisfiedByDetectLegacy(
  hooks: Record<string, unknown>,
  templates: CodeBuddyRequiredEntry[],
): boolean {
  return templates.every((required) => {
    const entries = hooks[required.eventName];
    if (!Array.isArray(entries)) return false;
    return entries.some((entry) => {
      if (!entry || typeof entry !== "object") return false;
      const record = entry as Record<string, unknown>;
      if (required.matcher !== undefined && record.matcher !== required.matcher) return false;
      if (required.matcher === undefined && "matcher" in record && record.matcher !== undefined) {
        return false;
      }
      if (!Array.isArray(record.hooks)) return false;
      return record.hooks.some(
        (hook) =>
          hook &&
          typeof hook === "object" &&
          (hook as Record<string, unknown>).type === "command" &&
          detectLegacyHookCommand(String((hook as Record<string, unknown>).command ?? "")),
      );
    });
  });
}

function codeBuddyHooksMatch(
  hooks: Record<string, unknown>,
  required: CodeBuddyRequiredEntry[],
): boolean {
  return required.every((requiredEntry) => hasCodeBuddyHookEntry(hooks[requiredEntry.eventName], requiredEntry));
}

function codeBuddyHooksEmpty(hooks: Record<string, unknown>): boolean {
  const keys = ["SessionStart", "UserPromptSubmit", "SessionEnd", "Notification"] as const;
  return keys.every((key) => {
    const value = hooks[key];
    return !Array.isArray(value) || value.length === 0;
  });
}

function hasCodeBuddyHookEntry(entries: unknown, required: CodeBuddyRequiredEntry): boolean {
  if (!Array.isArray(entries)) return false;
  return entries.some((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const record = entry as Record<string, unknown>;
    if (required.matcher !== undefined && record.matcher !== required.matcher) return false;
    if (required.matcher === undefined && "matcher" in record && record.matcher !== undefined) {
      return false;
    }
    if (!Array.isArray(record.hooks)) return false;
    return record.hooks.some(
      (hook) =>
        hook &&
        typeof hook === "object" &&
        (hook as Record<string, unknown>).type === "command" &&
        (hook as Record<string, unknown>).command === required.command,
    );
  });
}

function inspectCodeBuddyConfig(
  homeDir: string,
  hookScriptsRoot: string,
  hookCtx: HookCommandContext,
  lastEvent?: LastEvent,
): IntegrationAgentDiagnostics {
  const configPath = codeBuddyConfigPath(homeDir);
  const hookScriptPath = codeBuddyHookScriptPath(hookScriptsRoot);
  const hookScriptExists = fs.existsSync(hookScriptPath);
  const config = readOptionalJson(configPath);
  const requiredNew = codeBuddyRequiredNewEntries(hookCtx);
  const requiredLegacy = codeBuddyRequiredEntries(hookScriptPath);

  let health: IntegrationHealth = "not_configured";
  let hookInstalled = false;
  let statusMessage = "未配置 CodePal CodeBuddy hooks";

  if (config.error) {
    health = "repair_needed";
    statusMessage = config.error;
  } else if (!config.exists) {
    health = "not_configured";
  } else if (config.parsed) {
    const hooksValue = config.parsed.hooks;
    if (hooksValue && typeof hooksValue === "object" && !Array.isArray(hooksValue)) {
      const hooks = hooksValue as Record<string, unknown>;
      const hooksAreEmpty = codeBuddyHooksEmpty(hooks);
      const hasNew = codeBuddyHooksMatch(hooks, requiredNew);
      const hasLegacyExact = codeBuddyHooksMatch(hooks, requiredLegacy);
      const hasLegacyDetect =
        !hasNew && codeBuddyEveryRequiredSatisfiedByDetectLegacy(hooks, requiredLegacy);
      const hasLegacy = hasLegacyExact || hasLegacyDetect;

      if (hasNew) {
        health = "active";
        hookInstalled = true;
        statusMessage = "已配置用户级 CodeBuddy hooks";
      } else if (hasLegacy) {
        health = "legacy_path";
        hookInstalled = true;
        statusMessage = "检测到旧版 CodePal CodeBuddy hook 命令，建议迁移";
      } else if (!hooksAreEmpty) {
        health = "repair_needed";
        statusMessage = "CodeBuddy settings.json hooks 与当前 CodePal 要求不一致";
      } else {
        health = "not_configured";
      }
    } else if (!("hooks" in config.parsed)) {
      health = "not_configured";
      statusMessage = "未配置 CodePal CodeBuddy hooks";
    } else {
      health = "repair_needed";
      statusMessage = "CodeBuddy settings.json hooks 结构不兼容";
    }
  }

  const { healthLabel, actionLabel } = labelsForHealth(health);

  return {
    id: "codebuddy",
    label: AGENT_LABELS.codebuddy,
    supported: true,
    configPath,
    configExists: config.exists,
    hookScriptPath,
    hookScriptExists,
    hookInstalled,
    health,
    healthLabel,
    actionLabel,
    statusMessage,
    ...(lastEvent ? { lastEventAt: lastEvent.at, lastEventStatus: lastEvent.status } : {}),
  };
}

function installCursorHooksFile(
  homeDir: string,
  hookCtx: HookCommandContext,
  now: () => number,
): { changed: boolean; backupPath?: string } {
  const configPath = cursorConfigPath(homeDir);
  const current = readOptionalJson(configPath);
  if (current.error) {
    throw new Error(current.error);
  }

  const root = current.parsed ?? {};
  const next = { ...root } as Record<string, unknown>;
  next.version = typeof root.version === "number" ? root.version : 1;

  const hooksValue = next.hooks;
  if (
    hooksValue !== undefined &&
    (!hooksValue || typeof hooksValue !== "object" || Array.isArray(hooksValue))
  ) {
    throw new Error("Cursor hooks.json 结构不兼容");
  }
  const hooks = hooksValue ? ({ ...hooksValue } as Record<string, unknown>) : {};

  const requiredCommands = Object.fromEntries(
    CURSOR_HOOK_EVENT_NAMES.map((eventName) => [eventName, buildCursorHookCommand(hookCtx)]),
  ) as Record<string, string>;

  let changed = current.exists === false;

  for (const [eventName, command] of Object.entries(requiredCommands)) {
    const existingEntries = hooks[eventName];
    if (existingEntries !== undefined && !Array.isArray(existingEntries)) {
      throw new Error(`Cursor hooks.json 中 ${eventName} 不是数组`);
    }
    const entries = Array.isArray(existingEntries) ? [...existingEntries] : [];
    const alreadyPresent = entries.some(
      (entry) =>
        entry &&
        typeof entry === "object" &&
        (entry as Record<string, unknown>).command === command,
    );
    if (!alreadyPresent) {
      entries.push({ command });
      changed = true;
    }
    hooks[eventName] = entries;
  }

  next.hooks = hooks;

  let backupPath: string | undefined;
  if (changed) {
    ensureParentDir(configPath);
    if (current.exists) {
      backupPath = backupFile(configPath, now);
    }
    fs.writeFileSync(configPath, formatJson(next));
  }

  return { changed, backupPath };
}

function installCodeBuddyHooksFile(
  homeDir: string,
  hookCtx: HookCommandContext,
  now: () => number,
): { changed: boolean; backupPath?: string } {
  const configPath = codeBuddyConfigPath(homeDir);
  const current = readOptionalJson(configPath);
  if (current.error) {
    throw new Error(current.error);
  }

  const next = { ...(current.parsed ?? {}) } as Record<string, unknown>;
  const hooksValue = next.hooks;
  if (
    hooksValue !== undefined &&
    (!hooksValue || typeof hooksValue !== "object" || Array.isArray(hooksValue))
  ) {
    throw new Error("CodeBuddy settings.json hooks 结构不兼容");
  }
  const hooks = hooksValue ? ({ ...hooksValue } as Record<string, unknown>) : {};

  let changed = current.exists === false;

  for (const required of codeBuddyRequiredNewEntries(hookCtx)) {
    const existingEntries = hooks[required.eventName];
    if (existingEntries !== undefined && !Array.isArray(existingEntries)) {
      throw new Error(`CodeBuddy hooks.${required.eventName} 不是数组`);
    }
    const entries = Array.isArray(existingEntries) ? [...existingEntries] : [];
    if (!hasCodeBuddyHookEntry(entries, required)) {
      entries.push({
        ...(required.matcher !== undefined ? { matcher: required.matcher } : {}),
        hooks: [{ type: "command", command: required.command }],
      });
      changed = true;
    }
    hooks[required.eventName] = entries;
  }

  next.hooks = hooks;

  let backupPath: string | undefined;
  if (changed) {
    ensureParentDir(configPath);
    if (current.exists) {
      backupPath = backupFile(configPath, now);
    }
    fs.writeFileSync(configPath, formatJson(next));
  }

  return { changed, backupPath };
}

function installCodexHooksFile(
  homeDir: string,
  hookCtx: HookCommandContext,
  now: () => number,
): { changed: boolean; backupPath?: string } {
  const configPath = codexConfigPath(homeDir);
  const current = readOptionalText(configPath);
  if (current.error) {
    throw new Error(current.error);
  }

  const next = upsertCodexNotifyConfig(current.text ?? "", buildCodexHookArgv(hookCtx));
  let backupPath: string | undefined;

  if (next.changed) {
    ensureParentDir(configPath);
    if (current.exists) {
      backupPath = backupFile(configPath, now);
    }
    fs.writeFileSync(configPath, next.text);
  }

  return { changed: next.changed, backupPath };
}

function formatExecutableLabel(packaged: boolean, execPath: string): string {
  const base = path.basename(execPath);
  return packaged ? `已打包 · ${base}` : `开发模式 · ${base}`;
}

export function createIntegrationService(options: IntegrationServiceOptions) {
  const now = options.now ?? defaultNow;
  let listener: IntegrationListenerDiagnostics = {
    mode: "unavailable",
    message: "等待 CodePal IPC 监听完成",
  };
  const lastEvents = new Map<IntegrationAgentId, LastEvent>();

  function integrationHookContext(): HookCommandContext {
    return {
      packaged: options.packaged,
      execPath: options.execPath,
      appPath: options.appPath,
    };
  }

  function getAgentDiagnostics(agentId: IntegrationAgentId): IntegrationAgentDiagnostics {
    const hookCtx = integrationHookContext();
    if (agentId === "codex") {
      return inspectCodexConfig(options.homeDir, hookCtx, lastEvents.get(agentId));
    }
    if (agentId === "cursor") {
      return inspectCursorConfig(
        options.homeDir,
        options.hookScriptsRoot,
        hookCtx,
        lastEvents.get(agentId),
      );
    }
    return inspectCodeBuddyConfig(
      options.homeDir,
      options.hookScriptsRoot,
      hookCtx,
      lastEvents.get(agentId),
    );
  }

  return {
    setListenerDiagnostics(next: IntegrationListenerDiagnostics) {
      listener = next;
    },
    recordEvent(tool: string, status: SessionStatus, timestamp: number) {
      if (tool === "cursor" || tool === "codebuddy" || tool === "codex") {
        lastEvents.set(tool, { at: timestamp, status });
      }
    },
    getDiagnostics(): IntegrationDiagnostics {
      return {
        listener,
        runtime: {
          packaged: options.packaged,
          hookScriptsRoot: options.hookScriptsRoot,
          executablePath: options.execPath,
          executableLabel: formatExecutableLabel(options.packaged, options.execPath),
        },
        agents: [
          getAgentDiagnostics("codex"),
          getAgentDiagnostics("cursor"),
          getAgentDiagnostics("codebuddy"),
        ],
      };
    },
    installHooks(agentId: IntegrationAgentId): IntegrationInstallResult {
      const hookCtx = integrationHookContext();
      const result =
        agentId === "cursor"
          ? installCursorHooksFile(options.homeDir, hookCtx, now)
          : agentId === "codebuddy"
            ? installCodeBuddyHooksFile(options.homeDir, hookCtx, now)
            : installCodexHooksFile(options.homeDir, hookCtx, now);

      const diagnostics = getAgentDiagnostics(agentId);
      return {
        agentId,
        configPath: diagnostics.configPath,
        changed: result.changed,
        hookInstalled: diagnostics.hookInstalled,
        health: diagnostics.health,
        backupPath: result.backupPath,
        message: diagnostics.hookInstalled
          ? result.changed
            ? `已写入 ${diagnostics.label} 配置`
            : `${diagnostics.label} 配置已是最新状态`
          : `${diagnostics.label} 配置未生效`,
        diagnostics,
      };
    },
  };
}
