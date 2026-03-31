import type { StatusChangeUpstreamEvent } from "../shared/eventEnvelope";

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

export function normalizeCodeBuddyEvent(
  payload: Record<string, unknown>,
): StatusChangeUpstreamEvent {
  return {
    type: "status_change",
    sessionId: pickSessionId(payload),
    tool: "codebuddy",
    status: pickStatus(payload),
    task: pickTask(payload),
    timestamp: pickTimestamp(payload),
    meta: pickMeta(payload),
  };
}
