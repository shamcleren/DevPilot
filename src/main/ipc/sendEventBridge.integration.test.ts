import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { createIpcHub } from "./ipcHub";
import { buildActionResponseLine } from "../../../scripts/bridge/send-event.mjs";
import { stringifyActionResponsePayload } from "../../shared/actionResponsePayload";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

describe("buildActionResponseLine (send-event.mjs)", () => {
  it("matches main-process stringifyActionResponsePayload", () => {
    const sessionId = "s1";
    const actionId = "a1";
    const option = "OK";
    expect(buildActionResponseLine(sessionId, actionId, option)).toBe(
      stringifyActionResponsePayload(sessionId, actionId, option),
    );
  });
});

describe("send-event.mjs (TCP)", () => {
  it("writes one newline-terminated JSON line to the hub", async () => {
    const onMessage = vi.fn();
    const { server } = createIpcHub(onMessage);
    await new Promise<void>((resolve, reject) => {
      server.listen(0, "127.0.0.1", () => resolve());
      server.once("error", reject);
    });
    const addr = server.address();
    if (!addr || typeof addr === "string") {
      throw new Error("expected TCP address");
    }

    const payload = JSON.stringify({
      type: "status_change",
      sessionId: "s1",
      tool: "cursor",
      status: "running",
      task: "fix auth bug",
      timestamp: 1,
    });

    const exitCode: number = await new Promise((resolve, reject) => {
      const child = spawn("node", ["scripts/bridge/send-event.mjs", payload], {
        cwd: projectRoot,
        env: { ...process.env, DEVPILOT_IPC_PORT: String(addr.port) },
      });
      child.on("error", reject);
      child.on("close", (code) => resolve(code ?? 1));
    });

    expect(exitCode).toBe(0);
    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(onMessage).toHaveBeenCalledWith(payload);

    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
});

describe("send-event.mjs (unix socket)", () => {
  it.skipIf(process.platform === "win32")(
    "writes one line when DEVPILOT_SOCKET_PATH is set",
    async () => {
      const sock = join(os.tmpdir(), `devpilot-bridge-${Date.now()}.sock`);
      try {
        fs.unlinkSync(sock);
      } catch {
        /* ENOENT */
      }

      const onMessage = vi.fn();
      const { server } = createIpcHub(onMessage);
      await new Promise<void>((resolve, reject) => {
        server.listen(sock, () => resolve());
        server.once("error", reject);
      });

      const payload = JSON.stringify({
        type: "status_change",
        sessionId: "u1",
        tool: "cursor",
        status: "idle",
        timestamp: 2,
      });

      const exitCode: number = await new Promise((resolve, reject) => {
        const child = spawn("node", ["scripts/bridge/send-event.mjs", payload], {
          cwd: projectRoot,
          env: { ...process.env, DEVPILOT_SOCKET_PATH: sock },
        });
        child.on("error", reject);
        child.on("close", (code) => resolve(code ?? 1));
      });

      expect(exitCode).toBe(0);
      expect(onMessage).toHaveBeenCalledTimes(1);
      expect(onMessage).toHaveBeenCalledWith(payload);

      await new Promise<void>((resolve) => server.close(() => resolve()));
      try {
        fs.unlinkSync(sock);
      } catch {
        /* */
      }
    },
  );
});
