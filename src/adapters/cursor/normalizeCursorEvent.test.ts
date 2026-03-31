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
