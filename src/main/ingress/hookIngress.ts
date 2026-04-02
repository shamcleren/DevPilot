import { normalizeCodeBuddyEvent } from "../../adapters/codebuddy/normalizeCodeBuddyEvent";
import { normalizeCursorEvent } from "../../adapters/cursor/normalizeCursorEvent";
import { isStatusChangeUpstreamEvent } from "../../adapters/shared/eventEnvelope";
import type { SessionEvent } from "../session/sessionStore";
import type { PendingAction, PendingClosed, ResponseTarget } from "../session/sessionTypes";
import {
  isPendingAction,
  isPendingClosed,
  isResponseTarget,
  isSessionStatus,
} from "../session/sessionTypes";

const CODEBUDDY_HOOK_EVENT_NAMES = new Set([
  "AgentSessionUpdate",
  "PreToolUse",
  "PostToolUse",
  "Notification",
  "UserPromptSubmit",
  "Stop",
  "SubagentStop",
  "PreCompact",
  "SessionStart",
  "SessionEnd",
  "WorktreeCreate",
  "WorktreeRemove",
  "unstable_Checkpoint",
]);

/**
 * Cursor/CodeBuddy 等非规范信封路径：仅当根上存在 `pendingAction` 键时才解释该字段。
 * - 缺键：不碰 session 里已有 pending（返回 undefined，事件不携带 pendingAction）。
 * - null：清除。
 * - 合法对象：替换。
 * - 键在但值非法：视为清除（返回 null），避免沿用上一次合法 pending 造成 UI 残留。
 */
function pendingActionFromRawPayload(
  o: Record<string, unknown>,
): PendingAction | null | undefined {
  if (!("pendingAction" in o)) return undefined;
  const raw = o.pendingAction;
  if (raw === null) return null;
  return isPendingAction(raw) ? raw : null;
}

/**
 * 非规范信封路径：仅当根上存在 `responseTarget` 键时才解释该字段。
 * 非法形状忽略为 undefined，不丢弃整条事件。
 */
function responseTargetFromRawPayload(
  o: Record<string, unknown>,
): ResponseTarget | undefined {
  if (!("responseTarget" in o)) return undefined;
  const raw = o.responseTarget;
  return isResponseTarget(raw) ? raw : undefined;
}

/**
 * 非规范信封路径：仅当根上存在 `pendingClosed` 键时才解释该字段。
 * null 与非法形状都忽略为 undefined，不丢弃整条事件。
 */
function pendingClosedFromRawPayload(
  o: Record<string, unknown>,
): PendingClosed | undefined {
  if (!("pendingClosed" in o)) return undefined;
  const raw = o.pendingClosed;
  if (raw === null) return undefined;
  return isPendingClosed(raw) ? raw : undefined;
}

function isCodeBuddyRawPayload(o: Record<string, unknown>): boolean {
  if (o.source === "codebuddy" || o.tool === "codebuddy") return true;
  return (
    typeof o.hook_event_name === "string" &&
    CODEBUDDY_HOOK_EVENT_NAMES.has(o.hook_event_name)
  );
}

function isCursorRawPayload(o: Record<string, unknown>): boolean {
  if (o.source === "cursor" || o.tool === "cursor") return true;
  return o.hook_event_name === "StatusChange";
}

function looksLikeCanonicalStatusChange(o: Record<string, unknown>): boolean {
  return (
    o.type === "status_change" &&
    typeof o.sessionId === "string" &&
    typeof o.tool === "string" &&
    typeof o.status === "string" &&
    typeof o.timestamp === "number"
  );
}

/**
 * 将 hook / bridge 发来的一行 JSON 转为可写入 sessionStore 的事件。
 */
export function lineToSessionEvent(line: string): SessionEvent | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const o = parsed as Record<string, unknown>;
  if (looksLikeCanonicalStatusChange(o) && !isStatusChangeUpstreamEvent(parsed)) {
    return null;
  }

  let normalized = null;
  if (isStatusChangeUpstreamEvent(parsed)) {
    normalized = parsed;
  } else if (isCursorRawPayload(o)) {
    normalized = normalizeCursorEvent(o);
  } else if (isCodeBuddyRawPayload(o)) {
    normalized = normalizeCodeBuddyEvent(o);
  }

  if (!normalized) return null;
  if (!normalized.sessionId.trim()) return null;
  if (!isSessionStatus(normalized.status)) return null;

  let pendingPart: PendingAction | null | undefined;
  if (isStatusChangeUpstreamEvent(parsed)) {
    pendingPart = normalized.pendingAction;
  } else {
    pendingPart = pendingActionFromRawPayload(o);
  }

  let responseTargetPart: ResponseTarget | undefined;
  if (isStatusChangeUpstreamEvent(parsed)) {
    responseTargetPart = normalized.responseTarget;
  } else {
    responseTargetPart = responseTargetFromRawPayload(o);
  }

  let pendingClosedPart: PendingClosed | undefined;
  if (isStatusChangeUpstreamEvent(parsed)) {
    pendingClosedPart = normalized.pendingClosed ?? undefined;
  } else {
    pendingClosedPart = pendingClosedFromRawPayload(o);
  }

  return {
    type: normalized.type,
    sessionId: normalized.sessionId,
    tool: normalized.tool,
    status: normalized.status,
    task: normalized.task,
    timestamp: normalized.timestamp,
    ...(normalized.meta !== undefined ? { meta: normalized.meta } : {}),
    ...(normalized.activityItems !== undefined ? { activityItems: normalized.activityItems } : {}),
    ...(pendingPart !== undefined ? { pendingAction: pendingPart } : {}),
    ...(responseTargetPart !== undefined ? { responseTarget: responseTargetPart } : {}),
    ...(pendingClosedPart !== undefined ? { pendingClosed: pendingClosedPart } : {}),
  } as SessionEvent;
}
