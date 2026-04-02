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

function formatUpdatedAt(updatedAt: number): string {
  const date = new Date(updatedAt);
  if (Number.isNaN(date.getTime())) {
    return "unknown";
  }

  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildTitleLabel(record: SessionRecord): string {
  if (record.title?.trim()) {
    return record.title.trim();
  }

  if (record.task?.trim()) {
    return `${record.tool.toUpperCase()} · ${record.task.trim()}`;
  }

  return `${record.tool.toUpperCase()} · ${formatUpdatedAt(record.updatedAt)}`;
}

function shortSessionId(id: string): string {
  const trimmed = id.trim();
  if (trimmed.length <= 4) {
    return trimmed || "----";
  }
  return trimmed.slice(-4);
}

export function sessionRecordToRow(record: SessionRecord): MonitorSessionRow {
  return {
    ...record,
    titleLabel: buildTitleLabel(record),
    shortId: shortSessionId(record.id),
    updatedLabel: formatUpdatedAt(record.updatedAt),
    durationLabel: formatDuration(record.updatedAt),
    activities: record.activities ?? [],
    hoverSummary: record.task ?? record.activities?.[0] ?? record.status,
  };
}
