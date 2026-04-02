# Self-Contained Hook Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the old shell-script and external-runtime hook path with a self-contained `CodePal` executable hook mode that works the same way in development and packaged builds.

**Architecture:** Keep the existing IPC hub, ingress normalization, session store, and action-response routing as the source of truth. Add a headless hook-CLI layer inside the Electron main-process bundle, centralize executable command generation in one place, migrate integration diagnostics/config writing to that new command source, then remove the retired `scripts/hooks/*.sh` and `scripts/bridge/*.mjs` product path.

**Tech Stack:** Electron, TypeScript, Vitest, existing CodePal IPC/session model

---

## File Map

**Create:**

- `src/main/hook/commandBuilder.ts`
  - Build the exact hook command for `cursor-lifecycle` and `codebuddy` in dev and packaged environments.
- `src/main/hook/commandBuilder.test.ts`
  - Lock command generation and legacy-path detection behavior.
- `src/main/hook/sendEventBridge.ts`
  - Internal TypeScript replacement for `scripts/bridge/send-event.mjs`.
- `src/main/hook/blockingHookBridge.ts`
  - Internal TypeScript replacement for `scripts/bridge/run-blocking-hook.mjs`.
- `src/main/hook/cursorLifecycleHook.ts`
  - Parse Cursor lifecycle stdin JSON and emit unified upstream events.
- `src/main/hook/codeBuddyHook.ts`
  - Parse CodeBuddy stdin JSON, inject stable routing markers, and optionally block on pending actions.
- `src/main/hook/runHookCli.ts`
  - Parse `--codepal-hook ...` argv and dispatch to concrete handlers.
- `src/main/hook/runHookCli.test.ts`
  - Validate headless hook CLI dispatch, invalid argv rejection, and stdout behavior.
- `src/main/hook/sendEventBridge.integration.test.ts`
  - Replace the old script bridge integration test with the internal bridge module.
- `tests/e2e/helpers/startHookCliProcess.ts`
  - Replace `runHookProcess.ts` with an executable-path helper used by the new E2E path.

**Modify:**

- `src/main/main.ts`
  - Add early hook-mode detection before normal GUI bootstrap.
- `src/main/integrations/integrationService.ts`
  - Stop using `hookScriptsRoot` as the formal command source, detect legacy path state, and write executable-based commands.
- `src/main/integrations/integrationService.test.ts`
  - Cover migration from legacy commands to executable commands and remove runtime dependency assumptions.
- `src/shared/integrationTypes.ts`
  - Extend diagnostics to represent `legacy_path` migration state and remove node/python blocker semantics.
- `src/renderer/components/IntegrationPanel.tsx`
  - Replace runtime dependency badges with migration/health messaging around executable-based hooks.
- `src/renderer/components/IntegrationPanel.test.tsx`
  - Lock the new migration and health copy.
- `src/renderer/App.tsx`
  - Consume the updated settings diagnostics without runtime dependency chips.
- `src/renderer/styles.css`
  - Add/adjust styles for `迁移` state and any removed runtime badges.
- `src/main/ipc/sendEventBridge.integration.test.ts`
  - Repoint tests away from `scripts/bridge/send-event.mjs`.
- `tests/e2e/codepal-action-response.e2e.ts`
  - Switch the blocking-hook E2E path from shell scripts to the executable hook mode.
- `README.md`
  - Document executable-based hook config and remove external runtime requirement claims.
- `docs/context/current-status.md`
  - Update current-state wording to the new self-contained hook bridge.
- `electron-builder.yml`
  - Remove packaged hook/bridge script resources once the executable path replaces them.

**Delete:**

- `scripts/bridge/send-event.mjs`
- `scripts/bridge/run-blocking-hook.mjs`
- `scripts/hooks/cursor-hook.sh`
- `scripts/hooks/cursor-agent-hook.sh`
- `scripts/hooks/codebuddy-hook.sh`
- `tests/e2e/helpers/runHookProcess.ts`

---

### Task 1: Centralize executable hook command generation and legacy-path detection

**Files:**
- Create: `src/main/hook/commandBuilder.ts`
- Test: `src/main/hook/commandBuilder.test.ts`
- Modify: `src/shared/integrationTypes.ts`
- Modify: `src/main/integrations/integrationService.ts`
- Test: `src/main/integrations/integrationService.test.ts`

- [ ] **Step 1: Write the failing command-builder tests**

```ts
import { describe, expect, it } from "vitest";
import {
  buildCodeBuddyHookCommand,
  buildCursorLifecycleHookCommand,
  detectLegacyHookCommand,
} from "./commandBuilder";

describe("commandBuilder", () => {
  it("builds packaged hook commands from the app executable path", () => {
    expect(
      buildCodeBuddyHookCommand({
        packaged: true,
        execPath: "/Applications/CodePal.app/Contents/MacOS/CodePal",
        appPath: "/Applications/CodePal.app/Contents/Resources/app.asar",
      }),
    ).toBe(
      "\"/Applications/CodePal.app/Contents/MacOS/CodePal\" --codepal-hook codebuddy",
    );
  });

  it("builds dev hook commands from Electron plus the app path", () => {
    expect(
      buildCursorLifecycleHookCommand("sessionStart", {
        packaged: false,
        execPath: "/Users/me/CodePal/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron",
        appPath: "/Users/me/CodePal",
      }),
    ).toBe(
      "\"/Users/me/CodePal/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron\" \"/Users/me/CodePal\" --codepal-hook cursor-lifecycle sessionStart",
    );
  });

  it("detects retired script and node bridge commands as legacy", () => {
    expect(detectLegacyHookCommand("\"/tmp/codebuddy-hook.sh\"")).toBe(true);
    expect(detectLegacyHookCommand("node ./scripts/bridge/send-event.mjs")).toBe(true);
    expect(
      detectLegacyHookCommand("\"/Applications/CodePal.app/Contents/MacOS/CodePal\" --codepal-hook codebuddy"),
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `npm test -- src/main/hook/commandBuilder.test.ts src/main/integrations/integrationService.test.ts`

Expected: FAIL because `commandBuilder.ts` does not exist, integration diagnostics still depend on hook script paths, and there is no legacy-state detection.

- [ ] **Step 3: Implement the command builder and new migration state types**

```ts
// src/main/hook/commandBuilder.ts
type HookCommandContext = {
  packaged: boolean;
  execPath: string;
  appPath: string;
};

function quote(arg: string): string {
  return `"${arg.replaceAll("\"", "\\\"")}"`;
}

function executablePrefix(context: HookCommandContext): string {
  return context.packaged
    ? quote(context.execPath)
    : `${quote(context.execPath)} ${quote(context.appPath)}`;
}

export function buildCodeBuddyHookCommand(context: HookCommandContext): string {
  return `${executablePrefix(context)} --codepal-hook codebuddy`;
}

export function buildCursorLifecycleHookCommand(
  eventName: "sessionStart" | "stop",
  context: HookCommandContext,
): string {
  return `${executablePrefix(context)} --codepal-hook cursor-lifecycle ${eventName}`;
}

export function detectLegacyHookCommand(command: string): boolean {
  return (
    command.includes("scripts/hooks/") ||
    command.includes("scripts/bridge/send-event.mjs") ||
    command.includes("scripts/bridge/run-blocking-hook.mjs") ||
    command.includes("cursor-hook.sh") ||
    command.includes("cursor-agent-hook.sh") ||
    command.includes("codebuddy-hook.sh")
  );
}
```

```ts
// src/shared/integrationTypes.ts
export type IntegrationHealth =
  | "active"
  | "repair_needed"
  | "not_configured"
  | "legacy_path";
```

- [ ] **Step 4: Rework integration diagnostics to use commandBuilder**

```ts
const commandContext = {
  packaged: options.packaged,
  execPath: options.execPath,
  appPath: options.appPath,
};

const requiredCommands = {
  sessionStart: buildCursorLifecycleHookCommand("sessionStart", commandContext),
  stop: buildCursorLifecycleHookCommand("stop", commandContext),
};
```

```ts
if (matchedLegacyCommand) {
  return {
    health: "legacy_path",
    healthLabel: "待迁移",
    actionLabel: "迁移",
    statusMessage: `${label} 仍在使用旧 hook 链路，需要迁移到 CodePal 可执行命令`,
  };
}
```

- [ ] **Step 5: Run the focused tests again**

Run: `npm test -- src/main/hook/commandBuilder.test.ts src/main/integrations/integrationService.test.ts`

Expected: PASS, with diagnostics reporting `legacy_path` instead of “缺少运行时”.

- [ ] **Step 6: Commit the command-generation foundation**

```bash
git add src/main/hook/commandBuilder.ts src/main/hook/commandBuilder.test.ts src/shared/integrationTypes.ts src/main/integrations/integrationService.ts src/main/integrations/integrationService.test.ts
git commit -m "refactor: centralize executable hook commands"
```

### Task 2: Replace script bridges with internal TypeScript bridge modules

**Files:**
- Create: `src/main/hook/sendEventBridge.ts`
- Create: `src/main/hook/blockingHookBridge.ts`
- Test: `src/main/hook/sendEventBridge.integration.test.ts`
- Modify: `src/main/actionResponse/createActionResponseTransport.ts`

- [ ] **Step 1: Write the failing bridge tests**

```ts
import { describe, expect, it, vi } from "vitest";
import { createIpcHub } from "../ipc/ipcHub";
import { buildActionResponseLine, sendEventLine } from "./sendEventBridge";

describe("sendEventBridge", () => {
  it("matches stringifyActionResponsePayload", () => {
    expect(buildActionResponseLine("s1", "a1", "OK")).toBe(
      "{\"type\":\"action_response\",\"sessionId\":\"s1\",\"actionId\":\"a1\",\"response\":{\"kind\":\"option\",\"value\":\"OK\"}}",
    );
  });

  it("writes one line to the TCP hub", async () => {
    const onMessage = vi.fn();
    const { server } = createIpcHub(onMessage);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const addr = server.address();
    if (!addr || typeof addr === "string") throw new Error("expected TCP address");

    await sendEventLine("{\"type\":\"status_change\",\"sessionId\":\"s1\",\"tool\":\"cursor\",\"status\":\"running\",\"timestamp\":1}", {
      CODEPAL_IPC_PORT: String(addr.port),
    });

    expect(onMessage).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `npm test -- src/main/hook/sendEventBridge.integration.test.ts`

Expected: FAIL because the internal bridge module does not exist and tests still point at `scripts/bridge/send-event.mjs`.

- [ ] **Step 3: Implement the internal send-event bridge**

```ts
// src/main/hook/sendEventBridge.ts
import net from "node:net";

export function buildActionResponseLine(sessionId: string, actionId: string, option: string): string {
  return JSON.stringify({
    type: "action_response",
    sessionId,
    actionId,
    response: { kind: "option", value: option },
  });
}

export async function sendEventLine(body: string, env: NodeJS.ProcessEnv): Promise<void> {
  const trimmed = body.trim();
  if (!trimmed) throw new Error("sendEventLine: empty body");

  await new Promise<void>((resolve, reject) => {
    const client =
      env.CODEPAL_SOCKET_PATH && env.CODEPAL_SOCKET_PATH.trim()
        ? net.createConnection(env.CODEPAL_SOCKET_PATH.trim())
        : net.createConnection({
            host: env.CODEPAL_IPC_HOST ?? "127.0.0.1",
            port: Number(env.CODEPAL_IPC_PORT ?? "17371"),
          });

    client.once("connect", () => {
      client.write(`${trimmed}\n`, (error) => {
        if (error) {
          client.destroy();
          reject(error);
          return;
        }
        client.end(() => resolve());
      });
    });
    client.once("error", reject);
  });
}
```

- [ ] **Step 4: Implement the internal blocking bridge**

```ts
// src/main/hook/blockingHookBridge.ts
import net from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { sendEventLine } from "./sendEventBridge";

export async function sendBlockingHookPayload(raw: string, env: NodeJS.ProcessEnv): Promise<string | null> {
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  if (!parsed.pendingAction || typeof parsed.pendingAction !== "object") {
    await sendEventLine(raw, env);
    return null;
  }

  const socketDir = await mkdtemp(path.join(os.tmpdir(), "codepal-hook-response-"));
  const socketPath = path.join(socketDir, "collector.sock");
  const server = net.createServer();

  try {
    const linePromise = new Promise<string>((resolve, reject) => {
      server.listen(socketPath, () => undefined);
      server.once("connection", (socket) => {
        let buffer = "";
        socket.setEncoding("utf8");
        socket.on("data", (chunk) => {
          buffer += chunk;
          const newlineIndex = buffer.indexOf("\n");
          if (newlineIndex >= 0) {
            resolve(buffer.slice(0, newlineIndex));
            socket.destroy();
          }
        });
        socket.once("error", reject);
      });
      server.once("error", reject);
    });

    await sendEventLine(
      JSON.stringify({
        ...parsed,
        responseTarget: { mode: "socket", socketPath, timeoutMs: 10_000 },
      }),
      env,
    );

    return await linePromise;
  } finally {
    server.close();
    await rm(socketDir, { recursive: true, force: true });
  }
}
```

- [ ] **Step 5: Point bridge tests at the new modules and run them**

Run: `npm test -- src/main/hook/sendEventBridge.integration.test.ts src/main/actionResponse/createActionResponseTransport.test.ts`

Expected: PASS, proving the internal bridge and the existing action-response socket transport still agree on line format and timeout behavior.

- [ ] **Step 6: Commit the new bridge core**

```bash
git add src/main/hook/sendEventBridge.ts src/main/hook/blockingHookBridge.ts src/main/hook/sendEventBridge.integration.test.ts src/main/actionResponse/createActionResponseTransport.ts
git commit -m "refactor: move hook bridge into main bundle"
```

### Task 3: Add headless `--codepal-hook` execution to the CodePal executable

**Files:**
- Create: `src/main/hook/cursorLifecycleHook.ts`
- Create: `src/main/hook/codeBuddyHook.ts`
- Create: `src/main/hook/runHookCli.ts`
- Test: `src/main/hook/runHookCli.test.ts`
- Modify: `src/main/main.ts`

- [ ] **Step 1: Write the failing hook-CLI tests**

```ts
import { describe, expect, it, vi } from "vitest";
import { runHookCli } from "./runHookCli";

describe("runHookCli", () => {
  it("rejects invalid hook arguments", async () => {
    const stderr = vi.fn();
    const exitCode = await runHookCli(["--codepal-hook", "unknown"], {
      stdin: "",
      stdout: vi.fn(),
      stderr,
      env: {},
    });

    expect(exitCode).toBe(1);
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining("unsupported hook mode"));
  });

  it("maps cursor-lifecycle sessionStart to a status_change event", async () => {
    const sendEvent = vi.fn();
    const exitCode = await runHookCli(
      ["--codepal-hook", "cursor-lifecycle", "sessionStart"],
      {
        stdin: "{\"session_id\":\"cursor-1\",\"composer_mode\":\"ask\"}",
        stdout: vi.fn(),
        stderr: vi.fn(),
        env: {},
      },
      { sendEventLine: sendEvent },
    );

    expect(exitCode).toBe(0);
    expect(sendEvent).toHaveBeenCalledWith(
      "{\"hook_event_name\":\"StatusChange\",\"session_id\":\"cursor-1\",\"status\":\"running\",\"task\":\"ask\"}",
      {},
    );
  });
});
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `npm test -- src/main/hook/runHookCli.test.ts`

Expected: FAIL because `runHookCli.ts` and the new hook handlers do not exist.

- [ ] **Step 3: Implement the hook handlers**

```ts
// src/main/hook/cursorLifecycleHook.ts
export function buildCursorLifecyclePayload(
  eventName: "sessionStart" | "stop",
  raw: string,
): string {
  const input = JSON.parse(raw) as Record<string, unknown>;
  const sessionId = String(input.session_id ?? "").trim();
  if (!sessionId) {
    throw new Error("cursor-lifecycle: session_id is required");
  }

  if (eventName === "sessionStart") {
    return JSON.stringify({
      hook_event_name: "StatusChange",
      session_id: sessionId,
      status: "running",
      ...(typeof input.composer_mode === "string" ? { task: input.composer_mode } : {}),
    });
  }

  const stopStatus = typeof input.status === "string" ? input.status : "";
  return JSON.stringify({
    hook_event_name: "StatusChange",
    session_id: sessionId,
    status: stopStatus === "completed" ? "completed" : stopStatus === "error" ? "error" : "offline",
    ...(stopStatus ? { task: stopStatus } : {}),
  });
}
```

```ts
// src/main/hook/codeBuddyHook.ts
import { sendBlockingHookPayload } from "./blockingHookBridge";

export async function runCodeBuddyHook(raw: string, env: NodeJS.ProcessEnv): Promise<string | null> {
  const payload = JSON.parse(raw) as Record<string, unknown>;
  if (!("tool" in payload)) payload.tool = "codebuddy";
  if (!("source" in payload)) payload.source = "codebuddy";
  return sendBlockingHookPayload(JSON.stringify(payload), env);
}
```

- [ ] **Step 4: Implement hook-CLI dispatch and wire `main.ts`**

```ts
// src/main/hook/runHookCli.ts
export async function runHookCli(
  argv: string[],
  io: { stdin: string; stdout: (text: string) => void; stderr: (text: string) => void; env: NodeJS.ProcessEnv },
  deps = { sendEventLine, runCodeBuddyHook },
): Promise<number> {
  const [flag, mode, eventName] = argv;
  if (flag !== "--codepal-hook") {
    return -1;
  }

  try {
    if (mode === "codebuddy") {
      const line = await deps.runCodeBuddyHook(io.stdin, io.env);
      if (line) io.stdout(`${line}\n`);
      return 0;
    }
    if (mode === "cursor-lifecycle" && (eventName === "sessionStart" || eventName === "stop")) {
      await deps.sendEventLine(buildCursorLifecyclePayload(eventName, io.stdin), io.env);
      return 0;
    }

    io.stderr(`unsupported hook mode: ${mode ?? "<missing>"}\n`);
    return 1;
  } catch (error) {
    io.stderr(`${(error as Error).message}\n`);
    return 1;
  }
}
```

```ts
// src/main/main.ts
import { runHookCli } from "./hook/runHookCli";

async function maybeRunHookCli(): Promise<boolean> {
  const stdin = await readProcessStdin();
  const exitCode = await runHookCli(process.argv.slice(2), {
    stdin,
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
    env: process.env,
  });

  if (exitCode < 0) {
    return false;
  }

  process.exit(exitCode);
}
```

- [ ] **Step 5: Run the focused tests again**

Run: `npm test -- src/main/hook/runHookCli.test.ts src/main/window/createSettingsWindow.test.ts src/renderer/App.test.tsx`

Expected: PASS, with no GUI windows involved in hook mode and no regression in normal app startup tests.

- [ ] **Step 6: Commit the executable hook mode**

```bash
git add src/main/hook/cursorLifecycleHook.ts src/main/hook/codeBuddyHook.ts src/main/hook/runHookCli.ts src/main/hook/runHookCli.test.ts src/main/main.ts
git commit -m "feat: add executable hook subcommands"
```

### Task 4: Migrate integration settings and UI to the executable hook path

**Files:**
- Modify: `src/main/integrations/integrationService.ts`
- Modify: `src/main/integrations/integrationService.test.ts`
- Modify: `src/renderer/components/IntegrationPanel.tsx`
- Modify: `src/renderer/components/IntegrationPanel.test.tsx`
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/styles.css`

- [ ] **Step 1: Write the failing migration-state tests**

```ts
it("reports legacy_path when cursor config still points at the retired shell script", () => {
  writeFileSync(
    join(homeDir, ".cursor", "hooks.json"),
    JSON.stringify({
      version: 1,
      hooks: {
        sessionStart: [{ command: "\"/tmp/cursor-agent-hook.sh\" sessionStart" }],
        stop: [{ command: "\"/tmp/cursor-agent-hook.sh\" stop" }],
      },
    }),
  );

  const cursor = service.getDiagnostics().agents.find((agent) => agent.id === "cursor");
  expect(cursor).toMatchObject({
    health: "legacy_path",
    healthLabel: "待迁移",
    actionLabel: "迁移",
  });
});
```

```tsx
expect(html).toContain("待迁移");
expect(html).toContain(">迁移<");
expect(html).not.toContain("node 可用");
expect(html).not.toContain("python3 缺失");
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `npm test -- src/main/integrations/integrationService.test.ts src/renderer/components/IntegrationPanel.test.tsx`

Expected: FAIL because diagnostics still depend on runtime dependency badges and cannot detect the legacy executable path.

- [ ] **Step 3: Implement executable-path installs and migration messaging**

```ts
const requiredCommands = {
  sessionStart: buildCursorLifecycleHookCommand("sessionStart", commandContext),
  stop: buildCursorLifecycleHookCommand("stop", commandContext),
};

if (matchedLegacyCommand) {
  return {
    health: "legacy_path",
    healthLabel: "待迁移",
    actionLabel: "迁移",
    statusMessage: "仍在使用旧脚本链路，建议改写为 CodePal 可执行命令",
  };
}
```

```tsx
<div className="integration-section__summary">
  这里管理 CodePal 自身的 hook 命令与迁移状态，不再依赖外部 node/python 运行时。
</div>
```

- [ ] **Step 4: Remove runtime dependency chips from the settings view**

```tsx
{runtime ? (
  <div className="integration-panel__runtime">
    <span>{runtime.packaged ? "测试包模式" : "开发模式"}</span>
    <span>{runtime.executableLabel}</span>
  </div>
) : null}
```

```ts
// src/shared/integrationTypes.ts
export interface IntegrationRuntimeDiagnostics {
  packaged: boolean;
  executablePath: string;
  executableLabel: string;
}
```

- [ ] **Step 5: Run the focused tests again**

Run: `npm test -- src/main/integrations/integrationService.test.ts src/renderer/components/IntegrationPanel.test.tsx src/renderer/App.test.tsx`

Expected: PASS, with settings focused on `启用 / 迁移 / 修复` instead of `node/python3`.

- [ ] **Step 6: Commit the integration migration layer**

```bash
git add src/main/integrations/integrationService.ts src/main/integrations/integrationService.test.ts src/shared/integrationTypes.ts src/renderer/components/IntegrationPanel.tsx src/renderer/components/IntegrationPanel.test.tsx src/renderer/App.tsx src/renderer/styles.css
git commit -m "feat: migrate settings to executable hook path"
```

### Task 5: Switch E2E and packaging to the new path, then remove retired scripts

**Files:**
- Create: `tests/e2e/helpers/startHookCliProcess.ts`
- Modify: `tests/e2e/codepal-action-response.e2e.ts`
- Modify: `src/main/ipc/sendEventBridge.integration.test.ts`
- Modify: `electron-builder.yml`
- Modify: `README.md`
- Modify: `docs/context/current-status.md`
- Delete: `scripts/bridge/send-event.mjs`
- Delete: `scripts/bridge/run-blocking-hook.mjs`
- Delete: `scripts/hooks/cursor-hook.sh`
- Delete: `scripts/hooks/cursor-agent-hook.sh`
- Delete: `scripts/hooks/codebuddy-hook.sh`
- Delete: `tests/e2e/helpers/runHookProcess.ts`

- [ ] **Step 1: Write the failing E2E helper test or conversion diff**

```ts
const child = spawn(hookExecutable.command, hookExecutable.args, {
  cwd: repoRoot,
  env: {
    ...process.env,
    CODEPAL_SOCKET_PATH: ipcSocketPath,
  },
  stdio: ["pipe", "pipe", "pipe"],
});
```

```ts
expect(startBlockingHook.mode).toBe("codepal-executable");
```

- [ ] **Step 2: Run the E2E-focused checks before changing implementation**

Run: `npm test -- src/main/ipc/sendEventBridge.integration.test.ts`

Expected: FAIL or require edits because tests still import and spawn `scripts/bridge/send-event.mjs`.

- [ ] **Step 3: Replace script-based test/helpers with executable-path helpers**

```ts
// tests/e2e/helpers/startHookCliProcess.ts
import { spawn, type ChildProcess } from "node:child_process";

export function startBlockingHookCli(options: StartBlockingHookOptions): BlockingHookHandle {
  const child = spawn(options.command, options.args, {
    cwd: options.cwd,
    env: options.env,
    stdio: ["pipe", "pipe", "pipe"],
  });

  child.stdin.write(JSON.stringify(options.payload));
  child.stdin.end();

  return {
    waitForFirstStdoutLine: () => collectFirstStdoutLine(child),
    waitForExitCode: () => new Promise((resolve) => child.on("close", (code) => resolve(code ?? 1))),
    kill: (signal = "SIGTERM") => child.kill(signal),
  };
}
```

- [ ] **Step 4: Remove retired scripts from packaging and docs**

```yaml
# electron-builder.yml
files:
  - out/**/*
  - package.json
afterPack: scripts/build/after-pack.mjs
```

```md
- Hook configuration now targets the CodePal executable directly.
- External `node` / `python3` are no longer required for normal product use.
```

- [ ] **Step 5: Delete the retired script path and run full verification**

Run: `npm test`
Expected: PASS

Run: `npm run test:e2e`
Expected: PASS

Run: `npm run lint`
Expected: PASS

Run: `npm run build`
Expected: PASS

Run: `npm run dist:mac`
Expected: PASS, with packaged verification no longer depending on `scripts/hooks/*.sh`.

- [ ] **Step 6: Commit the round-1 completion**

```bash
git add src/main/ipc/sendEventBridge.integration.test.ts tests/e2e/helpers/startHookCliProcess.ts tests/e2e/codepal-action-response.e2e.ts electron-builder.yml README.md docs/context/current-status.md
git add -u scripts/bridge scripts/hooks tests/e2e/helpers
git commit -m "feat: ship self-contained hook bridge"
```
