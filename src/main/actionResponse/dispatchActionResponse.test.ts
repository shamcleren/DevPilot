import { describe, expect, it, vi } from "vitest";
import { createSessionStore } from "../session/sessionStore";
import { dispatchActionResponse } from "./dispatchActionResponse";

describe("dispatchActionResponse", () => {
  it("when pending matches: responds, broadcasts, sends line, clears pending, returns true", async () => {
    const store = createSessionStore();
    store.applyEvent({
      type: "status_change",
      sessionId: "s1",
      tool: "cursor",
      status: "waiting",
      timestamp: 1,
      pendingAction: {
        id: "act-1",
        type: "single_choice",
        title: "Pick",
        options: ["A", "B"],
      },
    });

    const callOrder: string[] = [];
    const origRespond = store.respondToPendingAction.bind(store);
    vi.spyOn(store, "respondToPendingAction").mockImplementation((sessionId, actionId, option) => {
      callOrder.push("respond");
      return origRespond(sessionId, actionId, option);
    });

    const expectedLine = JSON.stringify({
      type: "action_response",
      sessionId: "s1",
      actionId: "act-1",
      response: { kind: "option", value: "A" },
    });

    const transport = {
      send: vi.fn(async (line: string) => {
        callOrder.push("send");
        expect(line).toBe(expectedLine);
      }),
    };

    const broadcastSessions = vi.fn(() => {
      callOrder.push("broadcast");
    });

    const result = await dispatchActionResponse(
      store,
      transport,
      broadcastSessions,
      "s1",
      "act-1",
      "A",
    );

    expect(result).toBe(true);
    expect(callOrder).toEqual(["respond", "broadcast", "send"]);
    expect(store.getSessions()[0].pendingAction).toBeUndefined();
    expect(transport.send).toHaveBeenCalledWith(expectedLine);
    expect(broadcastSessions).toHaveBeenCalledTimes(1);
  });

  it("when pending does not match: returns false and does not call transport.send", async () => {
    const store = createSessionStore();
    store.applyEvent({
      type: "status_change",
      sessionId: "s1",
      tool: "cursor",
      status: "waiting",
      timestamp: 1,
      pendingAction: {
        id: "act-1",
        type: "single_choice",
        title: "Pick",
        options: ["A", "B"],
      },
    });

    const transport = {
      send: vi.fn(async () => {}),
    };
    const broadcastSessions = vi.fn();

    const result = await dispatchActionResponse(
      store,
      transport,
      broadcastSessions,
      "s1",
      "wrong-id",
      "A",
    );

    expect(result).toBe(false);
    expect(transport.send).not.toHaveBeenCalled();
    expect(broadcastSessions).not.toHaveBeenCalled();
  });
});
