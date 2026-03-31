import { describe, expect, it, vi } from "vitest";
import { lineToSessionEvent } from "../ingress/hookIngress";
import type { SessionStatus } from "./sessionTypes";
import { createSessionStore } from "./sessionStore";

describe("createSessionStore", () => {
  it("updates a session from incoming event envelopes", () => {
    const store = createSessionStore();

    store.applyEvent({
      type: "status_change",
      sessionId: "s1",
      tool: "cursor",
      status: "running",
      task: "fix auth bug",
      timestamp: 1,
    });

    expect(store.getSessions()[0]).toMatchObject({
      id: "s1",
      tool: "cursor",
      status: "running",
      task: "fix auth bug",
    });
  });

  it("does not persist sessions when status is not a known enum value", () => {
    const store = createSessionStore();

    store.applyEvent({
      sessionId: "s1",
      tool: "cursor",
      status: "bogus" as SessionStatus,
      timestamp: 1,
    });

    expect(store.getSessions()).toHaveLength(0);
  });

  it("stores pendingAction from status_change envelope", () => {
    const store = createSessionStore();
    const pendingAction = {
      id: "a1",
      type: "approval" as const,
      title: "Continue?",
      options: ["Yes", "No"],
    };

    store.applyEvent({
      sessionId: "s1",
      tool: "cursor",
      status: "waiting",
      timestamp: 1,
      pendingAction,
    });

    expect(store.getSessions()[0]).toMatchObject({
      id: "s1",
      pendingAction,
    });
  });

  it("clears pendingAction when envelope sends null", () => {
    const store = createSessionStore();
    store.applyEvent({
      sessionId: "s1",
      tool: "cursor",
      status: "waiting",
      timestamp: 1,
      pendingAction: {
        id: "a1",
        type: "approval",
        title: "T",
        options: ["OK"],
      },
    });
    store.applyEvent({
      sessionId: "s1",
      tool: "cursor",
      status: "running",
      timestamp: 2,
      pendingAction: null,
    });
    expect(store.getSessions()[0].pendingAction).toBeUndefined();
  });

  it("respondToPendingAction clears pending and returns action_response JSON", () => {
    const store = createSessionStore();
    store.applyEvent({
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

    const line = store.respondToPendingAction("s1", "act-1", "A");
    expect(line).toBe(
      JSON.stringify({
        type: "action_response",
        sessionId: "s1",
        actionId: "act-1",
        response: { kind: "option", value: "A" },
      }),
    );
    expect(store.getSessions()[0].pendingAction).toBeUndefined();
  });

  it("clears stale pending when raw hook sends invalid pendingAction (hookIngress + store)", () => {
    const store = createSessionStore();
    store.applyEvent({
      sessionId: "c3",
      tool: "cursor",
      status: "waiting",
      timestamp: 1,
      pendingAction: {
        id: "old",
        type: "approval",
        title: "Old",
        options: ["OK"],
      },
    });
    const ev = lineToSessionEvent(
      JSON.stringify({
        hook_event_name: "StatusChange",
        session_id: "c3",
        status: "running",
        pendingAction: { id: "bad", type: "nope", title: "t", options: [] },
      }),
    );
    expect(ev?.pendingAction).toBeNull();
    expect(ev).not.toBeNull();
    store.applyEvent(ev!);
    expect(store.getSessions()[0].pendingAction).toBeUndefined();
    expect(store.getSessions()[0].status).toBe("running");
  });

  it("respondToPendingAction refreshes updatedAt on success", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const store = createSessionStore();
    store.applyEvent({
      sessionId: "s1",
      tool: "cursor",
      status: "waiting",
      timestamp: 1000,
      pendingAction: {
        id: "act-1",
        type: "approval",
        title: "T",
        options: ["OK"],
      },
    });
    vi.setSystemTime(5000);
    store.respondToPendingAction("s1", "act-1", "OK");
    expect(store.getSessions()[0].updatedAt).toBe(5000);
    vi.useRealTimers();
  });
});
