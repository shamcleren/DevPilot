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
      <SessionRow session={baseRow()} onRespond={vi.fn()} />,
    );
    expect(html).not.toContain("pending-action__title");
  });

  it("omits pending action UI when pendingActions is empty", () => {
    const html = renderToStaticMarkup(
      <SessionRow session={baseRow({ pendingActions: [] })} onRespond={vi.fn()} />,
    );
    expect(html).not.toContain("pending-action__title");
  });
});
