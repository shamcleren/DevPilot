import { useState } from "react";
import type { MonitorSessionRow } from "../monitorSession";
import { compareMonitorSessionRows } from "../sessionBootstrap";
import { SessionRow } from "./SessionRow";

type SessionListProps = {
  sessions: MonitorSessionRow[];
  onRespond: (sessionId: string, actionId: string, option: string) => void;
};

export function SessionList({ sessions, onRespond }: SessionListProps) {
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  const sortedSessions = [...sessions].sort(compareMonitorSessionRows);

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
          showExperimentalControls={false}
          onToggleExpanded={toggleExpanded}
          onRespond={onRespond}
        />
      ))}
    </section>
  );
}
