import type { SessionRecord } from "../shared/sessionTypes";
import type { MonitorSessionRow } from "./monitorSession";
import { sessionRecordToRow } from "./sessionRows";

export function compareMonitorSessionRows(a: MonitorSessionRow, b: MonitorSessionRow): number {
  const aUserTs = a.lastUserMessageAt ?? Number.NEGATIVE_INFINITY;
  const bUserTs = b.lastUserMessageAt ?? Number.NEGATIVE_INFINITY;
  if (aUserTs !== bUserTs) {
    return bUserTs - aUserTs;
  }
  if (a.updatedAt !== b.updatedAt) {
    return b.updatedAt - a.updatedAt;
  }
  return a.id.localeCompare(b.id);
}

export function rowsFromSessions(sessions: SessionRecord[]): MonitorSessionRow[] {
  return sessions.map(sessionRecordToRow).sort(compareMonitorSessionRows);
}

export function hydrateRowsIfEmpty(
  currentRows: MonitorSessionRow[],
  sessions: SessionRecord[],
): MonitorSessionRow[] {
  return currentRows.length === 0 ? rowsFromSessions(sessions) : currentRows;
}
