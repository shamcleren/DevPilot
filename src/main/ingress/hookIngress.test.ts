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
});
