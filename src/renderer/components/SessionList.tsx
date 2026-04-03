import { useState } from "react";
import type { MonitorSessionRow } from "../monitorSession";
import { SessionRow } from "./SessionRow";

type SessionListProps = {
  sessions: MonitorSessionRow[];
  onRespond: (sessionId: string, actionId: string, option: string) => void;
};

function compareSessions(a: MonitorSessionRow, b: MonitorSessionRow): number {
  const aUserTs = a.lastUserMessageAt ?? Number.NEGATIVE_INFINITY;
  const bUserTs = b.lastUserMessageAt ?? Number.NEGATIVE_INFINITY;
  if (aUserTs !== bUserTs) {
    return bUserTs - aUserTs;
  }
  return b.updatedAt - a.updatedAt;
}

export function SessionList({ sessions, onRespond }: SessionListProps) {
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  const sortedSessions = [...sessions].sort(compareSessions);

  function toggleExpanded(sessionId: string) {
    setExpandedSessionId((current) => (current === sessionId ? null : sessionId));
  }

  return (
    <section className="session-list" aria-label="Session tasks">
      <div className="session-list__header">Sessions</div>
      {sortedSessions.map((session) => (
        <SessionRow
          key={session.id}
          session={session}
          expanded={expandedSessionId === session.id}
          onToggleExpanded={toggleExpanded}
          onRespond={onRespond}
        />
      ))}
    </section>
  );
}
