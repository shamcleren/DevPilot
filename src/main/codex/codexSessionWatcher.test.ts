import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCodexSessionWatcher } from "./codexSessionWatcher";

describe("createCodexSessionWatcher", () => {
  let tmpDir: string | null = null;

  afterEach(() => {
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = null;
    }
  });

  it("reads new Codex log lines incrementally without replaying old ones", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codepal-codex-"));
    const sessionDir = path.join(tmpDir, "2026", "04", "02");
    fs.mkdirSync(sessionDir, { recursive: true });
    const filePath = path.join(
      sessionDir,
      "rollout-2026-04-02T10-46-14-019d4c15-8d42-78f1-955e-d57f67061b9e.jsonl",
    );

    fs.writeFileSync(
      filePath,
      `${JSON.stringify({
        timestamp: "2026-04-02T02:46:49.900Z",
        type: "session_meta",
        payload: {
          id: "019d4c15-8d42-78f1-955e-d57f67061b9e",
          cwd: "/Users/demo/codepal",
        },
      })}\n`,
    );

    const onEvent = vi.fn();
    const watcher = createCodexSessionWatcher({
      sessionsRoot: tmpDir,
      onEvent,
    });

    await watcher.pollOnce();
    await watcher.pollOnce();

    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent.mock.calls[0]?.[0]).toMatchObject({
      sessionId: "019d4c15-8d42-78f1-955e-d57f67061b9e",
      tool: "codex",
      status: "running",
    });

    fs.appendFileSync(
      filePath,
      `${JSON.stringify({
        timestamp: "2026-04-02T02:46:58.278Z",
        type: "event_msg",
        payload: {
          type: "user_message",
          message: "继续推进 Codex 接入。",
        },
      })}\n`,
    );

    await watcher.pollOnce();

    expect(onEvent).toHaveBeenCalledTimes(2);
    expect(onEvent.mock.calls[1]?.[0]).toMatchObject({
      sessionId: "019d4c15-8d42-78f1-955e-d57f67061b9e",
      tool: "codex",
      task: "继续推进 Codex 接入。",
      activityItems: [
        expect.objectContaining({
          kind: "message",
          source: "user",
          body: "继续推进 Codex 接入。",
        }),
      ],
    });
  });

  it("keeps incremental reads aligned when new lines contain multibyte text", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codepal-codex-"));
    const sessionDir = path.join(tmpDir, "2026", "04", "02");
    fs.mkdirSync(sessionDir, { recursive: true });
    const filePath = path.join(
      sessionDir,
      "rollout-2026-04-02T15-11-32-019d4d08-71ca-71a2-a533-55d6b7a9d395.jsonl",
    );

    fs.writeFileSync(
      filePath,
      `${JSON.stringify({
        timestamp: "2026-04-02T08:00:51.370Z",
        type: "event_msg",
        payload: {
          type: "task_started",
          turn_id: "turn_1",
        },
      })}\n`,
    );

    const onEvent = vi.fn();
    const watcher = createCodexSessionWatcher({
      sessionsRoot: tmpDir,
      onEvent,
    });

    await watcher.pollOnce();

    fs.appendFileSync(
      filePath,
      `${JSON.stringify({
        timestamp: "2026-04-02T08:00:51.372Z",
        type: "event_msg",
        payload: {
          type: "user_message",
          message: "好像还不对，现在的消息还是之前的？我新写的消息没有同步上？\n",
        },
      })}\n`,
    );

    await watcher.pollOnce();

    fs.appendFileSync(
      filePath,
      `${JSON.stringify({
        timestamp: "2026-04-02T08:02:11.745Z",
        type: "event_msg",
        payload: {
          type: "context_compacted",
        },
      })}\n`,
    );

    await watcher.pollOnce();

    expect(onEvent).toHaveBeenCalledTimes(3);
    expect(onEvent.mock.calls[1]?.[0]).toMatchObject({
      status: "running",
      task: "好像还不对，现在的消息还是之前的？我新写的消息没有同步上？",
    });
    expect(onEvent.mock.calls[2]?.[0]).toMatchObject({
      status: "idle",
      task: "Context compacted",
    });
  });
});
