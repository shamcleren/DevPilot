import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SessionRow } from "./SessionRow";
import type { MonitorSessionRow } from "../monitorSession";

function baseRow(overrides: Partial<MonitorSessionRow> = {}): MonitorSessionRow {
  return {
    id: "s1",
    tool: "cursor",
    status: "waiting",
    updatedAt: Date.now(),
    titleLabel: "CURSOR · review diff",
    shortId: "s1",
    updatedLabel: "04-02 16:00",
    durationLabel: "0s",
    activities: [],
    hoverSummary: "waiting",
    ...overrides,
  };
}

describe("SessionRow pending action", () => {
  it("renders option buttons when pendingActions has one item", () => {
    const onRespond = vi.fn();
    const html = renderToStaticMarkup(
      <SessionRow
        session={baseRow({
          pendingActions: [
            {
              id: "a1",
              type: "approval",
              title: "Proceed?",
              options: ["Yes", "No"],
            },
          ],
        })}
        expanded
        onToggleExpanded={vi.fn()}
        onRespond={onRespond}
      />,
    );
    expect(html).toContain("Proceed?");
    expect(html).toContain(">Yes<");
    expect(html).toContain(">No<");
  });

  it("renders two pending action cards with buttons when pendingActions has two items", () => {
    const html = renderToStaticMarkup(
      <SessionRow
        session={baseRow({
          pendingActions: [
            {
              id: "a1",
              type: "approval",
              title: "First decision",
              options: ["OK", "Cancel"],
            },
            {
              id: "a2",
              type: "single_choice",
              title: "Second decision",
              options: ["A", "B"],
            },
          ],
        })}
        expanded
        onToggleExpanded={vi.fn()}
        onRespond={vi.fn()}
      />,
    );
    expect(html).toContain("First decision");
    expect(html).toContain("Second decision");
    expect(html).toContain(">OK<");
    expect(html).toContain(">Cancel<");
    expect(html).toContain(">A<");
    expect(html).toContain(">B<");
    const cards = html.match(/class="pending-action"/g);
    expect(cards).toHaveLength(2);
  });

  it("omits pending action UI when pendingActions is absent", () => {
    const html = renderToStaticMarkup(
      <SessionRow session={baseRow()} expanded={false} onToggleExpanded={vi.fn()} onRespond={vi.fn()} />,
    );
    expect(html).not.toContain("pending-action__title");
  });

  it("omits pending action UI when pendingActions is empty", () => {
    const html = renderToStaticMarkup(
      <SessionRow
        session={baseRow({ pendingActions: [] })}
        expanded={false}
        onToggleExpanded={vi.fn()}
        onRespond={vi.fn()}
      />,
    );
    expect(html).not.toContain("pending-action__title");
  });

  it("renders latest and recent activity sections in the expanded details panel", () => {
    const html = renderToStaticMarkup(
      <SessionRow
        session={baseRow({
          activities: [
            "Tool call: Bash",
            "Notification (permission_prompt): CodeBuddy needs your permission to use Bash",
          ],
          hoverSummary: "scan repo",
        })}
        expanded
        onToggleExpanded={vi.fn()}
        onRespond={vi.fn()}
      />,
    );

    expect(html).toContain("Latest");
    expect(html).toContain("Recent");
    expect(html).toContain("Tool call: Bash");
    expect(html).toContain(
      "Notification (permission_prompt): CodeBuddy needs your permission to use Bash",
    );
  });

  it("renders title and secondary meta separately", () => {
    const html = renderToStaticMarkup(
      <SessionRow
        session={baseRow({
          titleLabel: "Codex · review diff",
          tool: "codex",
          task: "scan files",
          shortId: "9af3",
          updatedLabel: "04-02 16:01",
        })}
        expanded={false}
        onToggleExpanded={vi.fn()}
        onRespond={vi.fn()}
      />,
    );

    expect(html).toContain("Codex · review diff");
    expect(html).toContain("scan files");
    expect(html).toContain("9af3");
    expect(html).toContain("04-02 16:01");
  });

  it("renders pending actions inside the expanded details container", () => {
    const html = renderToStaticMarkup(
      <SessionRow
        session={baseRow({
          pendingActions: [
            {
              id: "a1",
              type: "approval",
              title: "Proceed?",
              options: ["Yes", "No"],
            },
          ],
        })}
        expanded
        onToggleExpanded={vi.fn()}
        onRespond={vi.fn()}
      />,
    );

    expect(html).toContain("session-row__details");
    expect(html).toContain("Proceed?");
  });

  it("renders tool-specific marker classes for codex and cursor", () => {
    const codexHtml = renderToStaticMarkup(
      <SessionRow
        session={baseRow({ tool: "codex" })}
        expanded={false}
        onToggleExpanded={vi.fn()}
        onRespond={vi.fn()}
      />,
    );
    const cursorHtml = renderToStaticMarkup(
      <SessionRow
        session={baseRow({ tool: "cursor" })}
        expanded={false}
        onToggleExpanded={vi.fn()}
        onRespond={vi.fn()}
      />,
    );

    expect(codexHtml).toContain("tool-icon--codex");
    expect(cursorHtml).toContain("tool-icon--cursor");
  });
});
