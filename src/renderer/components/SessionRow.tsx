import type { SessionStatus } from "../../shared/sessionTypes";
import type { MonitorSessionRow } from "../monitorSession";
import { HoverDetails } from "./HoverDetails";

const KNOWN_TOOLS: Record<string, { badge: string; label: string }> = {
  cursor: { badge: "C", label: "Cursor" },
  pycharm: { badge: "P", label: "PyCharm" },
  codebuddy: { badge: "CB", label: "CodeBuddy" },
};

function toolDisplay(tool: string): { badge: string; label: string } {
  const known = KNOWN_TOOLS[tool];
  if (known) {
    return known;
  }
  const trimmed = tool.trim() || "?";
  const badge =
    trimmed.length <= 2 ? trimmed.toUpperCase() : trimmed.slice(0, 2).toUpperCase();
  const label =
    trimmed.length > 0
      ? trimmed.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
      : "Unknown";
  return { badge, label };
}

function statusPresentation(status: SessionStatus): { className: string; label: string } {
  switch (status) {
    case "running":
      return { className: "state-running", label: "RUNNING" };
    case "waiting":
      return { className: "state-waiting", label: "WAITING" };
    case "error":
      return { className: "state-error", label: "ERROR" };
    case "completed":
      return { className: "state-completed", label: "DONE" };
    case "idle":
      return { className: "state-idle", label: "IDLE" };
    case "offline":
      return { className: "state-offline", label: "OFFLINE" };
  }
}

type SessionRowProps = {
  session: MonitorSessionRow;
  onRespond: (sessionId: string, actionId: string, option: string) => void;
};

export function SessionRow({ session, onRespond }: SessionRowProps) {
  const meta = toolDisplay(session.tool);
  const { className: stateClass, label: stateLabel } = statusPresentation(session.status);
  const taskText = session.task ?? "";

  return (
    <div className="session-row-wrap">
      <div className="session-row" aria-label={`${meta.label} ${stateLabel}`}>
        <span className="tool-icon" title={meta.label}>
          {meta.badge}
        </span>
        <span className="tool-name">{meta.label}</span>
        <span className={`state ${stateClass}`}>{stateLabel}</span>
        <span className="task">{taskText}</span>
        <span className="duration">{session.durationLabel}</span>
      </div>
      <HoverDetails activities={session.activities} summary={session.hoverSummary} />
      {session.pendingAction ? (
        <div className="pending-action" aria-label={session.pendingAction.title}>
          <div className="pending-action__title">{session.pendingAction.title}</div>
          <div className="pending-action__actions">
            {session.pendingAction.options.map((option) => (
              <button
                key={`${session.pendingAction!.id}:${option}`}
                type="button"
                className="pending-action__btn"
                onClick={() =>
                  onRespond(session.id, session.pendingAction!.id, option)
                }
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
