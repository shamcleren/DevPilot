import path from "node:path";
import type { StatusChangeUpstreamEvent } from "../shared/eventEnvelope";
import type { ActivityItem } from "../../shared/sessionTypes";

function parseLine(line: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(line) as Record<string, unknown>;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function firstLine(text: string | undefined, fallback?: string): string | undefined {
  if (typeof text !== "string") return fallback;
  const trimmed = text.trim();
  if (!trimmed) return fallback;
  return trimmed.split(/\r?\n/, 1)[0]?.trim() || fallback;
}

function fullText(text: string | undefined, fallback?: string): string | undefined {
  if (typeof text !== "string") return fallback;
  const trimmed = text.trim();
  return trimmed || fallback;
}

function parseTimestamp(raw: unknown): number {
  if (typeof raw === "string") {
    const parsed = Date.parse(raw);
    if (Number.isFinite(parsed)) return parsed;
  }
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw;
  }
  return Date.now();
}

function sessionIdFromPath(sourcePath: string): string | null {
  const basename = path.basename(sourcePath);
  const match = basename.match(/([0-9a-f]{8,}(?:-[0-9a-f]{4,}){3,})\.jsonl$/i);
  return match?.[1] ?? null;
}

function pickSessionId(entry: Record<string, unknown>, sourcePath: string): string | null {
  const payload =
    entry.payload && typeof entry.payload === "object"
      ? (entry.payload as Record<string, unknown>)
      : undefined;

  const raw = payload?.id;
  if (typeof raw === "string" && raw.trim()) {
    return raw.trim();
  }
  return sessionIdFromPath(sourcePath);
}

function taskFromSessionMeta(payload: Record<string, unknown>): string {
  const cwd = typeof payload.cwd === "string" ? payload.cwd.trim() : "";
  const cwdBase = cwd ? path.basename(cwd) : "";
  return cwdBase ? `Codex session: ${cwdBase}` : "Codex session";
}

function metaForEntry(
  entryType: string,
  payload: Record<string, unknown>,
  sourcePath: string,
): Record<string, unknown> {
  const meta: Record<string, unknown> = {
    event_type: entryType,
    source_path: sourcePath,
  };

  if (entryType === "session_meta") {
    if (typeof payload.cwd === "string" && payload.cwd.trim()) meta.cwd = payload.cwd.trim();
    if (typeof payload.model_provider === "string" && payload.model_provider.trim()) {
      meta.model_provider = payload.model_provider.trim();
    }
    if (typeof payload.source === "string" && payload.source.trim()) {
      meta.source = payload.source.trim();
    }
    return meta;
  }

  if (entryType === "event_msg") {
    if (typeof payload.type === "string" && payload.type.trim()) {
      meta.codex_event_type = payload.type.trim();
    }
    if (typeof payload.phase === "string" && payload.phase.trim()) {
      meta.phase = payload.phase.trim();
    }
    return meta;
  }

  if (entryType === "response_item") {
    if (typeof payload.type === "string" && payload.type.trim()) {
      meta.item_type = payload.type.trim();
    }
    if (typeof payload.role === "string" && payload.role.trim()) {
      meta.role = payload.role.trim();
    }
    return meta;
  }

  return meta;
}

export function normalizeCodexLogEvent(
  line: string,
  sourcePath: string,
): StatusChangeUpstreamEvent | null {
  const entry = parseLine(line);
  if (!entry) return null;

  const entryType = typeof entry.type === "string" ? entry.type : "";
  const payload =
    entry.payload && typeof entry.payload === "object"
      ? (entry.payload as Record<string, unknown>)
      : {};
  const sessionId = pickSessionId(entry, sourcePath);
  if (!sessionId) return null;

  let status: string | null = null;
  let task: string | undefined;
  let activityItems: ActivityItem[] | undefined;
  const timestamp = parseTimestamp(entry.timestamp);

  if (entryType === "session_meta") {
    status = "running";
    task = taskFromSessionMeta(payload);
  } else if (entryType === "event_msg") {
    const eventType = typeof payload.type === "string" ? payload.type : "";
    const phase = typeof payload.phase === "string" ? payload.phase : "";
    switch (eventType) {
      case "user_message": {
        status = "running";
        task = firstLine(typeof payload.message === "string" ? payload.message : undefined);
        const fullMessage = fullText(typeof payload.message === "string" ? payload.message : undefined);
        if (fullMessage) {
          activityItems = [
            {
              id: `codex:${timestamp}:user-message`,
              kind: "message",
              source: "user",
              title: "User",
              body: fullMessage,
              timestamp,
            },
          ];
        }
        break;
      }
      case "task_started":
        status = "running";
        task = "Working";
        activityItems = [
          {
            id: `codex:${timestamp}:task-started`,
            kind: "note",
            source: "system",
            title: "Running",
            body: "Working",
            timestamp,
            tone: "running",
          },
        ];
        break;
      case "task_complete": {
        status = "completed";
        task = firstLine(
          typeof payload.last_agent_message === "string" ? payload.last_agent_message : undefined,
          "Task complete",
        );
        const fullLastAgentMessage = fullText(
          typeof payload.last_agent_message === "string" ? payload.last_agent_message : undefined,
          "Task complete",
        );
        if (fullLastAgentMessage) {
          activityItems = [
            {
              id: `codex:${timestamp}:task-complete`,
              kind: "message",
              source: "assistant",
              title: "Assistant",
              body: fullLastAgentMessage,
              timestamp,
            },
          ];
        }
        break;
      }
      case "turn_aborted":
        status = "idle";
        task = "Turn aborted";
        activityItems = [
          {
            id: `codex:${timestamp}:turn-aborted`,
            kind: "system",
            source: "system",
            title: "Turn aborted",
            body: "Turn aborted",
            timestamp,
            tone: "idle",
          },
        ];
        break;
      case "context_compacted":
        status = "idle";
        task = "Context compacted";
        activityItems = [
          {
            id: `codex:${timestamp}:context-compacted`,
            kind: "system",
            source: "system",
            title: "Context compacted",
            body: "Context compacted",
            timestamp,
            tone: "idle",
          },
        ];
        break;
      case "agent_message": {
        if (phase !== "final_answer") return null;
        status = "completed";
        task = firstLine(typeof payload.message === "string" ? payload.message : undefined);
        const fullAgentMessage = fullText(typeof payload.message === "string" ? payload.message : undefined);
        if (fullAgentMessage) {
          activityItems = [
            {
              id: `codex:${timestamp}:final-answer`,
              kind: "message",
              source: "assistant",
              title: "Assistant",
              body: fullAgentMessage,
              timestamp,
            },
          ];
        }
        break;
      }
      default:
        return null;
    }
  } else {
    return null;
  }

  if (!status) return null;

  return {
    type: "status_change",
    sessionId,
    tool: "codex",
    status,
    ...(task ? { task } : {}),
    timestamp,
    meta: metaForEntry(entryType, payload, sourcePath),
    ...(activityItems ? { activityItems } : {}),
  };
}
