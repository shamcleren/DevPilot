import { describe, expect, it, vi } from "vitest";
import * as createActionResponseTransportModule from "./createActionResponseTransport";
import { createSessionStore } from "../session/sessionStore";
import { dispatchActionResponse } from "./dispatchActionResponse";

describe("dispatchActionResponse", () => {
  it("when pending matches without responseTarget: uses fallback transport, send then complete then broadcast", async () => {
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

    const expectedLine = JSON.stringify({
      type: "action_response",
      sessionId: "s1",
      actionId: "act-1",
      response: { kind: "option", value: "A" },
    });

    const callOrder: string[] = [];
    const origComplete = store.completePendingActionResponse.bind(store);
    vi.spyOn(store, "completePendingActionResponse").mockImplementation((sid, aid) => {
      callOrder.push("complete");
      origComplete(sid, aid);
    });

    const fromTargetSpy = vi.spyOn(
      createActionResponseTransportModule,
      "createActionResponseTransportFromResponseTarget",
    );

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
    expect(callOrder).toEqual(["send", "complete", "broadcast"]);
    expect(store.getSessions()[0].pendingActions).toBeUndefined();
    expect(transport.send).toHaveBeenCalledWith(expectedLine);
    expect(broadcastSessions).toHaveBeenCalledTimes(1);
    expect(fromTargetSpy).not.toHaveBeenCalled();

    fromTargetSpy.mockRestore();
  });

  it("when prepare returns responseTarget: builds transport from target and does not use fallback send", async () => {
    const store = createSessionStore();
    const sockPath = "/tmp/devpilot-dispatch-target.sock";
    const target = { mode: "socket" as const, socketPath: sockPath, timeoutMs: 750 };

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
      responseTarget: target,
    });

    const expectedLine = JSON.stringify({
      type: "action_response",
      sessionId: "s1",
      actionId: "act-1",
      response: { kind: "option", value: "A" },
    });

    const targetSend = vi.fn(async () => {});
    const fromTargetSpy = vi
      .spyOn(createActionResponseTransportModule, "createActionResponseTransportFromResponseTarget")
      .mockReturnValue({ send: targetSend });

    const fallbackTransport = {
      send: vi.fn(async () => {
        throw new Error("fallback should not run");
      }),
    };
    const broadcastSessions = vi.fn();

    const result = await dispatchActionResponse(
      store,
      fallbackTransport,
      broadcastSessions,
      "s1",
      "act-1",
      "A",
    );

    expect(result).toBe(true);
    expect(fromTargetSpy).toHaveBeenCalledWith(target);
    expect(targetSend).toHaveBeenCalledWith(expectedLine);
    expect(fallbackTransport.send).not.toHaveBeenCalled();
    expect(broadcastSessions).toHaveBeenCalledTimes(1);
    expect(store.getSessions()[0].pendingActions).toBeUndefined();

    fromTargetSpy.mockRestore();
  });

  it("when send fails: does not complete, does not broadcast", async () => {
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

    const completeSpy = vi.spyOn(store, "completePendingActionResponse");
    const transport = {
      send: vi.fn(async () => {
        throw new Error("network down");
      }),
    };
    const broadcastSessions = vi.fn();

    await expect(
      dispatchActionResponse(store, transport, broadcastSessions, "s1", "act-1", "A"),
    ).rejects.toThrow("network down");

    expect(completeSpy).not.toHaveBeenCalled();
    expect(broadcastSessions).not.toHaveBeenCalled();
    expect(store.getSessions()[0].pendingActions).toHaveLength(1);
  });

  it("when send succeeds: completePendingActionResponse is called only for (sessionId, actionId)", async () => {
    const store = createSessionStore();
    store.applyEvent({
      type: "status_change",
      sessionId: "s1",
      tool: "cursor",
      status: "waiting",
      timestamp: 1,
      pendingAction: {
        id: "keep",
        type: "approval",
        title: "K",
        options: ["OK"],
      },
    });
    store.applyEvent({
      type: "status_change",
      sessionId: "s1",
      tool: "cursor",
      status: "waiting",
      timestamp: 2,
      pendingAction: {
        id: "remove-me",
        type: "approval",
        title: "R",
        options: ["OK"],
      },
    });

    const completeSpy = vi.spyOn(store, "completePendingActionResponse");
    const transport = { send: vi.fn(async () => {}) };
    const broadcastSessions = vi.fn();

    await dispatchActionResponse(
      store,
      transport,
      broadcastSessions,
      "s1",
      "remove-me",
      "OK",
    );

    expect(completeSpy).toHaveBeenCalledTimes(1);
    expect(completeSpy).toHaveBeenCalledWith("s1", "remove-me");
    const rec = store.getSessions()[0];
    expect(rec.pendingActions).toEqual([expect.objectContaining({ id: "keep" })]);
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
