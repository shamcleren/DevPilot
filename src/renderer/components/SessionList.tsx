import { useState } from "react";
import type { MonitorSessionRow } from "../monitorSession";
import { SessionRow } from "./SessionRow";

type SessionListProps = {
  sessions: MonitorSessionRow[];
  onRespond: (sessionId: string, actionId: string, option: string) => void;
};

function isCurrentStatus(status: MonitorSessionRow["status"]): boolean {
  return status === "running" || status === "waiting";
}

function compareSessions(a: MonitorSessionRow, b: MonitorSessionRow): number {
  const aRunning = a.status === "running" ? 1 : 0;
  const bRunning = b.status === "running" ? 1 : 0;
  if (aRunning !== bRunning) {
    return bRunning - aRunning;
  }
  return b.updatedAt - a.updatedAt;
}

function renderGroup(
  title: string,
  sessions: MonitorSessionRow[],
  expandedSessionId: string | null,
  onToggleExpanded: (sessionId: string) => void,
  onRespond: SessionListProps["onRespond"],
) {
  if (sessions.length === 0) return null;
  return (
    <div className="session-list__group" aria-label={title}>
      <div className="session-list__subheader">{title}</div>
      {sessions.map((s) => (
        <SessionRow
          key={s.id}
          session={s}
          expanded={expandedSessionId === s.id}
          onToggleExpanded={onToggleExpanded}
          onRespond={onRespond}
        />
      ))}
    </div>
  );
}

export function SessionList({ sessions, onRespond }: SessionListProps) {
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  const currentSessions = sessions.filter((session) => isCurrentStatus(session.status)).sort(compareSessions);
  const historySessions = sessions
    .filter((session) => !isCurrentStatus(session.status))
    .sort((a, b) => b.updatedAt - a.updatedAt);

  function toggleExpanded(sessionId: string) {
    setExpandedSessionId((current) => (current === sessionId ? null : sessionId));
  }

  return (
    <section className="session-list" aria-label="Session tasks">
      <div className="session-list__header">Sessions</div>
      {renderGroup("Current", currentSessions, expandedSessionId, toggleExpanded, onRespond)}
      {renderGroup("History", historySessions, expandedSessionId, toggleExpanded, onRespond)}
    </section>
  );
}
