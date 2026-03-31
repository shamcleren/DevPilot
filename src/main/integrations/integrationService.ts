import fs from "node:fs";
import path from "node:path";
import type {
  IntegrationAgentDiagnostics,
  IntegrationAgentId,
  IntegrationDiagnostics,
  IntegrationInstallResult,
  IntegrationListenerDiagnostics,
} from "../../shared/integrationTypes";
import type { SessionStatus } from "../../shared/sessionTypes";

type IntegrationServiceOptions = {
  homeDir: string;
  hookScriptsRoot: string;
  packaged: boolean;
  commandExists?: (command: string) => boolean;
  now?: () => number;
};

type LastEvent = {
  at: number;
  status: SessionStatus;
};

const AGENT_LABELS: Record<IntegrationAgentId, string> = {
  cursor: "Cursor",
  codebuddy: "CodeBuddy",
};

function defaultNow() {
  return Date.now();
}

function defaultCommandExists(command: string): boolean {
  const pathValue = process.env.PATH ?? "";
  return pathValue
    .split(path.delimiter)
    .filter(Boolean)
    .some((dir) => {
      const candidate = path.join(dir, command);
      return fs.existsSync(candidate);
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

function inspectCursorConfig(
  homeDir: string,
  hookScriptsRoot: string,
  lastEvent?: LastEvent,
): IntegrationAgentDiagnostics {
  const configPath = cursorConfigPath(homeDir);
  const hookScriptPath = cursorHookScriptPath(hookScriptsRoot);
  const hookScriptExists = fs.existsSync(hookScriptPath);
  const config = readOptionalJson(configPath);
  const requiredCommands = {
    sessionStart: buildCursorCommand(hookScriptPath, "sessionStart"),
    stop: buildCursorCommand(hookScriptPath, "stop"),
  };

  let hookInstalled = false;
  let statusMessage = "未配置 DevPilot Cursor hooks";

  if (!hookScriptExists) {
    statusMessage = "缺少 Cursor hook 脚本";
  } else if (config.error) {
    statusMessage = config.error;
  } else if (config.parsed) {
    const hooksValue = config.parsed.hooks;
    if (hooksValue && typeof hooksValue === "object" && !Array.isArray(hooksValue)) {
      const hooks = hooksValue as Record<string, unknown>;
      hookInstalled = Object.entries(requiredCommands).every(([eventName, command]) => {
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
      statusMessage = hookInstalled ? "已配置用户级 Cursor hooks" : statusMessage;
    } else {
      statusMessage = "Cursor hooks.json 结构不兼容";
    }
  }

  return {
    id: "cursor",
    label: AGENT_LABELS.cursor,
    supported: true,
    configPath,
    configExists: config.exists,
    hookScriptPath,
    hookScriptExists,
    hookInstalled,
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

function hasCodeBuddyHookEntry(
  entries: unknown,
  required: CodeBuddyRequiredEntry,
): boolean {
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
  lastEvent?: LastEvent,
): IntegrationAgentDiagnostics {
  const configPath = codeBuddyConfigPath(homeDir);
  const hookScriptPath = codeBuddyHookScriptPath(hookScriptsRoot);
  const hookScriptExists = fs.existsSync(hookScriptPath);
  const config = readOptionalJson(configPath);
  const requiredEntries = codeBuddyRequiredEntries(hookScriptPath);

  let hookInstalled = false;
  let statusMessage = "未配置 DevPilot CodeBuddy hooks";

  if (!hookScriptExists) {
    statusMessage = "缺少 CodeBuddy hook 脚本";
  } else if (config.error) {
    statusMessage = config.error;
  } else if (config.parsed) {
    const hooksValue = config.parsed.hooks;
    if (hooksValue && typeof hooksValue === "object" && !Array.isArray(hooksValue)) {
      const hooks = hooksValue as Record<string, unknown>;
      hookInstalled = requiredEntries.every((required) =>
        hasCodeBuddyHookEntry(hooks[required.eventName], required),
      );
      statusMessage = hookInstalled ? "已配置用户级 CodeBuddy hooks" : statusMessage;
    } else if (!("hooks" in config.parsed)) {
      statusMessage = "未配置 DevPilot CodeBuddy hooks";
    } else {
      statusMessage = "CodeBuddy settings.json hooks 结构不兼容";
    }
  }

  return {
    id: "codebuddy",
    label: AGENT_LABELS.codebuddy,
    supported: true,
    configPath,
    configExists: config.exists,
    hookScriptPath,
    hookScriptExists,
    hookInstalled,
    statusMessage,
    ...(lastEvent ? { lastEventAt: lastEvent.at, lastEventStatus: lastEvent.status } : {}),
  };
}

function installCursorHooksFile(
  homeDir: string,
  hookScriptsRoot: string,
  now: () => number,
): { changed: boolean; backupPath?: string } {
  const configPath = cursorConfigPath(homeDir);
  const current = readOptionalJson(configPath);
  if (current.error) {
    throw new Error(current.error);
  }

  const hookScriptPath = cursorHookScriptPath(hookScriptsRoot);
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

  const requiredCommands = {
    sessionStart: buildCursorCommand(hookScriptPath, "sessionStart"),
    stop: buildCursorCommand(hookScriptPath, "stop"),
  };

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
  hookScriptsRoot: string,
  now: () => number,
): { changed: boolean; backupPath?: string } {
  const configPath = codeBuddyConfigPath(homeDir);
  const current = readOptionalJson(configPath);
  if (current.error) {
    throw new Error(current.error);
  }

  const hookScriptPath = codeBuddyHookScriptPath(hookScriptsRoot);
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

  for (const required of codeBuddyRequiredEntries(hookScriptPath)) {
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

export function createIntegrationService(options: IntegrationServiceOptions) {
  const commandExists = options.commandExists ?? defaultCommandExists;
  const now = options.now ?? defaultNow;
  let listener: IntegrationListenerDiagnostics = {
    mode: "unavailable",
    message: "等待 DevPilot IPC 监听完成",
  };
  const lastEvents = new Map<IntegrationAgentId, LastEvent>();

  function getAgentDiagnostics(agentId: IntegrationAgentId): IntegrationAgentDiagnostics {
    if (agentId === "cursor") {
      return inspectCursorConfig(options.homeDir, options.hookScriptsRoot, lastEvents.get(agentId));
    }
    return inspectCodeBuddyConfig(
      options.homeDir,
      options.hookScriptsRoot,
      lastEvents.get(agentId),
    );
  }

  return {
    setListenerDiagnostics(next: IntegrationListenerDiagnostics) {
      listener = next;
    },
    recordEvent(tool: string, status: SessionStatus, timestamp: number) {
      if (tool === "cursor" || tool === "codebuddy") {
        lastEvents.set(tool, { at: timestamp, status });
      }
    },
    getDiagnostics(): IntegrationDiagnostics {
      return {
        listener,
        runtime: {
          packaged: options.packaged,
          hookScriptsRoot: options.hookScriptsRoot,
          dependencies: {
            node: commandExists("node"),
            python3: commandExists("python3"),
          },
        },
        agents: [getAgentDiagnostics("cursor"), getAgentDiagnostics("codebuddy")],
      };
    },
    installHooks(agentId: IntegrationAgentId): IntegrationInstallResult {
      const result =
        agentId === "cursor"
          ? installCursorHooksFile(options.homeDir, options.hookScriptsRoot, now)
          : installCodeBuddyHooksFile(options.homeDir, options.hookScriptsRoot, now);

      const diagnostics = getAgentDiagnostics(agentId);
      return {
        agentId,
        configPath: diagnostics.configPath,
        changed: result.changed,
        hookInstalled: diagnostics.hookInstalled,
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
