import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { MonitorSessionRow } from "../monitorSession";
import { SessionList } from "./SessionList";

function row(overrides: Partial<MonitorSessionRow>): MonitorSessionRow {
  return {
    id: "s",
    tool: "codex",
    status: "completed",
    updatedAt: 1,
    titleLabel: "CODEX · review",
    shortId: "0001",
    updatedLabel: "04-02 16:00",
    durationLabel: "0s",
    pendingCount: 0,
    loading: false,
    collapsedSummary: "done",
    timelineItems: [],
    activityItems: [],
    hoverSummary: "",
    ...overrides,
  };
}

describe("SessionList", () => {
  it("renders only actively progressing sessions in current and keeps history newest-first", () => {
    const html = renderToStaticMarkup(
      <SessionList
        sessions={[
          row({ id: "history-1", status: "completed", updatedAt: 10, collapsedSummary: "old done" }),
          row({ id: "current-1", status: "running", updatedAt: 30, collapsedSummary: "live run" }),
          row({ id: "history-0", status: "idle", updatedAt: 20, collapsedSummary: "turn aborted" }),
          row({ id: "history-2", status: "error", updatedAt: 40, collapsedSummary: "failed" }),
        ]}
        onRespond={vi.fn()}
      />,
    );

    expect(html).toContain("Current");
    expect(html).toContain("History");
    expect(html.indexOf("Current")).toBeLessThan(html.indexOf("History"));
    expect(html.indexOf("live run")).toBeLessThan(html.indexOf("failed"));
    expect(html.indexOf("failed")).toBeLessThan(html.indexOf("turn aborted"));
    expect(html.indexOf("turn aborted")).toBeLessThan(html.indexOf("old done"));
  });

  it("renders title labels for grouped sessions", () => {
    const html = renderToStaticMarkup(
      <SessionList
        sessions={[
          row({
            id: "current-1",
            status: "running",
            updatedAt: 30,
            titleLabel: "Codex · repo audit",
            collapsedSummary: "live run",
          }),
        ]}
        onRespond={vi.fn()}
      />,
    );

    expect(html).toContain("Codex · repo audit");
    expect(html).toContain("live run");
  });
});
