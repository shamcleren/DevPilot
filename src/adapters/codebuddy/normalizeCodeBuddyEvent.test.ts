import { afterEach, describe, expect, it, vi } from "vitest";
import { CODEBUDDY_FIXTURES } from "../../../tests/fixtures/codebuddy";
import { normalizeCodeBuddyEvent } from "./normalizeCodeBuddyEvent";

afterEach(() => {
  vi.useRealTimers();
});

describe("normalizeCodeBuddyEvent", () => {
  it.each(CODEBUDDY_FIXTURES)(
    "normalizes fixture $id",
    ({ payload, expectation }) => {
      if (expectation.timestamp === "now") {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-03-31T12:00:00.000Z"));
      }

      const event = normalizeCodeBuddyEvent(payload);

      expect(event).toMatchObject({
        type: "status_change",
        sessionId: expectation.sessionId,
        tool: "codebuddy",
        status: expectation.status,
        ...(expectation.task !== undefined ? { task: expectation.task } : {}),
        ...(expectation.activityItems !== undefined
          ? { activityItems: expectation.activityItems }
          : {}),
        timestamp:
          expectation.timestamp === "now"
            ? Date.parse("2026-03-31T12:00:00.000Z")
            : expectation.timestamp,
      });

      if (expectation.meta) {
        expect(event.meta).toEqual(expect.objectContaining(expectation.meta));
      }
    },
  );

  it("keeps meta compact for hook-derived events", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-31T12:00:00.000Z"));

    const fixture = CODEBUDDY_FIXTURES.find(
      (item) => item.id === "hook-pre-tool-use-write",
    );
    expect(fixture).toBeDefined();

    const event = normalizeCodeBuddyEvent(fixture!.payload);

    expect(event.meta).toEqual(
      expect.objectContaining({
        hook_event_name: "PreToolUse",
        tool_name: "Write",
        cwd: "/workspace/demo",
      }),
    );
    expect(event.meta).not.toHaveProperty("tool_input");
    expect(event.meta).not.toHaveProperty("transcript_path");
  });

  it("treats Notification without notification_type as waiting instead of offline", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-31T12:00:00.000Z"));

    const event = normalizeCodeBuddyEvent({
      session_id: "cb-notification-fallback",
      hook_event_name: "Notification",
      message: "CodeBuddy requires attention",
    });

    expect(event).toMatchObject({
      sessionId: "cb-notification-fallback",
      status: "waiting",
      task: "CodeBuddy requires attention",
      activityItems: [
        expect.objectContaining({
          kind: "note",
          source: "system",
          title: "Notification",
          body: "CodeBuddy requires attention",
        }),
      ],
      timestamp: Date.parse("2026-03-31T12:00:00.000Z"),
    });
  });
});
