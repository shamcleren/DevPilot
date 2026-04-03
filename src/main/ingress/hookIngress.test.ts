import { afterEach, describe, expect, it, vi } from "vitest";
import { CODEBUDDY_FIXTURES } from "../../../tests/fixtures/codebuddy";
import { CURSOR_FIXTURES } from "../../../tests/fixtures/cursor";
import { lineToSessionEvent } from "./hookIngress";

afterEach(() => {
  vi.useRealTimers();
});

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

  it("drops low-signal raw Cursor SessionStart payloads that only announce agent mode", () => {
    const ev = lineToSessionEvent(
      JSON.stringify({
        tool: "cursor",
        source: "cursor",
        hook_event_name: "SessionStart",
        session_id: "cursor-start-1",
        composer_mode: "agent",
      }),
    );
    expect(ev).toBeNull();
  });

  it("degrades unsupported raw Cursor interactive payloads into visible events", () => {
    const ev = lineToSessionEvent(
      JSON.stringify({
        tool: "cursor",
        source: "cursor",
        hook_event_name: "Notification",
        session_id: "cursor-unsupported-1",
        pendingAction: {
          id: "text-1",
          type: "text_input",
          title: "Explain why",
          options: [],
        },
      }),
    );
    expect(ev).toMatchObject({
      sessionId: "cursor-unsupported-1",
      tool: "cursor",
      status: "waiting",
      task: "Unsupported Cursor action: text_input",
      pendingAction: null,
      meta: {
        hook_event_name: "Notification",
        unsupported_action_type: "text_input",
      },
    });
  });

  it("normalizes raw Cursor payloads that use conversation_id as the session key", () => {
    const ev = lineToSessionEvent(
      JSON.stringify({
        tool: "cursor",
        source: "cursor",
        hook_event_name: "beforeSubmitPrompt",
        conversation_id: "cursor-conv-1",
        text: "ship it",
      }),
    );
    expect(ev).toMatchObject({
      sessionId: "cursor-conv-1",
      tool: "cursor",
      status: "running",
      task: "ship it",
    });
  });

  it("keeps richer Cursor assistant/tool activity items through ingress", () => {
    const ev = lineToSessionEvent(
      JSON.stringify({
        tool: "cursor",
        source: "cursor",
        hook_event_name: "beforeShellExecution",
        session_id: "cursor-shell-1",
        tool_name: "Bash",
        command: "npm test -- --runInBand",
      }),
    );
    expect(ev).toMatchObject({
      sessionId: "cursor-shell-1",
      tool: "cursor",
      status: "running",
      activityItems: [
        {
          kind: "tool",
          source: "tool",
          title: "Bash",
          toolPhase: "call",
          body: "npm test -- --runInBand",
        },
      ],
    });
  });

  it("drops raw Cursor afterAgentThought payloads so internal reasoning stays hidden", () => {
    const ev = lineToSessionEvent(
      JSON.stringify({
        tool: "cursor",
        source: "cursor",
        hook_event_name: "afterAgentThought",
        session_id: "cursor-thought-1",
        text: "**Explaining JSON completion** I think I need to clarify...",
      }),
    );
    expect(ev).toBeNull();
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

  it("normalizes official CodeBuddy SessionStart payload even when source is startup", () => {
    const fixture = CODEBUDDY_FIXTURES.find(
      (item) => item.id === "hook-session-start-source-startup",
    );
    expect(fixture).toBeDefined();

    const ev = lineToSessionEvent(JSON.stringify(fixture!.payload));

    expect(ev).toMatchObject({
      sessionId: "cb-session-101",
      tool: "codebuddy",
      status: "running",
      task: "startup",
    });
  });

  it("normalizes official CodeBuddy Notification payload without source injection", () => {
    const fixture = CODEBUDDY_FIXTURES.find(
      (item) => item.id === "hook-notification-permission-prompt",
    );
    expect(fixture).toBeDefined();

    const ev = lineToSessionEvent(JSON.stringify(fixture!.payload));

    expect(ev).toMatchObject({
      sessionId: "cb-session-102",
      tool: "codebuddy",
      status: "waiting",
      task: "CodeBuddy needs your permission to use Bash",
      meta: {
        hook_event_name: "Notification",
        notification_type: "permission_prompt",
      },
    });
  });

  it.each(CURSOR_FIXTURES)(
    "normalizes Cursor fixture $id through ingress",
    ({ payload, expectation }) => {
      const ev = lineToSessionEvent(
        JSON.stringify({
          tool: "cursor",
          source: "cursor",
          ...payload,
        }),
      );

      expect(ev).toMatchObject({
        sessionId: expectation.sessionId,
        tool: "cursor",
        status: expectation.status,
        ...(expectation.task !== undefined ? { task: expectation.task } : {}),
        activityItems: expectation.activityItems,
      });

      if (expectation.meta) {
        expect(ev?.meta).toEqual(expect.objectContaining(expectation.meta));
      }
    },
  );

  it.each(CODEBUDDY_FIXTURES)(
    "normalizes CodeBuddy fixture $id through ingress",
    ({ payload, expectation }) => {
      if (expectation.timestamp === "now") {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-03-31T12:00:00.000Z"));
      }

      const ev = lineToSessionEvent(JSON.stringify(payload));

      expect(ev).toMatchObject({
        sessionId: expectation.sessionId,
        tool: "codebuddy",
        status: expectation.status,
        ...(expectation.task !== undefined ? { task: expectation.task } : {}),
        timestamp:
          expectation.timestamp === "now"
            ? Date.parse("2026-03-31T12:00:00.000Z")
            : expectation.timestamp,
      });
    },
  );

  it("normalizes AgentSessionUpdate without relying on source/tool injection", () => {
    const ev = lineToSessionEvent(
      JSON.stringify({
        hook_event_name: "AgentSessionUpdate",
        session_id: "cb-agent-update",
        state: "running",
        current_task: "sync diagnostics",
      }),
    );

    expect(ev).toMatchObject({
      sessionId: "cb-agent-update",
      tool: "codebuddy",
      status: "running",
      task: "sync diagnostics",
    });
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
      socketPath: "/tmp/codepal.sock",
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
