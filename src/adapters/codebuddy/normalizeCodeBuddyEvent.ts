import type { StatusChangeUpstreamEvent } from "../shared/eventEnvelope";
import type { ActivityItem } from "../../shared/sessionTypes";

function firstString(
  payload: Record<string, unknown>,
  keys: readonly string[],
): string | undefined {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return undefined;
}

function firstNestedText(
  value: unknown,
  preferredKeys: readonly string[],
  depth = 0,
): string | undefined {
  if (depth > 2 || value === null || value === undefined) {
    return undefined;
  }

  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = firstNestedText(item, preferredKeys, depth + 1);
      if (nested) return nested;
    }
    return undefined;
  }

  if (typeof value !== "object") {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  for (const key of preferredKeys) {
    const nested = firstNestedText(record[key], preferredKeys, depth + 1);
    if (nested) return nested;
  }
  return undefined;
}

function statusFromHook(payload: Record<string, unknown>): string {
  const notificationType = firstString(payload, ["notification_type"]);
  if (notificationType === "permission_prompt") return "waiting";
  if (notificationType === "idle_prompt") return "idle";

  const hookEventName = firstString(payload, ["hook_event_name"]);
  switch (hookEventName) {
    case "Notification":
      return "waiting";
    case "SessionStart":
    case "UserPromptSubmit":
    case "PreToolUse":
    case "PostToolUse":
    case "PreCompact":
    case "WorktreeCreate":
    case "WorktreeRemove":
    case "unstable_Checkpoint":
      return "running";
    case "Stop":
    case "SubagentStop":
      return "idle";
    case "SessionEnd":
      return "offline";
    default:
      return "offline";
  }
}

function pickStatus(payload: Record<string, unknown>): string {
  const explicit = firstString(payload, ["status", "state", "agent_status"]);
  return explicit ?? statusFromHook(payload);
}

function pickTask(payload: Record<string, unknown>): string | undefined {
  return firstString(payload, [
    "task",
    "current_task",
    "message",
    "prompt",
    "tool_name",
    "reason",
    "source",
  ]);
}

function pickSessionId(payload: Record<string, unknown>): string {
  const raw = payload.session_id ?? payload.sessionId;
  return String(raw ?? "");
}

function pickTimestamp(payload: Record<string, unknown>): number {
  const raw = payload.timestamp ?? payload.ts;
  return typeof raw === "number" ? raw : Date.now();
}

function pickMeta(
  payload: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const metaEntries: [string, string][] = [];

  const hookEventName = firstString(payload, ["hook_event_name"]);
  if (hookEventName) metaEntries.push(["hook_event_name", hookEventName]);

  const cwd = firstString(payload, ["cwd"]);
  if (cwd) metaEntries.push(["cwd", cwd]);

  const notificationType = firstString(payload, ["notification_type"]);
  if (notificationType) metaEntries.push(["notification_type", notificationType]);

  const toolName = firstString(payload, ["tool_name"]);
  if (toolName) metaEntries.push(["tool_name", toolName]);

  const reason = firstString(payload, ["reason"]);
  if (reason) metaEntries.push(["reason", reason]);

  const source = firstString(payload, ["source"]);
  if (source && source !== "codebuddy") metaEntries.push(["source", source]);

  if (metaEntries.length === 0) return undefined;
  return Object.fromEntries(metaEntries);
}

function pickToolInvocationBody(payload: Record<string, unknown>): string | undefined {
  return (
    firstString(payload, ["command", "command_line", "tool_input"]) ??
    firstNestedText(payload.tool_input, [
      "file_path",
      "path",
      "uri",
      "url",
      "command",
      "query",
      "prompt",
    ])
  );
}

function buildActivityItems(
  payload: Record<string, unknown>,
  status: string,
  task: string | undefined,
): ActivityItem[] | undefined {
  const timestamp = pickTimestamp(payload);
  const hookEventName = firstString(payload, ["hook_event_name"]);
  const notificationType = firstString(payload, ["notification_type"]);
  const toolName = firstString(payload, ["tool_name"]);

  if (hookEventName === "UserPromptSubmit" && task) {
    return [
      {
        id: `codebuddy:${timestamp}:user-message`,
        kind: "message",
        source: "user",
        title: "User",
        body: task,
        timestamp,
      },
    ];
  }

  if (hookEventName === "PreToolUse" && toolName) {
    return [
      {
        id: `codebuddy:${timestamp}:tool:${toolName}`,
        kind: "tool",
        source: "tool",
        title: toolName,
        body: pickToolInvocationBody(payload) ?? task ?? toolName,
        timestamp,
        toolName,
        toolPhase: "call",
      },
    ];
  }

  if (hookEventName === "Notification") {
    return [
      {
        id: `codebuddy:${timestamp}:notification`,
        kind: "note",
        source: "system",
        title: "Notification",
        body: task ?? notificationType ?? "Waiting",
        timestamp,
        tone: "waiting",
        meta: notificationType ? { notificationType } : undefined,
      },
    ];
  }

  if (hookEventName === "SessionStart" || hookEventName === "SessionEnd" || hookEventName === "Stop") {
    return [
      {
        id: `codebuddy:${timestamp}:${hookEventName?.toLowerCase() ?? "session"}`,
        kind: "system",
        source: "system",
        title: hookEventName ?? "Session",
        body: task ?? hookEventName ?? status,
        timestamp,
        tone: status === "offline" ? "system" : undefined,
      },
    ];
  }

  if (task) {
    return [
      {
        id: `codebuddy:${timestamp}:status`,
        kind: "note",
        source: "system",
        title: status.charAt(0).toUpperCase() + status.slice(1),
        body: task,
        timestamp,
        tone:
          status === "running" ||
          status === "completed" ||
          status === "waiting" ||
          status === "idle" ||
          status === "error"
            ? status
            : "system",
      },
    ];
  }

  return undefined;
}

export function normalizeCodeBuddyEvent(
  payload: Record<string, unknown>,
): StatusChangeUpstreamEvent {
  const status = pickStatus(payload);
  const task = pickTask(payload);
  const activityItems = buildActivityItems(payload, status, task);
  return {
    type: "status_change",
    sessionId: pickSessionId(payload),
    tool: "codebuddy",
    status,
    task,
    timestamp: pickTimestamp(payload),
    meta: pickMeta(payload),
    ...(activityItems ? { activityItems } : {}),
  };
}
