import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

const sendEventLine = vi.hoisted(() => vi.fn<[], Promise<void>>());
const runBlockingHookFromRaw = vi.hoisted(() => vi.fn<[], Promise<string | undefined>>());
const runCursorHookPipeline = vi.hoisted(() => vi.fn<[], Promise<string | undefined>>());

vi.mock("./sendEventBridge", () => ({
  sendEventLine,
}));

vi.mock("./blockingHookBridge", () => ({
  runBlockingHookFromRaw,
}));

vi.mock("./cursorHook", () => ({
  runCursorHookPipeline,
}));

import { HOOK_CLI_NOT_HOOK_MODE, runHookCli } from "./runHookCli";

function argvWithHook(...parts: string[]): string[] {
  return ["/fake/electron", "/fake/main.js", ...parts];
}

function stdinFromString(data: string): Readable {
  return Readable.from([data], { objectMode: false });
}

function createMockWritable(): { stream: NodeJS.WritableStream; text: () => string } {
  const chunks: string[] = [];
  return {
    stream: {
      write(
        chunk: string | Buffer,
        encodingOrCallback?: BufferEncoding | ((err?: Error) => void),
        callback?: (err?: Error) => void,
      ) {
        const encoding = typeof encodingOrCallback === "string" ? encodingOrCallback : undefined;
        const done = typeof encodingOrCallback === "function" ? encodingOrCallback : callback;
        const text = Buffer.isBuffer(chunk) ? chunk.toString(encoding ?? "utf8") : String(chunk);
        chunks.push(text);
        done?.();
        return true;
      },
    } as NodeJS.WritableStream,
    text: () => chunks.join(""),
  };
}

describe("runHookCli", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendEventLine.mockResolvedValue(undefined);
    runBlockingHookFromRaw.mockResolvedValue(undefined);
    runCursorHookPipeline.mockResolvedValue(undefined);
  });

  it("returns HOOK_CLI_NOT_HOOK_MODE when argv has no --codepal-hook", async () => {
    const stderr = createMockWritable();
    const stdout = createMockWritable();
    const code = await runHookCli(
      ["/electron", "/main"],
      stdinFromString("{}"),
      stdout.stream,
      stderr.stream,
      {},
    );
    expect(code).toBe(HOOK_CLI_NOT_HOOK_MODE);
    expect(sendEventLine).not.toHaveBeenCalled();
  });

  it("fails when --codepal-hook has no subcommand", async () => {
    const stderr = createMockWritable();
    const code = await runHookCli(
      argvWithHook("--codepal-hook"),
      stdinFromString("{}"),
      createMockWritable().stream,
      stderr.stream,
      {},
    );
    expect(code).toBe(1);
    expect(stderr.text()).toMatch(/codepal-hook/i);
  });

  it("fails on unknown hook subcommand", async () => {
    const stderr = createMockWritable();
    const code = await runHookCli(
      argvWithHook("--codepal-hook", "nope"),
      stdinFromString("{}"),
      createMockWritable().stream,
      stderr.stream,
      {},
    );
    expect(code).toBe(1);
  });

  it("fails when cursor-lifecycle has no phase", async () => {
    const stderr = createMockWritable();
    const code = await runHookCli(
      argvWithHook("--codepal-hook", "cursor-lifecycle"),
      stdinFromString("{}"),
      createMockWritable().stream,
      stderr.stream,
      {},
    );
    expect(code).toBe(1);
  });

  it("fails when cursor-lifecycle phase is invalid", async () => {
    const stderr = createMockWritable();
    const code = await runHookCli(
      argvWithHook("--codepal-hook", "cursor-lifecycle", "pause"),
      stdinFromString("{}"),
      createMockWritable().stream,
      stderr.stream,
      {},
    );
    expect(code).toBe(1);
  });

  it("cursor forwards raw payload into cursor hook pipeline", async () => {
    const stdout = createMockWritable();
    const code = await runHookCli(
      argvWithHook("--codepal-hook", "cursor"),
      stdinFromString(JSON.stringify({ session_id: "s1", hook_event_name: "SessionStart" })),
      stdout.stream,
      createMockWritable().stream,
      { CURSOR_PROJECT_DIR: "/proj" },
    );
    expect(code).toBe(0);
    expect(runCursorHookPipeline).toHaveBeenCalledWith(
      JSON.stringify({ session_id: "s1", hook_event_name: "SessionStart" }),
      { CURSOR_PROJECT_DIR: "/proj" },
    );
    expect(stdout.text()).toBe("");
  });

  it("cursor writes blocking response line to stdout when present", async () => {
    runCursorHookPipeline.mockResolvedValue('{"ok":true}');
    const stdout = createMockWritable();
    const code = await runHookCli(
      argvWithHook("--codepal-hook", "cursor"),
      stdinFromString(JSON.stringify({ session_id: "s1", hook_event_name: "Notification" })),
      stdout.stream,
      createMockWritable().stream,
      {},
    );
    expect(code).toBe(0);
    expect(stdout.text()).toBe('{"ok":true}\n');
  });

  it("cursor fails on empty stdin", async () => {
    const stderr = createMockWritable();
    const code = await runHookCli(
      argvWithHook("--codepal-hook", "cursor"),
      stdinFromString(" "),
      createMockWritable().stream,
      stderr.stream,
      {},
    );
    expect(code).toBe(1);
    expect(runCursorHookPipeline).not.toHaveBeenCalled();
  });

  it("cursor-lifecycle sessionStart sends StatusChange running via sendEventLine", async () => {
    const code = await runHookCli(
      argvWithHook("--codepal-hook", "cursor-lifecycle", "sessionStart"),
      stdinFromString(JSON.stringify({ session_id: "s1", composer_mode: "agent" })),
      createMockWritable().stream,
      createMockWritable().stream,
      { CURSOR_PROJECT_DIR: "/proj" },
    );
    expect(code).toBe(0);
    expect(sendEventLine).toHaveBeenCalledTimes(1);
    const line = sendEventLine.mock.calls[0][0] as string;
    expect(JSON.parse(line)).toMatchObject({
      hook_event_name: "StatusChange",
      session_id: "s1",
      status: "running",
      task: "agent",
      cwd: "/proj",
    });
  });

  it("cursor-lifecycle stop maps completed/error/offline like cursor-agent-hook", async () => {
    for (const [statusIn, statusOut, taskOut] of [
      ["completed", "completed", "completed"],
      ["error", "error", "error"],
      ["aborted", "offline", "aborted"],
    ] as const) {
      vi.clearAllMocks();
      sendEventLine.mockResolvedValue(undefined);
      const code = await runHookCli(
        argvWithHook("--codepal-hook", "cursor-lifecycle", "stop"),
        stdinFromString(JSON.stringify({ session_id: "sx", status: statusIn })),
        createMockWritable().stream,
        createMockWritable().stream,
        {},
      );
      expect(code).toBe(0);
      const line = sendEventLine.mock.calls[0][0] as string;
      expect(JSON.parse(line)).toMatchObject({
        session_id: "sx",
        status: statusOut,
        task: taskOut,
      });
    }
  });

  it("cursor-lifecycle fails when session_id is missing", async () => {
    const stderr = createMockWritable();
    const code = await runHookCli(
      argvWithHook("--codepal-hook", "cursor-lifecycle", "sessionStart"),
      stdinFromString(JSON.stringify({ composer_mode: "x" })),
      createMockWritable().stream,
      stderr.stream,
      {},
    );
    expect(code).toBe(1);
    expect(sendEventLine).not.toHaveBeenCalled();
  });

  it("codebuddy injects tool and backfills source then uses blocking bridge", async () => {
    const raw = JSON.stringify({
      session_id: "cb1",
      hook_event_name: "Notification",
    });
    const code = await runHookCli(
      argvWithHook("--codepal-hook", "codebuddy"),
      stdinFromString(raw),
      createMockWritable().stream,
      createMockWritable().stream,
      {},
    );
    expect(code).toBe(0);
    expect(runBlockingHookFromRaw).toHaveBeenCalledTimes(1);
    const forwarded = runBlockingHookFromRaw.mock.calls[0][0] as string;
    expect(JSON.parse(forwarded)).toMatchObject({
      tool: "codebuddy",
      source: "codebuddy",
      session_id: "cb1",
    });
  });

  it("codebuddy does not override existing source", async () => {
    const raw = JSON.stringify({
      session_id: "cb1",
      hook_event_name: "SessionStart",
      source: "startup",
    });
    await runHookCli(
      argvWithHook("--codepal-hook", "codebuddy"),
      stdinFromString(raw),
      createMockWritable().stream,
      createMockWritable().stream,
      {},
    );
    const forwarded = runBlockingHookFromRaw.mock.calls[0][0] as string;
    expect(JSON.parse(forwarded).source).toBe("startup");
    expect(JSON.parse(forwarded).tool).toBe("codebuddy");
  });

  it("codebuddy writes blocking response line to stdout when present", async () => {
    runBlockingHookFromRaw.mockResolvedValue('{"ok":true}');
    const stdout = createMockWritable();
    const code = await runHookCli(
      argvWithHook("--codepal-hook", "codebuddy"),
      stdinFromString(JSON.stringify({ session_id: "x", hook_event_name: "Stop" })),
      stdout.stream,
      createMockWritable().stream,
      {},
    );
    expect(code).toBe(0);
    expect(stdout.text()).toBe('{"ok":true}\n');
  });

  it("codebuddy fails on empty stdin", async () => {
    const stderr = createMockWritable();
    const code = await runHookCli(
      argvWithHook("--codepal-hook", "codebuddy"),
      stdinFromString("   "),
      createMockWritable().stream,
      stderr.stream,
      {},
    );
    expect(code).toBe(1);
  });

  it("send-event forwards one JSON line via sendEventLine", async () => {
    const payload = JSON.stringify({
      type: "status_change",
      sessionId: "s1",
      tool: "cursor",
      status: "running",
      timestamp: 1,
    });
    const code = await runHookCli(
      argvWithHook("--codepal-hook", "send-event"),
      stdinFromString(payload),
      createMockWritable().stream,
      createMockWritable().stream,
      {},
    );
    expect(code).toBe(0);
    expect(sendEventLine).toHaveBeenCalledWith(payload, {});
  });

  it("send-event fails on empty stdin", async () => {
    const stderr = createMockWritable();
    const code = await runHookCli(
      argvWithHook("--codepal-hook", "send-event"),
      stdinFromString("   "),
      createMockWritable().stream,
      stderr.stream,
      {},
    );
    expect(code).toBe(1);
    expect(sendEventLine).not.toHaveBeenCalled();
  });

  it("blocking-hook uses runBlockingHookFromRaw and writes a response line when present", async () => {
    runBlockingHookFromRaw.mockResolvedValue('{"line":1}');
    const stdout = createMockWritable();
    const raw = JSON.stringify({
      type: "status_change",
      sessionId: "s",
      tool: "cursor",
      status: "waiting",
      timestamp: 1,
      pendingAction: {
        id: "a",
        type: "single_choice",
        title: "t",
        options: ["OK"],
      },
    });
    const code = await runHookCli(
      argvWithHook("--codepal-hook", "blocking-hook"),
      stdinFromString(raw),
      stdout.stream,
      createMockWritable().stream,
      {},
    );
    expect(code).toBe(0);
    expect(runBlockingHookFromRaw).toHaveBeenCalledWith(raw, {});
    expect(stdout.text()).toBe('{"line":1}\n');
  });

  it("blocking-hook fails on empty stdin", async () => {
    const stderr = createMockWritable();
    const code = await runHookCli(
      argvWithHook("--codepal-hook", "blocking-hook"),
      stdinFromString(""),
      createMockWritable().stream,
      stderr.stream,
      {},
    );
    expect(code).toBe(1);
    expect(runBlockingHookFromRaw).not.toHaveBeenCalled();
  });
});
