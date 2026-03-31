import { spawn } from "node:child_process";
import path from "node:path";

const repoRoot = process.cwd();

export async function sendStatusChange(
  payload: Record<string, unknown>,
  ipcSocketPath: string,
): Promise<void> {
  const body = JSON.stringify(payload);
  const script = path.join(repoRoot, "scripts/bridge/send-event.mjs");
  const exitCode: number = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, body], {
      cwd: repoRoot,
      env: { ...process.env, DEVPILOT_SOCKET_PATH: ipcSocketPath },
      stdio: "pipe",
    });
    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? 1));
  });
  if (exitCode !== 0) {
    throw new Error(`send-event.mjs exited with code ${exitCode}`);
  }
}
