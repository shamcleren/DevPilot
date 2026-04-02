import type { SessionStatus } from "../../shared/sessionTypes";
import type { MonitorSessionRow } from "../monitorSession";
import { HoverDetails } from "./HoverDetails";

const KNOWN_TOOLS: Record<string, { badge: string; label: string }> = {
  cursor: { badge: "C", label: "Cursor" },
  codex: { badge: "CX", label: "Codex" },
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
  expanded: boolean;
  onToggleExpanded: (sessionId: string) => void;
  onRespond: (sessionId: string, actionId: string, option: string) => void;
};

export function SessionRow({ session, expanded, onToggleExpanded, onRespond }: SessionRowProps) {
  const meta = toolDisplay(session.tool);
  const { className: stateClass, label: stateLabel } = statusPresentation(session.status);

  return (
    <article className={`session-row ${expanded ? "session-row--expanded" : ""}`}>
      <button
        type="button"
        className="session-row__summary"
        aria-label={`${meta.label} ${stateLabel}`}
        onClick={() => onToggleExpanded(session.id)}
      >
        <span className={`tool-icon tool-icon--${session.tool}`} title={meta.label}>
          {meta.badge}
        </span>
        <span className="session-row__main">
          <span className="session-row__topline">
            <span className="tool-name">{meta.label}</span>
            <span className="session-row__title">{session.titleLabel}</span>
            <span className={`state ${stateClass}`}>{stateLabel}</span>
          </span>
          <span className="session-row__meta">
            <span className="session-row__task">{session.task ?? "No task details"}</span>
            <span className="session-row__meta-item">{session.updatedLabel}</span>
            <span className="session-row__meta-item">{session.durationLabel}</span>
            <span className="session-row__meta-item">#{session.shortId}</span>
          </span>
        </span>
      </button>
      {expanded ? (
        <div className="session-row__details">
          <HoverDetails activities={session.activities} summary={session.hoverSummary} />
          {(session.pendingActions ?? []).map((action) => (
            <div key={action.id} className="pending-action" aria-label={action.title}>
              <div className="pending-action__title">{action.title}</div>
              <div className="pending-action__actions">
                {action.options.map((option) => (
                  <button
                    key={`${action.id}:${option}`}
                    type="button"
                    className="pending-action__btn"
                    onClick={() => onRespond(session.id, action.id, option)}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </article>
  );
}
