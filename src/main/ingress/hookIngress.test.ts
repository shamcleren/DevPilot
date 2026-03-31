import { describe, expect, it } from "vitest";
import { lineToSessionEvent } from "./hookIngress";

describe("lineToSessionEvent", () => {
  it("accepts canonical status_change envelope", () => {
    const ev = lineToSessionEvent(
      JSON.stringify({
        type: "status_change",
        sessionId: "s1",
        tool: "cursor",
        status: "running",
        task: "fix auth bug",
        timestamp: 1,
      }),
    );
    expect(ev).toMatchObject({
      sessionId: "s1",
      tool: "cursor",
      status: "running",
      task: "fix auth bug",
      timestamp: 1,
    });
  });

  it("normalizes Cursor StatusChange hook payload", () => {
    const ev = lineToSessionEvent(
      JSON.stringify({
        hook_event_name: "StatusChange",
        session_id: "c1",
        status: "waiting",
        task: "t",
      }),
    );
    expect(ev?.sessionId).toBe("c1");
    expect(ev?.tool).toBe("cursor");
    expect(ev?.status).toBe("waiting");
  });

  it("normalizes CodeBuddy payload with source tag", () => {
    const ev = lineToSessionEvent(
      JSON.stringify({
        source: "codebuddy",
        session_id: "b1",
        state: "error",
        current_task: "tests",
      }),
    );
    expect(ev?.sessionId).toBe("b1");
    expect(ev?.tool).toBe("codebuddy");
    expect(ev?.status).toBe("error");
  });

  it("returns null for invalid status string", () => {
    expect(
      lineToSessionEvent(
        JSON.stringify({
          type: "status_change",
          sessionId: "x",
          tool: "cursor",
          status: "not-a-real-status",
          timestamp: 1,
        }),
      ),
    ).toBeNull();
  });

  it("drops Cursor StatusChange when session_id is missing", () => {
    expect(
      lineToSessionEvent(
        JSON.stringify({
          hook_event_name: "StatusChange",
          status: "running",
        }),
      ),
    ).toBeNull();
  });

  it("drops canonical envelope when sessionId is only whitespace", () => {
    expect(
      lineToSessionEvent(
        JSON.stringify({
          type: "status_change",
          sessionId: "   ",
          tool: "cursor",
          status: "running",
          timestamp: 1,
        }),
      ),
    ).toBeNull();
  });

  it("parses pendingAction on canonical status_change", () => {
    const pendingAction = {
      id: "p1",
      type: "approval" as const,
      title: "OK?",
      options: ["Yes", "No"],
    };
    const ev = lineToSessionEvent(
      JSON.stringify({
        type: "status_change",
        sessionId: "s1",
        tool: "cursor",
        status: "waiting",
        timestamp: 3,
        pendingAction,
      }),
    );
    expect(ev?.pendingAction).toEqual(pendingAction);
  });

  it("reads pendingAction from raw Cursor StatusChange payload", () => {
    const pendingAction = {
      id: "c-p",
      type: "single_choice" as const,
      title: "Choose",
      options: ["One"],
    };
    const ev = lineToSessionEvent(
      JSON.stringify({
        hook_event_name: "StatusChange",
        session_id: "c2",
        status: "waiting",
        pendingAction,
      }),
    );
    expect(ev?.pendingAction).toEqual(pendingAction);
  });

  it("treats invalid pendingAction on raw Cursor payload as clear (null)", () => {
    const ev = lineToSessionEvent(
      JSON.stringify({
        hook_event_name: "StatusChange",
        session_id: "c3",
        status: "running",
        pendingAction: { id: "x", type: "not-a-kind", title: "t", options: ["a"] },
      }),
    );
    expect(ev?.pendingAction).toBeNull();
  });

  it("treats invalid pendingAction on raw CodeBuddy payload as clear (null)", () => {
    const ev = lineToSessionEvent(
      JSON.stringify({
        source: "codebuddy",
        session_id: "b2",
        state: "running",
        pendingAction: "not-an-object",
      }),
    );
    expect(ev?.pendingAction).toBeNull();
  });

  it("parses legal responseTarget on canonical status_change", () => {
    const responseTarget = {
      mode: "socket" as const,
      socketPath: "/tmp/devpilot.sock",
      timeoutMs: 25000,
    };
    const ev = lineToSessionEvent(
      JSON.stringify({
        type: "status_change",
        sessionId: "s-rt",
        tool: "cursor",
        status: "waiting",
        timestamp: 9,
        responseTarget,
      }),
    );
    expect(ev).toMatchObject({
      sessionId: "s-rt",
      status: "waiting",
      responseTarget,
    });
  });

  it("rejects canonical status_change when pendingAction is null but responseTarget is invalid", () => {
    expect(
      lineToSessionEvent(
        JSON.stringify({
          type: "status_change",
          sessionId: "s-rt-null-pa",
          tool: "cursor",
          status: "running",
          timestamp: 10,
          pendingAction: null,
          responseTarget: { mode: "not-socket", socketPath: "/x" },
        }),
      ),
    ).toBeNull();
  });

  it("ignores illegal responseTarget on raw hook payload but keeps the event", () => {
    const ev = lineToSessionEvent(
      JSON.stringify({
        hook_event_name: "StatusChange",
        session_id: "c-rt",
        status: "running",
        responseTarget: { mode: "not-socket", socketPath: "/x" },
      }),
    );
    expect(ev).not.toBeNull();
    expect(ev?.sessionId).toBe("c-rt");
    expect(ev?.status).toBe("running");
    expect(ev).not.toHaveProperty("responseTarget");
  });

  it("parses pendingClosed on canonical status_change", () => {
    const pendingClosed = { actionId: "a1", reason: "expired" as const };
    const ev = lineToSessionEvent(
      JSON.stringify({
        type: "status_change",
        sessionId: "s-pc",
        tool: "cursor",
        status: "running",
        timestamp: 11,
        pendingClosed,
      }),
    );
    expect(ev).toMatchObject({
      sessionId: "s-pc",
      status: "running",
      pendingClosed,
    });
  });

  it("treats pendingClosed null on canonical status_change as absent", () => {
    const ev = lineToSessionEvent(
      JSON.stringify({
        type: "status_change",
        sessionId: "s-pc-null",
        tool: "cursor",
        status: "running",
        timestamp: 11.5,
        pendingClosed: null,
      }),
    );
    expect(ev).not.toBeNull();
    expect(ev?.sessionId).toBe("s-pc-null");
    expect(ev).not.toHaveProperty("pendingClosed");
  });

  it("rejects canonical status_change when pendingClosed is malformed", () => {
    expect(
      lineToSessionEvent(
        JSON.stringify({
          type: "status_change",
          sessionId: "s-pc-bad",
          tool: "cursor",
          status: "running",
          timestamp: 12,
          pendingClosed: { actionId: "x", reason: "not-a-reason" },
        }),
      ),
    ).toBeNull();
  });

  it("ignores malformed pendingClosed on raw hook payload but keeps the event", () => {
    const ev = lineToSessionEvent(
      JSON.stringify({
        hook_event_name: "StatusChange",
        session_id: "c-pc",
        status: "waiting",
        pendingClosed: { actionId: 1, reason: "expired" },
      }),
    );
    expect(ev).not.toBeNull();
    expect(ev?.sessionId).toBe("c-pc");
    expect(ev?.status).toBe("waiting");
    expect(ev).not.toHaveProperty("pendingClosed");
  });

  it("treats pendingClosed null on raw hook payload as absent", () => {
    const ev = lineToSessionEvent(
      JSON.stringify({
        hook_event_name: "StatusChange",
        session_id: "c-pc-null",
        status: "waiting",
        pendingClosed: null,
      }),
    );
    expect(ev).not.toBeNull();
    expect(ev?.sessionId).toBe("c-pc-null");
    expect(ev).not.toHaveProperty("pendingClosed");
  });

  it("reads pendingClosed from raw CodeBuddy payload when valid", () => {
    const pendingClosed = { actionId: "b-a", reason: "cancelled" as const };
    const ev = lineToSessionEvent(
      JSON.stringify({
        source: "codebuddy",
        session_id: "b-pc",
        state: "running",
        pendingClosed,
      }),
    );
    expect(ev?.pendingClosed).toEqual(pendingClosed);
  });

  it("keeps pendingAction and responseTarget when pendingClosed is present on canonical", () => {
    const pendingAction = {
      id: "combo",
      type: "approval" as const,
      title: "OK?",
      options: ["Yes"],
    };
    const responseTarget = { mode: "socket" as const, socketPath: "/tmp/x.sock" };
    const pendingClosed = { actionId: "other", reason: "consumed_remote" as const };
    const ev = lineToSessionEvent(
      JSON.stringify({
        type: "status_change",
        sessionId: "s-combo",
        tool: "cursor",
        status: "waiting",
        timestamp: 13,
        pendingAction,
        responseTarget,
        pendingClosed,
      }),
    );
    expect(ev?.pendingAction).toEqual(pendingAction);
    expect(ev?.responseTarget).toEqual(responseTarget);
    expect(ev?.pendingClosed).toEqual(pendingClosed);
  });
});
