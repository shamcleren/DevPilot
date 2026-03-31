import type { SessionRecord } from "../shared/sessionTypes";
import type { MonitorSessionRow } from "./monitorSession";
import { sessionRecordToRow } from "./sessionRows";

export function rowsFromSessions(sessions: SessionRecord[]): MonitorSessionRow[] {
  return sessions.map(sessionRecordToRow);
}

export function hydrateRowsIfEmpty(
  currentRows: MonitorSessionRow[],
  sessions: SessionRecord[],
): MonitorSessionRow[] {
  return currentRows.length === 0 ? rowsFromSessions(sessions) : currentRows;
}
