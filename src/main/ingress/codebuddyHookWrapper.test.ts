import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CODEBUDDY_FIXTURES } from "../../../tests/fixtures/codebuddy";

const hookScriptPath = fileURLToPath(
  new URL("../../../scripts/hooks/codebuddy-hook.sh", import.meta.url),
);
const repoRootPath = fileURLToPath(new URL("../../../", import.meta.url));

function runHook(payload: Record<string, unknown>) {
  const tempDir = mkdtempSync(join(tmpdir(), "devpilot-codebuddy-hook-"));
  const fakeNodePath = join(tempDir, "node");

  writeFileSync(
    fakeNodePath,
    "#!/usr/bin/env bash\nprintf '%s' \"$2\"\n",
    "utf8",
  );
  chmodSync(fakeNodePath, 0o755);

  try {
    const result = spawnSync("bash", [hookScriptPath], {
      cwd: repoRootPath,
      input: JSON.stringify(payload),
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${tempDir}:${process.env.PATH ?? ""}`,
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

describe("codebuddy-hook.sh wrapper", () => {
  it("injects tool=codebuddy without overriding official source", () => {
    const fixture = CODEBUDDY_FIXTURES.find(
      (item) => item.id === "hook-session-start-source-startup",
    );
    expect(fixture).toBeDefined();

    const result = runHook(fixture!.payload);

    expect(result.status).toBe(0);
    expect(result.forwardedPayload).toMatchObject({
      tool: "codebuddy",
      source: "startup",
      session_id: "cb-session-101",
      hook_event_name: "SessionStart",
    });
  });

  it("backfills source=codebuddy when official payload omits source", () => {
    const fixture = CODEBUDDY_FIXTURES.find(
      (item) => item.id === "hook-notification-permission-prompt",
    );
    expect(fixture).toBeDefined();

    const result = runHook(fixture!.payload);

    expect(result.status).toBe(0);
    expect(result.forwardedPayload).toMatchObject({
      tool: "codebuddy",
      source: "codebuddy",
      session_id: "cb-session-102",
      hook_event_name: "Notification",
    });
  });
});
