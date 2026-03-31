import type { StatusChangeUpstreamEvent } from "../shared/eventEnvelope";

function pickCursorSessionId(payload: Record<string, unknown>): string | null {
  const raw = payload.session_id ?? payload.sessionId;
  if (raw === undefined || raw === null) return null;
  const s = String(raw).trim();
  return s.length > 0 ? s : null;
}

export function normalizeCursorEvent(
  payload: Record<string, unknown>,
): StatusChangeUpstreamEvent | null {
  const sessionId = pickCursorSessionId(payload);
  if (!sessionId) return null;

  return {
    type: "status_change",
    sessionId,
    tool: "cursor",
    status: String(payload.status),
    task: payload.task ? String(payload.task) : undefined,
    timestamp: Date.now(),
    meta: {
      ...(typeof payload.cwd === "string" ? { cwd: payload.cwd } : {}),
      ...(typeof payload.hook_event_name === "string"
        ? { hook_event_name: payload.hook_event_name }
        : {}),
    },
  };
}
