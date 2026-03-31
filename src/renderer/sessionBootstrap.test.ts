import { describe, expect, it } from "vitest";
import type { SessionRecord } from "../shared/sessionTypes";
import { hydrateRowsIfEmpty, rowsFromSessions } from "./sessionBootstrap";

const currentSessions: SessionRecord[] = [
  {
    id: "s1",
    tool: "cursor",
    status: "waiting",
    task: "review change",
    updatedAt: 1_700_000_000_000,
    pendingActions: [
      {
        id: "a1",
        type: "single_choice",
        title: "Pick one",
        options: ["Approve", "Reject"],
      },
    ],
  },
];

describe("sessionBootstrap", () => {
  it("hydrates empty rows from the current sessions snapshot", () => {
    const rows = hydrateRowsIfEmpty([], currentSessions);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "s1",
      task: "review change",
      hoverSummary: "review change",
    });
    expect(rows[0].pendingActions).toEqual([
      {
        id: "a1",
        type: "single_choice",
        title: "Pick one",
        options: ["Approve", "Reject"],
      },
    ]);
  });

  it("does not overwrite rows that already arrived from push updates", () => {
    const pushedRows = rowsFromSessions(currentSessions);

    expect(hydrateRowsIfEmpty(pushedRows, [])).toBe(pushedRows);
  });

  it("maps a pushed snapshot with no pendingActions to rows with no pending cards (matches onSessions replace)", () => {
    const withPending = rowsFromSessions(currentSessions);
    expect(withPending).toHaveLength(1);
    expect(withPending[0].pendingActions).toEqual([
      {
        id: "a1",
        type: "single_choice",
        title: "Pick one",
        options: ["Approve", "Reject"],
      },
    ]);

    const snapshotNoPending: SessionRecord[] = [
      {
        id: "s1",
        tool: "cursor",
        status: "running",
        task: "review change",
        updatedAt: 1_700_000_001_000,
      },
    ];
    const afterPush = rowsFromSessions(snapshotNoPending);

    expect(afterPush).toHaveLength(1);
    expect(afterPush[0].id).toBe("s1");
    expect(afterPush[0].pendingActions ?? []).toEqual([]);
  });
});
