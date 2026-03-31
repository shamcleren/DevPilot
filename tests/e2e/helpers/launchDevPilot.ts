import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import type { ElectronApplication } from "playwright";
import { _electron as electron } from "@playwright/test";

const repoRoot = process.cwd();

export type LaunchDevPilotOptions = {
  actionResponseSocketPath: string;
};

export type LaunchedDevPilot = {
  app: ElectronApplication;
  ipcSocketPath: string;
  close: () => Promise<void>;
};

async function waitForSocketPath(socketPath: string): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    try {
      await fs.access(socketPath);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
  throw new Error(`Timed out waiting for DevPilot IPC socket: ${socketPath}`);
}

/**
 * Do not set `executablePath`: Playwright must inject its `-r` loader so CDP attaches correctly;
 * otherwise the renderer preload may not run and `window.devpilot` stays undefined.
 */
export async function launchDevPilot(
  options: LaunchDevPilotOptions,
): Promise<LaunchedDevPilot> {
  const mainJs = path.join(repoRoot, "out/main/main.js");
  const env: NodeJS.ProcessEnv = { ...process.env };
  const socketDir = await fs.mkdtemp(path.join(os.tmpdir(), "devpilot-ipc-"));
  const ipcSocketPath = path.join(socketDir, "hub.sock");
  delete env.ELECTRON_RENDERER_URL;
  delete env.DEVPILOT_SOCKET_PATH;
  delete env.DEVPILOT_IPC_PORT;
  delete env.DEVPILOT_ACTION_RESPONSE_HOST;
  delete env.DEVPILOT_ACTION_RESPONSE_PORT;

  const app = await electron.launch({
    args: [mainJs],
    cwd: repoRoot,
    env: {
      ...env,
      DEVPILOT_SOCKET_PATH: ipcSocketPath,
      DEVPILOT_ACTION_RESPONSE_MODE: "socket",
      DEVPILOT_ACTION_RESPONSE_SOCKET_PATH: options.actionResponseSocketPath,
    },
  });

  await waitForSocketPath(ipcSocketPath);

  return {
    app,
    ipcSocketPath,
    close: async () => {
      await app.close().catch(() => undefined);
      await fs.rm(socketDir, { recursive: true, force: true });
    },
  };
}
