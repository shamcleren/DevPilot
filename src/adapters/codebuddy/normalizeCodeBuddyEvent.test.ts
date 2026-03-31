import { expect, it } from "vitest";
import { normalizeCodeBuddyEvent } from "./normalizeCodeBuddyEvent";

it("normalizes a CodeBuddy-style session update", () => {
  const event = normalizeCodeBuddyEvent({
    hook_event_name: "AgentSessionUpdate",
    session_id: "cb-1",
    state: "waiting",
    current_task: "review diff",
    timestamp: 42,
  });

  expect(event).toMatchObject({
    type: "status_change",
    sessionId: "cb-1",
    tool: "codebuddy",
    status: "waiting",
    task: "review diff",
    timestamp: 42,
  });
});
