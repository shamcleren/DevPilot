import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";

export type StartBlockingHookOptions = {
  /** Repository root (CodePal project root). */
  repoRoot: string;
  /** CodePal IPC unix socket path (`CODEPAL_SOCKET_PATH`). */
  ipcSocketPath: string;
  /** JSON object fed to hook stdin (same shape as `sendStatusChange` payloads). */
  payload: Record<string, unknown>;
  /** Extra env vars (e.g. `CODEPAL_HOOK_RESPONSE_WAIT_MS`). */
  env?: NodeJS.ProcessEnv;
};

export type BlockingHookHandle = {
  /** First complete line written to stdout (typically one `action_response` JSON line). */
  waitForFirstStdoutLine: () => Promise<string>;
  /** Process exit code once the hook exits. */
  waitForExitCode: () => Promise<number>;
  kill: (signal?: NodeJS.Signals) => void;
};

function collectFirstStdoutLine(child: ChildProcess): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdout = child.stdout;
    if (!stdout) {
      reject(new Error("runHookProcess: child has no stdout"));
      return;
    }

    let buf = "";
    const onData = (chunk: string | Buffer) => {
      buf += String(chunk);
      const nl = buf.indexOf("\n");
      if (nl >= 0) {
        stdout.off("data", onData);
        stdout.off("error", onErr);
        child.off("error", onErr);
        resolve(buf.slice(0, nl));
      }
    };
    const onErr = (err: Error) => {
      stdout.off("data", onData);
      stdout.off("error", onErr);
      child.off("error", onErr);
      reject(err);
    };

    stdout.setEncoding("utf8");
    stdout.on("data", onData);
    stdout.on("error", onErr);
    child.on("error", onErr);
  });
}

/**
 * Runs the real Cursor hook wrapper (`scripts/hooks/cursor-hook.sh`): reads JSON from stdin,
 * forwards through `run-blocking-hook.mjs`, blocks until CodePal delivers `action_response`
 * to the per-event collector socket, then prints one line to stdout and exits.
 */
export function startBlockingCursorHook(
  options: StartBlockingHookOptions,
): BlockingHookHandle {
  const scriptPath = path.join(options.repoRoot, "scripts/hooks/cursor-hook.sh");
  const child = spawn("bash", [scriptPath], {
    cwd: options.repoRoot,
    env: {
      ...process.env,
      ...options.env,
      CODEPAL_SOCKET_PATH: options.ipcSocketPath,
    },
    stdio: ["pipe", "pipe", "pipe"],
  });

  const firstLinePromise = collectFirstStdoutLine(child);
  const exitPromise = new Promise<number>((resolve) => {
    child.on("close", (code) => resolve(code ?? 1));
  });

  child.stdin.write(JSON.stringify(options.payload));
  child.stdin.end();

  return {
    waitForFirstStdoutLine: () => firstLinePromise,
    waitForExitCode: () => exitPromise,
    kill: (signal: NodeJS.Signals = "SIGTERM") => {
      child.kill(signal);
    },
  };
}
