import type { StatusChangeUpstreamEvent } from "../shared/eventEnvelope";

function pickStatus(payload: Record<string, unknown>): string {
  const raw =
    payload.status ?? payload.state ?? payload.agent_status ?? "offline";
  return String(raw);
}

function pickTask(payload: Record<string, unknown>): string | undefined {
  const raw = payload.task ?? payload.current_task ?? payload.message;
  return raw !== undefined && raw !== null ? String(raw) : undefined;
}

function pickSessionId(payload: Record<string, unknown>): string {
  const raw = payload.session_id ?? payload.sessionId;
  return String(raw ?? "");
}

export function normalizeCodeBuddyEvent(
  payload: Record<string, unknown>,
): StatusChangeUpstreamEvent {
  const ts =
    typeof payload.timestamp === "number" ? payload.timestamp : Date.now();
  return {
    type: "status_change",
    sessionId: pickSessionId(payload),
    tool: "codebuddy",
    status: pickStatus(payload),
    task: pickTask(payload),
    timestamp: ts,
    meta: {
      ...(typeof payload.hook_event_name === "string"
        ? { hook_event_name: payload.hook_event_name }
        : {}),
      ...(typeof payload.cwd === "string" ? { cwd: payload.cwd } : {}),
    },
  };
}
