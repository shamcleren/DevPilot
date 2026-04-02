import { expect, it } from "vitest";
import { normalizeCursorEvent } from "./normalizeCursorEvent";

it("normalizes a status change payload", () => {
  const event = normalizeCursorEvent({
    hook_event_name: "StatusChange",
    session_id: "s1",
    cwd: "/tmp/project",
    task: "fix auth bug",
    status: "running",
  });

  expect(event).toMatchObject({
    type: "status_change",
    sessionId: "s1",
    tool: "cursor",
    status: "running",
    task: "fix auth bug",
  });
});

it("returns null when session_id is absent", () => {
  expect(
    normalizeCursorEvent({
      hook_event_name: "StatusChange",
      status: "running",
    }),
  ).toBeNull();
});

it("returns null when session_id is null or only whitespace", () => {
  expect(
    normalizeCursorEvent({
      hook_event_name: "StatusChange",
      session_id: null,
      status: "running",
    }),
  ).toBeNull();
  expect(
    normalizeCursorEvent({
      hook_event_name: "StatusChange",
      session_id: "  \t  ",
      status: "running",
    }),
  ).toBeNull();
});

it("accepts sessionId alias and trims whitespace", () => {
  expect(
    normalizeCursorEvent({
      hook_event_name: "StatusChange",
      sessionId: "  sid  ",
      status: "idle",
    }),
  ).toMatchObject({ sessionId: "sid", tool: "cursor" });
});

it("ignores low-signal cursor sessionStart payloads that only announce agent mode", () => {
  expect(
    normalizeCursorEvent({
      hook_event_name: "SessionStart",
      session_id: "cursor-raw-1",
      composer_mode: "agent",
    }),
  ).toBeNull();
});

it("keeps supported pending actions on raw cursor payloads", () => {
  expect(
    normalizeCursorEvent({
      hook_event_name: "Notification",
      session_id: "cursor-raw-2",
      pendingAction: {
        id: "act-1",
        type: "approval",
        title: "Continue?",
        options: ["Yes", "No"],
      },
      responseTarget: {
        mode: "socket",
        socketPath: "/tmp/resp.sock",
      },
    }),
  ).toMatchObject({
    sessionId: "cursor-raw-2",
    status: "waiting",
    pendingAction: {
      id: "act-1",
      type: "approval",
    },
    responseTarget: {
      mode: "socket",
      socketPath: "/tmp/resp.sock",
    },
    activityItems: [
      {
        kind: "note",
        source: "system",
        title: "Notification",
        body: "Waiting",
        tone: "waiting",
      },
    ],
  });
});

it("degrades unsupported cursor interactive actions into visible waiting events", () => {
  expect(
    normalizeCursorEvent({
      hook_event_name: "Notification",
      session_id: "cursor-raw-3",
      pendingAction: {
        id: "act-2",
        type: "text_input",
        title: "Explain why",
        options: [],
      },
    }),
  ).toMatchObject({
    sessionId: "cursor-raw-3",
    status: "waiting",
    task: "Unsupported Cursor action: text_input",
    meta: {
      hook_event_name: "Notification",
      unsupported_action_type: "text_input",
      unsupported_action_title: "Explain why",
    },
    activityItems: [
      {
        kind: "system",
        source: "system",
        title: "Unsupported Cursor action",
        body: "Unsupported Cursor action: text_input",
        tone: "waiting",
      },
    ],
    pendingAction: null,
  });
});

it("reads pendingClosed from raw cursor payloads", () => {
  expect(
    normalizeCursorEvent({
      hook_event_name: "Stop",
      session_id: "cursor-raw-4",
      pendingClosed: {
        actionId: "act-1",
        reason: "consumed_remote",
      },
    }),
  ).toMatchObject({
    sessionId: "cursor-raw-4",
    pendingClosed: {
      actionId: "act-1",
      reason: "consumed_remote",
    },
  });
});

it("falls back to conversation_id when session_id is absent", () => {
  expect(
    normalizeCursorEvent({
      tool: "cursor",
      hook_event_name: "beforeSubmitPrompt",
      conversation_id: "conv-123",
      text: "ship it",
    }),
  ).toMatchObject({
    sessionId: "conv-123",
    tool: "cursor",
    status: "running",
    task: "ship it",
    activityItems: [
      {
        kind: "message",
        source: "user",
        title: "User",
        body: "ship it",
      },
    ],
  });
});

it("falls back to generation_id when neither session_id nor conversation_id is present", () => {
  expect(
    normalizeCursorEvent({
      tool: "cursor",
      hook_event_name: "afterAgentResponse",
      generation_id: "gen-123",
      text: "done",
    }),
  ).toMatchObject({
    sessionId: "gen-123",
    tool: "cursor",
    status: "running",
    task: "done",
  });
});

it("maps afterAgentResponse into an assistant message activity", () => {
  expect(
    normalizeCursorEvent({
      hook_event_name: "afterAgentResponse",
      session_id: "cursor-raw-5",
      text: "I finished the refactor and test pass.",
    }),
  ).toMatchObject({
    sessionId: "cursor-raw-5",
    status: "running",
    activityItems: [
      {
        kind: "message",
        source: "assistant",
        title: "Assistant",
        body: "I finished the refactor and test pass.",
      },
    ],
  });
});

it("maps beforeShellExecution into a tool call activity", () => {
  expect(
    normalizeCursorEvent({
      hook_event_name: "beforeShellExecution",
      session_id: "cursor-raw-6",
      tool_name: "Bash",
      command: "npm test -- --runInBand",
    }),
  ).toMatchObject({
    sessionId: "cursor-raw-6",
    status: "running",
    activityItems: [
      {
        kind: "tool",
        source: "tool",
        title: "Bash",
        toolName: "Bash",
        toolPhase: "call",
        body: "npm test -- --runInBand",
      },
    ],
  });
});

it("maps afterFileEdit into a system activity with edit summary", () => {
  expect(
    normalizeCursorEvent({
      hook_event_name: "afterFileEdit",
      session_id: "cursor-raw-7",
      text: "Edited src/renderer/styles.css +22 -6",
    }),
  ).toMatchObject({
    sessionId: "cursor-raw-7",
    status: "running",
    activityItems: [
      {
        kind: "system",
        source: "system",
        title: "File Edit",
        body: "Edited src/renderer/styles.css +22 -6",
      },
    ],
  });
});

it("drops afterAgentThought so internal reasoning does not render in the session timeline", () => {
  expect(
    normalizeCursorEvent({
      hook_event_name: "afterAgentThought",
      session_id: "cursor-raw-8",
      text: "**Explaining JSON completion** I think I need to clarify...",
    }),
  ).toBeNull();
});
