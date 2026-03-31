import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const hookScriptPath = fileURLToPath(
  new URL("../../../scripts/hooks/cursor-agent-hook.sh", import.meta.url),
);
const repoRootPath = fileURLToPath(new URL("../../../", import.meta.url));

function runHook(eventName: string, payload: Record<string, unknown>) {
  const tempDir = mkdtempSync(join(tmpdir(), "devpilot-cursor-hook-"));
  const fakeNodePath = join(tempDir, "node");

  writeFileSync(
    fakeNodePath,
    "#!/usr/bin/env bash\nprintf '%s' \"$2\"\n",
    "utf8",
  );
  chmodSync(fakeNodePath, 0o755);

  try {
    const result = spawnSync("bash", [hookScriptPath, eventName], {
      cwd: repoRootPath,
      input: JSON.stringify(payload),
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${tempDir}:${process.env.PATH ?? ""}`,
        CURSOR_PROJECT_DIR: "/workspace/demo",
      },
    });

    return {
      ...result,
      forwardedPayload:
        result.status === 0 && result.stdout.trim()
          ? (JSON.parse(result.stdout) as Record<string, unknown>)
          : null,
    };
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

describe("cursor-agent-hook.sh wrapper", () => {
  it("maps sessionStart into a running StatusChange payload", () => {
    const result = runHook("sessionStart", {
      session_id: "cursor-session-1",
      composer_mode: "agent",
    });

    expect(result.status).toBe(0);
    expect(result.forwardedPayload).toMatchObject({
      hook_event_name: "StatusChange",
      session_id: "cursor-session-1",
      status: "running",
      task: "agent",
      cwd: "/workspace/demo",
    });
  });

  it("maps stop into a terminal StatusChange payload", () => {
    const result = runHook("stop", {
      session_id: "cursor-session-2",
      status: "completed",
    });

    expect(result.status).toBe(0);
    expect(result.forwardedPayload).toMatchObject({
      hook_event_name: "StatusChange",
      session_id: "cursor-session-2",
      status: "completed",
      task: "completed",
    });
  });

  it("maps stop error into an error StatusChange payload", () => {
    const result = runHook("stop", {
      session_id: "cursor-session-3",
      status: "error",
    });

    expect(result.status).toBe(0);
    expect(result.forwardedPayload).toMatchObject({
      hook_event_name: "StatusChange",
      session_id: "cursor-session-3",
      status: "error",
      task: "error",
    });
  });

  it("fails fast when session_id is missing", () => {
    const result = runHook("sessionStart", {
      composer_mode: "agent",
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("session_id is required");
  });
});
