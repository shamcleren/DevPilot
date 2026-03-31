import type { MonitorSessionRow } from "../monitorSession";
import { SessionRow } from "./SessionRow";

type SessionListProps = {
  sessions: MonitorSessionRow[];
  onRespond: (sessionId: string, actionId: string, option: string) => void;
};

export function SessionList({ sessions, onRespond }: SessionListProps) {
  return (
    <section className="session-list" aria-label="Session tasks">
      <div className="session-list__header">Sessions</div>
      {sessions.map((s) => (
        <SessionRow key={s.id} session={s} onRespond={onRespond} />
      ))}
    </section>
  );
}
