import { normalizeCodeBuddyEvent } from "../../adapters/codebuddy/normalizeCodeBuddyEvent";
import { normalizeCursorEvent } from "../../adapters/cursor/normalizeCursorEvent";
import { isStatusChangeUpstreamEvent } from "../../adapters/shared/eventEnvelope";
import type { SessionEvent } from "../session/sessionStore";
import type { PendingAction, ResponseTarget } from "../session/sessionTypes";
import { isPendingAction, isResponseTarget, isSessionStatus } from "../session/sessionTypes";

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

  let normalized = null;
  if (isStatusChangeUpstreamEvent(parsed)) {
    normalized = parsed;
  } else if (o.hook_event_name === "StatusChange") {
    normalized = normalizeCursorEvent(o);
  } else if (
    o.source === "codebuddy" ||
    o.tool === "codebuddy" ||
    (typeof o.hook_event_name === "string" &&
      /codebuddy/i.test(o.hook_event_name))
  ) {
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

  return {
    type: normalized.type,
    sessionId: normalized.sessionId,
    tool: normalized.tool,
    status: normalized.status,
    task: normalized.task,
    timestamp: normalized.timestamp,
    ...(pendingPart !== undefined ? { pendingAction: pendingPart } : {}),
    ...(responseTargetPart !== undefined ? { responseTarget: responseTargetPart } : {}),
  } as SessionEvent;
}
