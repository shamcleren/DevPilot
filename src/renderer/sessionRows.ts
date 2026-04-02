import type { SessionRecord } from "../shared/sessionTypes";
import type { MonitorSessionRow } from "./monitorSession";

function formatDuration(updatedAt: number): string {
  const sec = Math.max(0, Math.floor((Date.now() - updatedAt) / 1000));
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h${m % 60}m`;
}

export function sessionRecordToRow(record: SessionRecord): MonitorSessionRow {
  return {
    ...record,
    durationLabel: formatDuration(record.updatedAt),
    activities: record.activities ?? [],
    hoverSummary: record.task ?? record.activities?.[0] ?? record.status,
  };
}
