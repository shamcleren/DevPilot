import fs from "node:fs";
import path from "node:path";
import type { SessionEvent } from "../session/sessionStore";
import { ACTIVE_SESSION_STALENESS_MS } from "../session/sessionStore";

type JetBrainsSessionWatcherOptions = {
  logRoot: string;
  onEvent: (event: SessionEvent) => void;
  pollIntervalMs?: number;
  initialBootstrapLookbackMs?: number;
};

type FileCursor = {
  offset: number;
  remainder: string;
};

type PendingRegister = {
  requestId: string;
  sourceSessionId?: string;
  editorName?: string;
  appVersion?: string;
  workspacePath: string;
  repo?: string;
};

type WorkspaceSession = {
  uuid: string;
  sourceSessionId?: string;
  editorName?: string;
  appVersion?: string;
  workspacePath: string;
  repo?: string;
};

function resolveLogFile(root: string): string | null {
  const directFile = root.endsWith(".log") ? root : path.join(root, "gongfeng-chat-agent", "log", "chat-agent.log");
  return fs.existsSync(directFile) ? directFile : null;
}

function parseTimestampPrefix(line: string): number {
  const match = line.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3})/);
  if (!match) return Date.now();
  const parsed = Date.parse(match[1].replace(" ", "T"));
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function parseJsonObject(line: string): Record<string, unknown> | null {
  const start = line.indexOf("{");
  if (start < 0) return null;
  try {
    const parsed = JSON.parse(line.slice(start)) as Record<string, unknown>;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function firstString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function firstArrayString(value: unknown): string | undefined {
  return Array.isArray(value) ? firstString(value[0]) : undefined;
}

function fileUrlToPath(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (value.startsWith("file://")) {
    try {
      return decodeURIComponent(new URL(value).pathname);
    } catch {
      return undefined;
    }
  }
  return value;
}

function workspaceLabel(workspacePath: string): string {
  const trimmed = workspacePath.trim();
  return path.basename(trimmed) || trimmed || "Workspace";
}

function editorLabel(editorName: string | undefined): string {
  const raw = editorName?.trim();
  if (!raw) return "JetBrains";
  const normalized = raw.toLowerCase();
  if (normalized.includes("goland")) return "GoLand";
  if (normalized.includes("pycharm")) return "PyCharm";
  return raw.replace(/^JetBrains/, "") || "JetBrains";
}

function toolKey(editorName: string | undefined): string {
  const normalized = editorName?.toLowerCase() ?? "";
  if (normalized.includes("pycharm")) {
    return "pycharm";
  }
  if (normalized.includes("goland")) {
    return "goland";
  }
  return "jetbrains";
}

function buildEvent(
  session: WorkspaceSession,
  timestamp: number,
  status: SessionEvent["status"],
  activity: SessionEvent["activityItems"][number],
): SessionEvent {
  const workspace = workspaceLabel(session.workspacePath);
  const editor = editorLabel(session.editorName);
  return {
    sessionId: session.uuid,
    tool: toolKey(session.editorName),
    status,
    title: workspace,
    task: `${editor} · ${workspace}`,
    timestamp,
    meta: {
      editorName: session.editorName,
      appVersion: session.appVersion,
      workspacePath: session.workspacePath,
      repo: session.repo,
      sessionId: session.sourceSessionId,
      uuid: session.uuid,
    },
    activityItems: [
      {
        id: `${session.uuid}:${timestamp}:${activity.title}`,
        timestamp,
        ...activity,
      },
    ],
  };
}

export function createJetBrainsSessionWatcher(options: JetBrainsSessionWatcherOptions) {
  const pollIntervalMs = options.pollIntervalMs ?? 2000;
  const initialBootstrapLookbackMs =
    options.initialBootstrapLookbackMs ?? ACTIVE_SESSION_STALENESS_MS;
  const cursors = new Map<string, FileCursor>();
  const pendingByRequestId = new Map<string, PendingRegister>();
  const sessionByUuid = new Map<string, WorkspaceSession>();
  let timer: ReturnType<typeof setInterval> | null = null;
  let didInitialBootstrap = false;

  function pollLine(line: string, initialCutoffMs: number | null): SessionEvent | null {
    const trimmed = line.trim();
    if (!trimmed) return null;

    const timestamp = parseTimestampPrefix(trimmed);
    if (initialCutoffMs !== null && timestamp < initialCutoffMs) {
      return null;
    }
    const parsed = parseJsonObject(trimmed);
    if (parsed?.method === "gongfeng/chat-agent-register") {
      const params =
        parsed.params && typeof parsed.params === "object"
          ? (parsed.params as Record<string, unknown>)
          : undefined;
      const requestId = firstString(parsed.id);
      const workspacePath = fileUrlToPath(firstArrayString(params?.workspace));
      if (!requestId || !workspacePath) {
        return null;
      }
      pendingByRequestId.set(requestId, {
        requestId,
        workspacePath,
        sourceSessionId: firstString(params?.session_id),
        editorName: firstString(params?.editor_name),
        appVersion: firstString(params?.app_version),
        repo: firstArrayString(params?.repo),
      });
      return null;
    }

    if (parsed?.result && typeof parsed.result === "object") {
      const requestId = firstString(parsed.id);
      const result = parsed.result as Record<string, unknown>;
      const uuid = firstString(result.uuid);
      const pending = requestId ? pendingByRequestId.get(requestId) : undefined;
      const workspacePath =
        fileUrlToPath(firstString(result.workspace_uri)) ?? pending?.workspacePath;
      if (!requestId || !uuid || !pending || !workspacePath) {
        return null;
      }
      const session: WorkspaceSession = {
        uuid,
        sourceSessionId: pending.sourceSessionId,
        editorName: pending.editorName,
        appVersion: pending.appVersion,
        workspacePath,
        repo: pending.repo,
      };
      sessionByUuid.set(uuid, session);
      pendingByRequestId.delete(requestId);
      return null;
    }

    const connectedMatch = trimmed.match(/uuid from proxy:\s*([0-9a-f-]+)/i);
    if (connectedMatch) {
      return null;
    }

    const closeMatch = trimmed.match(/close connection to proxy:([0-9a-f-]+)/i);
    if (closeMatch) {
      return null;
    }

    const errorMatch = trimmed.match(
      /(accept stream failed|listen local failed):\s*(.+?),\s*([0-9a-f-]+)\s*$/i,
    );
    if (errorMatch) {
      const session = sessionByUuid.get(errorMatch[3]);
      if (!session) return null;
      return buildEvent(session, timestamp, "error", {
        kind: "note",
        source: "system",
        title: "Connection error",
        body: `${errorMatch[1]}: ${errorMatch[2]}`.trim(),
        tone: "error",
      });
    }

    return null;
  }

  async function pollFile(filePath: string, initialCutoffMs: number | null) {
    const stat = fs.statSync(filePath);
    const existing = cursors.get(filePath) ?? { offset: 0, remainder: "" };
    const offset = stat.size < existing.offset ? 0 : existing.offset;
    const content = fs.readFileSync(filePath).subarray(offset).toString("utf8");

    let nextOffset = stat.size;
    const text = `${existing.remainder}${content}`;
    const lines = text.split("\n");
    const remainder = lines.pop() ?? "";
    const initialEventsBySessionId = new Map<string, SessionEvent>();

    for (const line of lines) {
      const event = pollLine(line, initialCutoffMs);
      if (!event) {
        continue;
      }
      if (initialCutoffMs !== null) {
        if (event.status === "error") {
          initialEventsBySessionId.set(event.sessionId, event);
        }
      } else {
        options.onEvent(event);
      }
    }

    if (initialCutoffMs !== null) {
      for (const event of initialEventsBySessionId.values()) {
        options.onEvent(event);
      }
    }

    if (remainder) {
      nextOffset -= Buffer.byteLength(remainder, "utf8");
    }
    cursors.set(filePath, { offset: nextOffset, remainder });
  }

  return {
    async pollOnce() {
      const initialCutoffMs = didInitialBootstrap
        ? null
        : Number.isFinite(initialBootstrapLookbackMs)
          ? Date.now() - initialBootstrapLookbackMs
          : null;
      const logFile = resolveLogFile(options.logRoot);
      if (!logFile) return;
      await pollFile(logFile, initialCutoffMs);
      didInitialBootstrap = true;
    },
    start() {
      if (timer !== null) return;
      timer = setInterval(() => {
        void this.pollOnce().catch((error) => {
          console.error("[CodePal JetBrains] poll failed:", (error as Error).message);
        });
      }, pollIntervalMs);
    },
    stop() {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    },
  };
}
