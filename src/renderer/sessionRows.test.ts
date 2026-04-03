import { describe, expect, it } from "vitest";
import { sessionRecordToRow } from "./sessionRows";

describe("sessionRecordToRow", () => {
  it("uses the last meaningful sentence from a dialog-like activity line", () => {
    const row = sessionRecordToRow({
      id: "codex-1",
      tool: "codex",
      status: "running",
      updatedAt: 1_700_000_000_000,
      activityItems: [
        {
          id: "activity-1",
          kind: "message",
          source: "assistant",
          title: "Assistant",
          body: "我已经完成比对。最后需要你确认是否继续合并？",
          timestamp: 1_700_000_000_000,
        },
        {
          id: "activity-2",
          kind: "tool",
          source: "tool",
          title: "Bash",
          body: "Bash",
          timestamp: 1_700_000_000_000,
          toolName: "Bash",
          toolPhase: "call",
        },
      ],
    });

    expect(row.collapsedSummary).toBe("最后需要你确认是否继续合并？");
  });

  it("keeps tool and system activities distinct when shared activityItems are present", () => {
    const row = sessionRecordToRow({
      id: "cursor-1",
      tool: "cursor",
      status: "waiting",
      updatedAt: 1_700_000_000_000,
      activityItems: [
        {
          id: "activity-1",
          kind: "tool",
          source: "tool",
          title: "Bash",
          body: "Bash",
          timestamp: 1_700_000_000_000,
          toolName: "Bash",
          toolPhase: "call",
        },
        {
          id: "activity-2",
          kind: "system",
          source: "system",
          title: "Action Closed",
          body: "Closed action a1 (consumed_local)",
          timestamp: 1_700_000_000_000,
        },
      ],
    });

    expect(row.timelineItems.map((item) => item.kind)).toEqual(["tool", "system"]);
    expect(row.timelineItems[0]).toMatchObject({
      label: "Bash",
      toolPhase: "call",
    });
  });

  it("prefers pending action titles for the collapsed summary", () => {
    const row = sessionRecordToRow({
      id: "cursor-2",
      tool: "cursor",
      status: "waiting",
      updatedAt: 1_700_000_000_000,
      activityItems: [
        {
          id: "activity-1",
          kind: "message",
          source: "assistant",
          title: "Assistant",
          body: "我已经完成比对。最后需要你确认是否继续合并？",
          timestamp: 1_700_000_000_000,
        },
      ],
      pendingActions: [
        {
          id: "a1",
          type: "approval",
          title: "Proceed with merge?",
          options: ["Yes", "No"],
        },
      ],
    });

    expect(row.pendingCount).toBe(1);
    expect(row.collapsedSummary).toBe("Proceed with merge?");
  });

  it("skips empty completed events and prefers the latest meaningful progress text", () => {
    const row = sessionRecordToRow({
      id: "codex-3",
      tool: "codex",
      status: "completed",
      updatedAt: 1_700_000_000_000,
      activities: [
        "Completed",
        "Agent: 我已经完成比对。最后需要你确认是否继续合并？",
      ],
    });

    expect(row.collapsedSummary).toBe("最后需要你确认是否继续合并？");
  });

  it("classifies file edits as work artifacts", () => {
    const row = sessionRecordToRow({
      id: "codex-4",
      tool: "codex",
      status: "running",
      updatedAt: 1_700_000_000_000,
      activities: ["Edited sessionRows.ts +23 -5"],
    });

    expect(row.timelineItems[0]).toMatchObject({
      kind: "system",
      label: "File Edit",
    });
  });

  it("classifies bare running/completed lines as system notes", () => {
    const row = sessionRecordToRow({
      id: "codex-5",
      tool: "codex",
      status: "completed",
      updatedAt: 1_700_000_000_000,
      activities: ["Completed", "Running"],
    });

    expect(row.timelineItems).toEqual([]);
  });

  it("renders status-prefixed progress lines as notes with stripped body text", () => {
    const row = sessionRecordToRow({
      id: "codex-5b",
      tool: "codex",
      status: "running",
      updatedAt: 1_700_000_000_000,
      activities: ["Running: 已完成接口验证并整理出结论。"],
    });

    expect(row.timelineItems[0]).toMatchObject({
      kind: "note",
      tone: "running",
      body: "已完成接口验证并整理出结论。",
    });
  });

  it("classifies bare tool identifiers as tool artifacts", () => {
    const row = sessionRecordToRow({
      id: "codex-5c",
      tool: "codex",
      status: "running",
      updatedAt: 1_700_000_000_000,
      activities: ["saveDocument", "metadata"],
    });

    expect(row.timelineItems.map((item) => item.kind)).toEqual(["tool", "tool"]);
    expect(row.timelineItems[0]).toMatchObject({
      toolPhase: "result",
      label: "Save Document",
      body: "saveDocument",
    });
  });

  it("treats natural-language lines without prefixes as messages", () => {
    const row = sessionRecordToRow({
      id: "codex-5d",
      tool: "codex",
      status: "running",
      updatedAt: 1_700_000_000_000,
      activities: ["iwiki 里面的关联信息要加上链接呀"],
    });

    expect(row.timelineItems[0]).toMatchObject({
      kind: "message",
      body: "iwiki 里面的关联信息要加上链接呀",
    });
  });

  it("preserves explicit user and agent message prefixes", () => {
    const row = sessionRecordToRow({
      id: "codex-roles",
      tool: "codex",
      status: "running",
      updatedAt: 1_700_000_000_000,
      activities: ["User: 请继续优化 UI", "Agent: 我先把消息和工具块拆开。"],
    });

    expect(row.timelineItems[0]).toMatchObject({
      kind: "message",
      label: "User",
      body: "请继续优化 UI",
    });
    expect(row.timelineItems[1]).toMatchObject({
      kind: "message",
      label: "Agent",
      body: "我先把消息和工具块拆开。",
    });
  });

  it("drops duplicated status notes when they only repeat the same message content", () => {
    const row = sessionRecordToRow({
      id: "codex-6",
      tool: "codex",
      status: "completed",
      updatedAt: 1_700_000_000_000,
      activityItems: [
        {
          id: "activity-1",
          kind: "message",
          source: "assistant",
          title: "Assistant",
          body: "这轮已经把 expanded 区从旧的 `event-first` 改成了 `message-first`。",
          timestamp: 1_700_000_000_000,
        },
        {
          id: "activity-2",
          kind: "note",
          source: "system",
          title: "Completed",
          body: "这轮已经把 expanded 区从旧的 `event-first` 改成了 `message-first`。",
          timestamp: 1_700_000_000_000,
          tone: "completed",
        },
      ],
    });

    expect(row.timelineItems).toHaveLength(1);
    expect(row.timelineItems[0]).toMatchObject({
      kind: "message",
      body: "这轮已经把 expanded 区从旧的 `event-first` 改成了 `message-first`。",
    });
  });

  it("flags low-information running placeholder rows as loading", () => {
    const row = sessionRecordToRow({
      id: "codex-loading-1",
      tool: "codex",
      status: "running",
      updatedAt: 1_700_000_000_000,
      activityItems: [
        {
          id: "activity-1",
          kind: "note",
          source: "system",
          title: "Running",
          body: "Working",
          timestamp: 1_700_000_000_000,
          tone: "running",
        },
      ],
    });

    expect(row.collapsedSummary).toBe("正在读取…");
    expect(row.hoverSummary).toBe("正在读取…");
  });

  it("does not surface low-signal hook event names as title or collapsed summary", () => {
    const row = sessionRecordToRow({
      id: "cursor-hook-noise",
      tool: "cursor",
      status: "completed",
      title: "UserPromptSubmit",
      task: "Stop",
      updatedAt: 1_700_000_000_000,
      activities: [
        "UserPromptSubmit",
        "Stop",
        "Agent: 已经完成额度展示收口。",
      ],
    });

    expect(row.titleLabel).toBe("已经完成额度展示收口。");
    expect(row.collapsedSummary).toBe("已经完成额度展示收口。");
  });
});
