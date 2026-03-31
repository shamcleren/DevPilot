# Action Response Write-Back Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the external `action_response` write-back loop with correct per-request routing, including concurrent waits across different agents and the same session.

**Architecture:** Extend the current single-pending session model into a per-session pending-request collection keyed by `actionId`, keep response routing in the main process, and let each blocking hook invocation own its own short-lived socket collector. The renderer only receives `pendingActions[]`, while `responseTarget` metadata stays in the main-process runtime state.

**Tech Stack:** TypeScript, Electron, React, Vitest, Playwright, Node `net`, bash hook wrappers

---

## Guardrails

- Do not create git commits unless the user explicitly asks for them.
- Keep `text_input` out of scope.
- Keep `responseTarget` out of renderer-facing data.
- Preserve the existing `action_response` JSON shape from `src/shared/actionResponsePayload.ts`.

## File Map

### Core Shared / Main Process

- Modify: `src/shared/sessionTypes.ts`
  - Add `ResponseTarget`
  - Replace renderer-facing `pendingAction?: PendingAction` with `pendingActions?: PendingAction[]`
- Modify: `src/adapters/shared/eventEnvelope.ts`
  - Accept optional `responseTarget` on canonical `status_change`
- Modify: `src/main/ingress/hookIngress.ts`
  - Parse raw `responseTarget`
  - Preserve current `pendingAction` parsing semantics
- Modify: `src/main/session/sessionStore.ts`
  - Store pending runtime state by `actionId`
  - Expose renderer-facing `pendingActions[]`
  - Split “prepare response” and “complete response” to avoid clearing before send succeeds
- Modify: `src/main/actionResponse/actionResponseTransport.ts`
  - Add a factory-capable transport type for per-request socket targets
- Modify: `src/main/actionResponse/createActionResponseTransport.ts`
  - Reuse socket sender implementation for both env-configured fallback transport and per-request targets
- Modify: `src/main/actionResponse/dispatchActionResponse.ts`
  - Route by `(sessionId, actionId)`
  - Send first, clear second, broadcast after successful clear

### Renderer

- Modify: `src/renderer/monitorSession.ts`
  - Keep row model aligned with shared `SessionRecord`
- Modify: `src/renderer/sessionBootstrap.ts`
  - No logic change expected beyond type alignment
- Modify: `src/renderer/sessionRows.ts`
  - Preserve `pendingActions[]` when mapping
- Modify: `src/renderer/components/SessionRow.tsx`
  - Render multiple pending-action cards per session row
- Modify: `src/renderer/components/SessionList.tsx`
  - No behavioral change expected
- Modify: `src/main/preload/index.ts`
  - IPC method stays the same; verify shared type compilation still passes

### Hook / Bridge

- Create: `scripts/bridge/run-blocking-hook.mjs`
  - Shared Node helper to create collector, inject `responseTarget`, send payload, wait for one line, print stdout
- Modify: `scripts/hooks/cursor-hook.sh`
  - Keep JSON normalization, delegate pending handling to the shared helper
- Modify: `scripts/hooks/codebuddy-hook.sh`
  - Keep `source=codebuddy` injection, delegate pending handling to the shared helper

### Tests

- Modify: `src/main/ingress/hookIngress.test.ts`
- Modify: `src/main/session/sessionStore.test.ts`
- Modify: `src/main/actionResponse/dispatchActionResponse.test.ts`
- Modify: `src/main/actionResponse/createActionResponseTransport.test.ts`
- Modify: `src/renderer/components/SessionRow.test.tsx`
- Modify: `src/renderer/sessionBootstrap.test.ts`
- Create: `tests/e2e/helpers/runHookProcess.ts`
- Modify: `tests/e2e/devpilot-action-response.e2e.ts`

### Docs

- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `docs/context/current-status.md`

## Task 1: Shared Types and Ingress Parsing

**Files:**
- Modify: `src/shared/sessionTypes.ts`
- Modify: `src/adapters/shared/eventEnvelope.ts`
- Modify: `src/main/ingress/hookIngress.ts`
- Test: `src/main/ingress/hookIngress.test.ts`

- [ ] **Step 1: Write failing ingress tests for `responseTarget` parsing**

```ts
it("parses responseTarget on canonical status_change", () => {
  const ev = lineToSessionEvent(
    JSON.stringify({
      type: "status_change",
      sessionId: "s1",
      tool: "cursor",
      status: "waiting",
      timestamp: 1,
      pendingAction: {
        id: "a1",
        type: "approval",
        title: "Continue?",
        options: ["Yes", "No"],
      },
      responseTarget: {
        mode: "socket",
        socketPath: "/tmp/devpilot-a1.sock",
        timeoutMs: 25_000,
      },
    }),
  );

  expect(ev?.responseTarget).toEqual({
    mode: "socket",
    socketPath: "/tmp/devpilot-a1.sock",
    timeoutMs: 25_000,
  });
});

it("ignores malformed responseTarget without dropping the event", () => {
  const ev = lineToSessionEvent(
    JSON.stringify({
      hook_event_name: "StatusChange",
      session_id: "c1",
      status: "waiting",
      pendingAction: {
        id: "a1",
        type: "single_choice",
        title: "Pick",
        options: ["A", "B"],
      },
      responseTarget: {
        mode: "socket",
        socketPath: 123,
      },
    }),
  );

  expect(ev?.sessionId).toBe("c1");
  expect(ev?.responseTarget).toBeUndefined();
});
```

- [ ] **Step 2: Run the targeted ingress test file and verify the new cases fail**

Run: `npm test -- src/main/ingress/hookIngress.test.ts`

Expected: FAIL with TypeScript/test errors because `SessionEvent` and ingress parsing do not yet expose `responseTarget`.

- [ ] **Step 3: Add shared `ResponseTarget` typing and switch renderer-facing sessions to `pendingActions[]`**

```ts
export interface ResponseTarget {
  mode: "socket";
  socketPath: string;
  timeoutMs?: number;
}

export function isResponseTarget(value: unknown): value is ResponseTarget {
  if (!value || typeof value !== "object") return false;
  const o = value as Record<string, unknown>;
  if (o.mode !== "socket") return false;
  if (typeof o.socketPath !== "string" || o.socketPath.trim() === "") return false;
  if ("timeoutMs" in o && typeof o.timeoutMs !== "number") return false;
  return true;
}

export interface SessionRecord {
  id: string;
  tool: string;
  status: SessionStatus;
  task?: string;
  updatedAt: number;
  pendingActions?: PendingAction[];
}
```

- [ ] **Step 4: Extend canonical envelopes and ingress parsing**

```ts
export interface StatusChangeUpstreamEvent {
  type: "status_change";
  sessionId: string;
  tool: UpstreamToolId;
  status: string;
  task?: string;
  timestamp: number;
  meta?: Record<string, unknown>;
  pendingAction?: PendingAction | null;
  responseTarget?: ResponseTarget;
}

function responseTargetFromRawPayload(
  o: Record<string, unknown>,
): ResponseTarget | undefined {
  if (!("responseTarget" in o)) return undefined;
  return isResponseTarget(o.responseTarget) ? o.responseTarget : undefined;
}

return {
  type: normalized.type,
  sessionId: normalized.sessionId,
  tool: normalized.tool,
  status: normalized.status,
  task: normalized.task,
  timestamp: normalized.timestamp,
  ...(pendingPart !== undefined ? { pendingAction: pendingPart } : {}),
  ...(responseTarget ? { responseTarget } : {}),
};
```

- [ ] **Step 5: Re-run ingress tests**

Run: `npm test -- src/main/ingress/hookIngress.test.ts`

Expected: PASS for both existing pending-action tests and the new `responseTarget` coverage.

## Task 2: Session Store Multi-Pending Runtime

**Files:**
- Modify: `src/main/session/sessionStore.ts`
- Test: `src/main/session/sessionStore.test.ts`

- [ ] **Step 1: Write failing session-store tests for multiple pending requests**

```ts
it("stores multiple pending actions for the same session", () => {
  const store = createSessionStore();

  store.applyEvent({
    sessionId: "s1",
    tool: "cursor",
    status: "waiting",
    timestamp: 1,
    pendingAction: {
      id: "a1",
      type: "approval",
      title: "First",
      options: ["OK"],
    },
    responseTarget: {
      mode: "socket",
      socketPath: "/tmp/a1.sock",
    },
  });

  store.applyEvent({
    sessionId: "s1",
    tool: "cursor",
    status: "waiting",
    timestamp: 2,
    pendingAction: {
      id: "a2",
      type: "single_choice",
      title: "Second",
      options: ["A", "B"],
    },
    responseTarget: {
      mode: "socket",
      socketPath: "/tmp/a2.sock",
    },
  });

  expect(store.getSessions()[0].pendingActions).toEqual([
    {
      id: "a1",
      type: "approval",
      title: "First",
      options: ["OK"],
    },
    {
      id: "a2",
      type: "single_choice",
      title: "Second",
      options: ["A", "B"],
    },
  ]);
});

it("preparePendingActionResponse returns the matching line and responseTarget", () => {
  const store = createSessionStore();
  store.applyEvent({
    sessionId: "s1",
    tool: "cursor",
    status: "waiting",
    timestamp: 1,
    pendingAction: {
      id: "a2",
      type: "single_choice",
      title: "Second",
      options: ["A", "B"],
    },
    responseTarget: {
      mode: "socket",
      socketPath: "/tmp/a2.sock",
    },
  });

  expect(store.preparePendingActionResponse("s1", "a2", "A")).toEqual({
    line:
      '{"type":"action_response","sessionId":"s1","actionId":"a2","response":{"kind":"option","value":"A"}}',
    responseTarget: {
      mode: "socket",
      socketPath: "/tmp/a2.sock",
    },
  });
});
```

- [ ] **Step 2: Run the targeted store tests and confirm failure**

Run: `npm test -- src/main/session/sessionStore.test.ts`

Expected: FAIL because the store still exposes a single `pendingAction` and clears it inside `respondToPendingAction()`.

- [ ] **Step 3: Refactor session store into per-action runtime state**

```ts
type PendingActionRuntimeState = {
  action: PendingAction;
  responseTarget?: ResponseTarget;
  updatedAt: number;
};

type SessionRuntimeRecord = {
  id: string;
  tool: string;
  status: SessionStatus;
  task?: string;
  updatedAt: number;
  pendingActions: Map<string, PendingActionRuntimeState>;
};

export type PreparedActionResponse = {
  line: string;
  responseTarget?: ResponseTarget;
};

function toSessionRecord(rec: SessionRuntimeRecord): SessionRecord {
  const pendingActions = [...rec.pendingActions.values()]
    .sort((a, b) => a.updatedAt - b.updatedAt)
    .map((entry) => entry.action);

  return pendingActions.length > 0
    ? {
        id: rec.id,
        tool: rec.tool,
        status: rec.status,
        task: rec.task,
        updatedAt: rec.updatedAt,
        pendingActions,
      }
    : {
        id: rec.id,
        tool: rec.tool,
        status: rec.status,
        task: rec.task,
        updatedAt: rec.updatedAt,
      };
}
```

- [ ] **Step 4: Split “prepare” and “complete” response APIs**

```ts
preparePendingActionResponse(
  sessionId: string,
  actionId: string,
  option: string,
): PreparedActionResponse | null {
  const rec = sessions.get(sessionId);
  const pending = rec?.pendingActions.get(actionId);
  if (!pending) return null;

  return {
    line: stringifyActionResponsePayload(sessionId, actionId, option),
    responseTarget: pending.responseTarget,
  };
},

completePendingActionResponse(sessionId: string, actionId: string): boolean {
  const rec = sessions.get(sessionId);
  if (!rec?.pendingActions.has(actionId)) return false;
  rec.pendingActions.delete(actionId);
  rec.updatedAt = Date.now();
  sessions.set(sessionId, rec);
  return true;
},
```

- [ ] **Step 5: Preserve current clear semantics**

```ts
if (event.pendingAction === undefined) {
  // keep the existing pendingActions map
} else if (event.pendingAction === null) {
  nextPendingActions.clear();
} else {
  nextPendingActions.set(event.pendingAction.id, {
    action: event.pendingAction,
    responseTarget: event.responseTarget,
    updatedAt: event.timestamp,
  });
}
```

- [ ] **Step 6: Re-run session-store tests**

Run: `npm test -- src/main/session/sessionStore.test.ts`

Expected: PASS for single-action compatibility, same-session multi-pending, and clear-all behavior.

## Task 3: Response Dispatch and Transport Selection

**Files:**
- Modify: `src/main/actionResponse/actionResponseTransport.ts`
- Modify: `src/main/actionResponse/createActionResponseTransport.ts`
- Modify: `src/main/actionResponse/dispatchActionResponse.ts`
- Test: `src/main/actionResponse/createActionResponseTransport.test.ts`
- Test: `src/main/actionResponse/dispatchActionResponse.test.ts`

- [ ] **Step 1: Write failing tests for per-request routing and clear-after-send**

```ts
it("prefers a prepared responseTarget over the default transport", async () => {
  const store = {
    preparePendingActionResponse: vi.fn(() => ({
      line: '{"type":"action_response","sessionId":"s1","actionId":"a1","response":{"kind":"option","value":"A"}}',
      responseTarget: {
        mode: "socket",
        socketPath: "/tmp/a1.sock",
      },
    })),
    completePendingActionResponse: vi.fn(() => true),
  };

  const fallbackTransport = { send: vi.fn(async () => {}) };
  const targetedTransport = { send: vi.fn(async () => {}) };
  const transportFactory = vi.fn(() => targetedTransport);
  const broadcastSessions = vi.fn();

  const result = await dispatchActionResponse(
    store,
    fallbackTransport,
    transportFactory,
    broadcastSessions,
    "s1",
    "a1",
    "A",
  );

  expect(result).toBe(true);
  expect(transportFactory).toHaveBeenCalledWith({
    mode: "socket",
    socketPath: "/tmp/a1.sock",
  });
  expect(targetedTransport.send).toHaveBeenCalled();
  expect(fallbackTransport.send).not.toHaveBeenCalled();
  expect(store.completePendingActionResponse).toHaveBeenCalledWith("s1", "a1");
});

it("does not clear pending action when send fails", async () => {
  const store = {
    preparePendingActionResponse: vi.fn(() => ({
      line: '{"type":"action_response","sessionId":"s1","actionId":"a1","response":{"kind":"option","value":"A"}}',
      responseTarget: undefined,
    })),
    completePendingActionResponse: vi.fn(() => true),
  };

  const fallbackTransport = {
    send: vi.fn(async () => {
      throw new Error("boom");
    }),
  };

  await expect(
    dispatchActionResponse(
      store,
      fallbackTransport,
      createActionResponseTransportForTarget,
      vi.fn(),
      "s1",
      "a1",
      "A",
    ),
  ).rejects.toThrow("boom");

  expect(store.completePendingActionResponse).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the targeted action-response tests and confirm failure**

Run: `npm test -- src/main/actionResponse/dispatchActionResponse.test.ts src/main/actionResponse/createActionResponseTransport.test.ts`

Expected: FAIL because `dispatchActionResponse()` still accepts only one transport and the transport module has no per-target factory.

- [ ] **Step 3: Add a reusable per-target transport factory**

```ts
export interface ActionResponseTransportFactory {
  fromTarget(target: ResponseTarget): ActionResponseTransport;
}

function createSocketTransport(
  options: net.NetConnectOpts,
  timeoutMs = ACTION_RESPONSE_SOCKET_TIMEOUT_MS,
): ActionResponseTransport {
  return {
    async send(line: string) {
      const payload = `${line}\n`;
      await new Promise<void>((resolve, reject) => {
        // existing socket connection logic, but parameterized by timeoutMs
      });
    },
  };
}

export function createActionResponseTransportForTarget(
  target: ResponseTarget,
): ActionResponseTransport {
  return createSocketTransport(
    { path: target.socketPath },
    target.timeoutMs ?? ACTION_RESPONSE_SOCKET_TIMEOUT_MS,
  );
}
```

- [ ] **Step 4: Route, send, then clear**

```ts
export async function dispatchActionResponse(
  sessionStore: ActionResponseSessionStore,
  fallbackTransport: ActionResponseTransport,
  createTransportForTarget: (target: ResponseTarget) => ActionResponseTransport,
  broadcastSessions: () => void,
  sessionId: string,
  actionId: string,
  option: string,
): Promise<boolean> {
  const prepared = sessionStore.preparePendingActionResponse(sessionId, actionId, option);
  if (!prepared) return false;

  const transport = prepared.responseTarget
    ? createTransportForTarget(prepared.responseTarget)
    : fallbackTransport;

  await transport.send(prepared.line);
  if (!sessionStore.completePendingActionResponse(sessionId, actionId)) {
    return false;
  }
  broadcastSessions();
  return true;
}
```

- [ ] **Step 5: Re-run the action-response tests**

Run: `npm test -- src/main/actionResponse/dispatchActionResponse.test.ts src/main/actionResponse/createActionResponseTransport.test.ts`

Expected: PASS for fallback routing, dynamic target routing, timeout handling, and no-clear-on-send-failure behavior.

## Task 4: Renderer Support for Multiple Pending Cards

**Files:**
- Modify: `src/renderer/sessionRows.ts`
- Modify: `src/renderer/components/SessionRow.tsx`
- Test: `src/renderer/components/SessionRow.test.tsx`
- Test: `src/renderer/sessionBootstrap.test.ts`

- [ ] **Step 1: Write failing renderer tests for `pendingActions[]`**

```tsx
it("renders multiple pending action cards for one session", () => {
  const html = renderToStaticMarkup(
    <SessionRow
      session={baseRow({
        pendingActions: [
          {
            id: "a1",
            type: "approval",
            title: "Proceed?",
            options: ["Yes", "No"],
          },
          {
            id: "a2",
            type: "single_choice",
            title: "Select region",
            options: ["SZ", "GZ"],
          },
        ],
      })}
      onRespond={vi.fn()}
    />,
  );

  expect(html).toContain("Proceed?");
  expect(html).toContain("Select region");
  expect(html).toContain(">SZ<");
});
```

- [ ] **Step 2: Run the targeted renderer tests and confirm failure**

Run: `npm test -- src/renderer/components/SessionRow.test.tsx src/renderer/sessionBootstrap.test.ts`

Expected: FAIL because the shared session type and `SessionRow` still rely on a single `pendingAction`.

- [ ] **Step 3: Update row mapping and session row rendering**

```tsx
{session.pendingActions?.map((pendingAction) => (
  <div
    key={pendingAction.id}
    className="pending-action"
    aria-label={pendingAction.title}
  >
    <div className="pending-action__title">{pendingAction.title}</div>
    <div className="pending-action__actions">
      {pendingAction.options.map((option) => (
        <button
          key={`${pendingAction.id}:${option}`}
          type="button"
          className="pending-action__btn"
          onClick={() => onRespond(session.id, pendingAction.id, option)}
        >
          {option}
        </button>
      ))}
    </div>
  </div>
))}
```

- [ ] **Step 4: Update bootstrap expectations**

```ts
const currentSessions: SessionRecord[] = [
  {
    id: "s1",
    tool: "cursor",
    status: "waiting",
    task: "review change",
    updatedAt: 1_700_000_000_000,
    pendingActions: [
      {
        id: "a1",
        type: "single_choice",
        title: "Pick one",
        options: ["Approve", "Reject"],
      },
    ],
  },
];
```

- [ ] **Step 5: Re-run renderer tests**

Run: `npm test -- src/renderer/components/SessionRow.test.tsx src/renderer/sessionBootstrap.test.ts`

Expected: PASS for one-card and multi-card rendering.

## Task 5: Shared Blocking Hook Helper and Hook Scripts

**Files:**
- Create: `scripts/bridge/run-blocking-hook.mjs`
- Modify: `scripts/hooks/cursor-hook.sh`
- Modify: `scripts/hooks/codebuddy-hook.sh`

- [ ] **Step 1: Write the shared Node helper for pending-aware hook forwarding**

```js
#!/usr/bin/env node
import { mkdtemp, rm } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { sendEventLine } from "./send-event.mjs";

function hasPendingAction(payload) {
  return Object.prototype.hasOwnProperty.call(payload, "pendingAction") &&
    payload.pendingAction !== null;
}

async function waitForSingleLine(server) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("timed out waiting for action_response"));
    }, 25_000);

    server.once("connection", (socket) => {
      let buffer = "";
      socket.setEncoding("utf8");
      socket.on("data", (chunk) => {
        buffer += chunk;
        const nl = buffer.indexOf("\n");
        if (nl >= 0) {
          clearTimeout(timeout);
          socket.destroy();
          resolve(buffer.slice(0, nl));
        }
      });
      socket.on("error", reject);
    });
  });
}

async function main() {
  const payload = JSON.parse(process.argv[2]);
  if (!hasPendingAction(payload)) {
    await sendEventLine(JSON.stringify(payload), process.env);
    return;
  }

  const socketDir = await mkdtemp(path.join(os.tmpdir(), "devpilot-hook-"));
  const socketPath = path.join(socketDir, "response.sock");
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.listen(socketPath, () => resolve());
    server.once("error", reject);
  });

  try {
    const linePromise = waitForSingleLine(server);
    await sendEventLine(
      JSON.stringify({
        ...payload,
        responseTarget: {
          mode: "socket",
          socketPath,
          timeoutMs: 25_000,
        },
      }),
      process.env,
    );
    process.stdout.write(`${await linePromise}\n`);
  } finally {
    await new Promise((resolve) => server.close(() => resolve(undefined)));
    await rm(socketDir, { recursive: true, force: true });
  }
}
```

- [ ] **Step 2: Export a reusable sender from `send-event.mjs`**

```js
export async function sendEventLine(body, env = process.env) {
  const trimmed = body.trim();
  const socketPath = env.DEVPILOT_SOCKET_PATH;

  await new Promise((resolve, reject) => {
    const onConnect = () => {
      void sendLine(client, trimmed).then(resolve).catch(reject);
    };

    const client = socketPath
      ? net.createConnection(socketPath, onConnect)
      : net.createConnection(
          {
            host: env.DEVPILOT_IPC_HOST ?? "127.0.0.1",
            port: Number(env.DEVPILOT_IPC_PORT ?? "17371"),
          },
          onConnect,
        );

    client.once("error", reject);
  });
}
```

- [ ] **Step 3: Delegate both shell hooks to the shared helper**

```bash
exec node "./scripts/bridge/run-blocking-hook.mjs" "$payload"
```

- [ ] **Step 4: Smoke-test the helper path with unit test suite still green**

Run: `npm test -- src/main/ingress/hookIngress.test.ts src/main/session/sessionStore.test.ts src/main/actionResponse/dispatchActionResponse.test.ts src/main/actionResponse/createActionResponseTransport.test.ts src/renderer/components/SessionRow.test.tsx src/renderer/sessionBootstrap.test.ts`

Expected: PASS. The helper itself is validated in E2E in the next task.

## Task 6: End-to-End Validation and Docs

**Files:**
- Create: `tests/e2e/helpers/runHookProcess.ts`
- Modify: `tests/e2e/devpilot-action-response.e2e.ts`
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `docs/context/current-status.md`

- [ ] **Step 1: Add a helper to spawn real hook processes**

```ts
import { spawn } from "node:child_process";

export async function runHookProcess(
  scriptPath: string,
  payload: Record<string, unknown>,
  env: NodeJS.ProcessEnv,
): Promise<{
  stdout: Promise<string>;
  close: Promise<number>;
}> {
  const child = spawn(scriptPath, {
    env,
    stdio: ["pipe", "pipe", "pipe"],
  });

  child.stdin.end(JSON.stringify(payload));

  const stdout = new Promise<string>((resolve, reject) => {
    let buf = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      buf += chunk;
      if (buf.includes("\n")) {
        resolve(buf.trim());
      }
    });
    child.on("error", reject);
  });

  const close = new Promise<number>((resolve) => {
    child.on("close", (code) => resolve(code ?? 1));
  });

  return { stdout, close };
}
```

- [ ] **Step 2: Add a same-session concurrent E2E first**

```ts
test("routes same-session pending actions to the matching waiting hooks", async () => {
  const devpilot = await launchDevPilot({
    actionResponseSocketPath: collector.socketPath,
  });

  const env = {
    ...process.env,
    DEVPILOT_SOCKET_PATH: devpilot.ipcSocketPath,
  };

  const hookA = await runHookProcess(cursorHookPath, {
    hook_event_name: "StatusChange",
    session_id: "shared-session",
    status: "waiting",
    pendingAction: {
      id: "action-a",
      type: "approval",
      title: "Approve A?",
      options: ["Yes", "No"],
    },
  }, env);

  const hookB = await runHookProcess(cursorHookPath, {
    hook_event_name: "StatusChange",
    session_id: "shared-session",
    status: "waiting",
    pendingAction: {
      id: "action-b",
      type: "single_choice",
      title: "Choose B",
      options: ["Left", "Right"],
    },
  }, env);

  const page = await devpilot.app.firstWindow();
  await expect(page.getByLabel("Approve A?")).toBeVisible();
  await expect(page.getByLabel("Choose B")).toBeVisible();

  await page.getByRole("button", { name: "Right" }).click();
  await page.getByRole("button", { name: "Yes" }).click();

  await expect(hookB.stdout).resolves.toContain('"actionId":"action-b"');
  await expect(hookA.stdout).resolves.toContain('"actionId":"action-a"');
});
```

- [ ] **Step 3: Run the E2E suite and confirm the new test fails**

Run: `npm run test:e2e -- --grep "routes same-session pending actions"`

Expected: FAIL because the current app only stores one pending action per session and the real hook scripts do not wait for replies.

- [ ] **Step 4: Update status docs after code and tests are green**

```md
- External `action_response` write-back is finished for `approval`, `single_choice`, and `multi_choice`
- Same-session concurrent pending requests are routed by `actionId`
```

- [ ] **Step 5: Run the full verification suite**

Run: `npm test`
Expected: PASS

Run: `npm run test:e2e`
Expected: PASS

Run: `npm run lint`
Expected: PASS

Run: `npm run build`
Expected: PASS

## Self-Review

### Spec Coverage

- Per-request `responseTarget`: covered by Tasks 1, 3, and 5.
- Multi-agent concurrent waits: covered by Tasks 2, 3, and 6.
- Same-session concurrent waits: covered by Tasks 2, 4, and 6.
- Renderer-only `pendingActions[]` exposure: covered by Tasks 1, 2, and 4.
- Hook blocking flow and stdout write-back: covered by Tasks 5 and 6.
- Docs/status refresh after implementation: covered by Task 6.

### Placeholder Scan

- No `TBD`, `TODO`, or “implement later” placeholders remain.
- Every task contains explicit files, commands, and code snippets.

### Type Consistency

- Shared public shape uses `pendingActions?: PendingAction[]`.
- Canonical/raw ingress still accepts one `pendingAction` per event.
- Main-process runtime stores pending requests by `actionId`.
- Dispatch uses `preparePendingActionResponse()` and `completePendingActionResponse()`.
