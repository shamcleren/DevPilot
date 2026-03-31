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

  it("stores pendingAction from status_change envelope as pendingActions", () => {
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
      pendingActions: [pendingAction],
    });
    expect(store.getSessions()[0]).not.toHaveProperty("responseTarget");
  });

  it("accumulates two different actionIds on the same session in pendingActions", () => {
    const store = createSessionStore();
    const a1 = {
      id: "a1",
      type: "approval" as const,
      title: "First",
      options: ["OK"],
    };
    const a2 = {
      id: "a2",
      type: "single_choice" as const,
      title: "Second",
      options: ["X", "Y"],
    };
    store.applyEvent({
      sessionId: "s1",
      tool: "cursor",
      status: "waiting",
      timestamp: 1,
      pendingAction: a1,
    });
    store.applyEvent({
      sessionId: "s1",
      tool: "cursor",
      status: "waiting",
      timestamp: 2,
      pendingAction: a2,
    });
    const rec = store.getSessions()[0];
    expect(rec.pendingActions).toHaveLength(2);
    expect(rec.pendingActions).toEqual(expect.arrayContaining([a1, a2]));
  });

  it("keeps pendingActions unchanged when a later event omits pendingAction", () => {
    const store = createSessionStore();
    const a1 = {
      id: "a1",
      type: "approval" as const,
      title: "First",
      options: ["OK"],
    };
    const a2 = {
      id: "a2",
      type: "single_choice" as const,
      title: "Second",
      options: ["X"],
    };
    store.applyEvent({
      sessionId: "s1",
      tool: "cursor",
      status: "waiting",
      timestamp: 1,
      pendingAction: a1,
    });
    store.applyEvent({
      sessionId: "s1",
      tool: "cursor",
      status: "waiting",
      timestamp: 2,
      pendingAction: a2,
    });
    store.applyEvent({
      sessionId: "s1",
      tool: "cursor",
      status: "running",
      task: "still going",
      timestamp: 3,
    });
    const rec = store.getSessions()[0];
    expect(rec.status).toBe("running");
    expect(rec.task).toBe("still going");
    expect(rec.updatedAt).toBe(3);
    expect(rec.pendingActions).toHaveLength(2);
    expect(rec.pendingActions).toEqual(expect.arrayContaining([a1, a2]));
  });

  it("upserts same actionId and replaces action fields; retains responseTarget when follow-up omits it", () => {
    const store = createSessionStore();
    const t1 = { mode: "socket" as const, socketPath: "/a.sock" };
    store.applyEvent({
      sessionId: "s1",
      tool: "cursor",
      status: "waiting",
      timestamp: 1,
      pendingAction: { id: "x", type: "approval", title: "Old", options: ["OK"] },
      responseTarget: t1,
    });
    const updated = {
      id: "x",
      type: "approval" as const,
      title: "NewTitle",
      options: ["OK", "Cancel"],
    };
    store.applyEvent({
      sessionId: "s1",
      tool: "cursor",
      status: "waiting",
      timestamp: 2,
      pendingAction: updated,
    });
    expect(store.getSessions()[0].pendingActions).toEqual([updated]);
    expect(store.preparePendingActionResponse("s1", "x", "OK")).toMatchObject({
      responseTarget: t1,
    });
  });

  it("upserts same actionId and overwrites responseTarget when follow-up includes responseTarget", () => {
    const store = createSessionStore();
    const t1 = { mode: "socket" as const, socketPath: "/old.sock" };
    const t2 = { mode: "socket" as const, socketPath: "/new.sock" };
    store.applyEvent({
      sessionId: "s1",
      tool: "cursor",
      status: "waiting",
      timestamp: 1,
      pendingAction: { id: "x", type: "approval", title: "T", options: ["OK"] },
      responseTarget: t1,
    });
    store.applyEvent({
      sessionId: "s1",
      tool: "cursor",
      status: "waiting",
      timestamp: 2,
      pendingAction: { id: "x", type: "approval", title: "T", options: ["OK"] },
      responseTarget: t2,
    });
    expect(store.preparePendingActionResponse("s1", "x", "OK")).toMatchObject({
      responseTarget: t2,
    });
  });

  it("preparePendingActionResponse returns line and responseTarget for matching action", () => {
    const store = createSessionStore();
    const target = { mode: "socket" as const, socketPath: "/tmp/x.sock", timeoutMs: 500 };
    store.applyEvent({
      sessionId: "s1",
      tool: "cursor",
      status: "waiting",
      timestamp: 1,
      pendingAction: {
        id: "act-x",
        type: "approval",
        title: "T",
        options: ["OK"],
      },
      responseTarget: target,
    });
    const prep = store.preparePendingActionResponse("s1", "act-x", "OK");
    expect(prep).toEqual({
      line: JSON.stringify({
        type: "action_response",
        sessionId: "s1",
        actionId: "act-x",
        response: { kind: "option", value: "OK" },
      }),
      responseTarget: target,
    });
    expect(store.getSessions()[0].pendingActions).toHaveLength(1);
  });

  it("completePendingActionResponse removes only the given actionId", () => {
    const store = createSessionStore();
    store.applyEvent({
      sessionId: "s1",
      tool: "cursor",
      status: "waiting",
      timestamp: 1,
      pendingAction: {
        id: "keep-me",
        type: "approval",
        title: "K",
        options: ["OK"],
      },
    });
    store.applyEvent({
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
    store.completePendingActionResponse("s1", "remove-me");
    const rec = store.getSessions()[0];
    expect(rec.pendingActions).toEqual([
      expect.objectContaining({ id: "keep-me" }),
    ]);
  });

  it("clears all pending when envelope sends pendingAction null", () => {
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
      status: "waiting",
      timestamp: 2,
      pendingAction: {
        id: "a2",
        type: "approval",
        title: "T2",
        options: ["OK"],
      },
    });
    store.applyEvent({
      sessionId: "s1",
      tool: "cursor",
      status: "running",
      timestamp: 3,
      pendingAction: null,
    });
    expect(store.getSessions()[0].pendingActions).toBeUndefined();
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
    expect(store.getSessions()[0].pendingActions).toBeUndefined();
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
    expect(store.getSessions()[0].pendingActions).toBeUndefined();
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
