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
  it("renders option buttons when pendingAction is set", () => {
    const onRespond = vi.fn();
    const html = renderToStaticMarkup(
      <SessionRow
        session={baseRow({
          pendingAction: {
            id: "a1",
            type: "approval",
            title: "Proceed?",
            options: ["Yes", "No"],
          },
        })}
        onRespond={onRespond}
      />,
    );
    expect(html).toContain("Proceed?");
    expect(html).toContain(">Yes<");
    expect(html).toContain(">No<");
  });

  it("omits pending action UI when absent", () => {
    const html = renderToStaticMarkup(
      <SessionRow session={baseRow()} onRespond={vi.fn()} />,
    );
    expect(html).not.toContain("pending-action__title");
  });
});
