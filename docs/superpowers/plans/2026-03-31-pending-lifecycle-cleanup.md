# Pending Lifecycle Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Shrink and bound `stale pending` windows in DevPilot by adding per-action close semantics, timeout-based cleanup, duplicate-response rejection, and immediate UI removal after close.

**Architecture:** Keep the current `hook + socket` write-back path, extend upstream/session events with an optional per-action close signal, and let the session store own pending lifecycle state (`open -> consumed/expired`). Use a short-lived closed-action ledger for first-win duplicate rejection, and add a main-process sweep so pending cards cannot remain actionable forever when no close signal arrives.

**Tech Stack:** TypeScript, Electron, React, Vitest, Playwright, Node `net`, existing hook/socket bridge

---

## Guardrails

- Do not switch to ACP as part of this change.
- Do not add `text_input` or broader interaction types.
- Keep DevPilot additive: native agent flows must still work when DevPilot is absent.
- Preserve the existing `action_response` JSON payload shape.
- Prefer per-action close over coarse session-level clear, but keep `pendingAction: null` as compatibility fallback.
- Do not create git commits unless the user explicitly asks for them.

## File Map

### Shared / Ingress

- Modify: `src/shared/sessionTypes.ts`
  - Add `PendingCloseReason` and `PendingClosed`
- Modify: `src/adapters/shared/eventEnvelope.ts`
  - Accept optional `pendingClosed`
- Modify: `src/main/ingress/hookIngress.ts`
  - Parse optional `pendingClosed` from canonical and raw payloads
- Modify: `src/main/ingress/hookIngress.test.ts`

### Session Lifecycle

- Modify: `src/main/session/sessionStore.ts`
  - Track `expiresAt`
  - Track recently closed actions
  - Close single actions by `actionId`
  - Expire stale pending actions
- Modify: `src/main/session/sessionStore.test.ts`

### Dispatch / Main Process

- Modify: `src/main/actionResponse/dispatchActionResponse.ts`
  - Reject duplicate responses after first-win
  - Close actions with `consumed_local` after successful send
- Modify: `src/main/actionResponse/dispatchActionResponse.test.ts`
- Modify: `src/main/main.ts`
  - Periodically sweep expired pending actions and broadcast updates

### Renderer / E2E / Docs

- Modify: `src/renderer/sessionBootstrap.test.ts`
  - Lock in push-update behavior when pending cards disappear
- Modify: `tests/e2e/devpilot-action-response.e2e.ts`
  - Cover `pendingClosed` removal
  - Cover timeout expiry removal
  - Cover duplicate-response no-op after first-win
- Modify: `README.md`
- Modify: `docs/context/current-status.md`

## Task 1: Shared Close Signal and Ingress Parsing

**Files:**
- Modify: `src/shared/sessionTypes.ts`
- Modify: `src/adapters/shared/eventEnvelope.ts`
- Modify: `src/main/ingress/hookIngress.ts`
- Test: `src/main/ingress/hookIngress.test.ts`

- [ ] **Step 1: Add failing ingress tests for per-action close parsing**

```ts
it("parses pendingClosed on canonical status_change", () => {
  const ev = lineToSessionEvent(
    JSON.stringify({
      type: "status_change",
      sessionId: "s1",
      tool: "cursor",
      status: "running",
      timestamp: 10,
      pendingClosed: {
        actionId: "a1",
        reason: "consumed_remote",
      },
    }),
  );

  expect(ev).toMatchObject({
    sessionId: "s1",
    pendingClosed: {
      actionId: "a1",
      reason: "consumed_remote",
    },
  });
});

it("ignores malformed pendingClosed on raw hook payload while keeping the event", () => {
  const ev = lineToSessionEvent(
    JSON.stringify({
      hook_event_name: "StatusChange",
      session_id: "c1",
      status: "running",
      pendingClosed: {
        actionId: 123,
        reason: "consumed_remote",
      },
    }),
  );

  expect(ev?.sessionId).toBe("c1");
  expect(ev).not.toHaveProperty("pendingClosed");
});
```

- [ ] **Step 2: Run the targeted ingress tests and confirm the new cases fail**

Run: `npm test -- src/main/ingress/hookIngress.test.ts`

Expected: FAIL because shared/event ingress types do not yet expose `pendingClosed`.

- [ ] **Step 3: Add shared pending-close types**

```ts
export type PendingCloseReason =
  | "consumed_local"
  | "consumed_remote"
  | "expired"
  | "cancelled";

export interface PendingClosed {
  actionId: string;
  reason: PendingCloseReason;
}

export function isPendingClosed(value: unknown): value is PendingClosed {
  if (!value || typeof value !== "object") return false;
  const o = value as Record<string, unknown>;
  return (
    typeof o.actionId === "string" &&
    ["consumed_local", "consumed_remote", "expired", "cancelled"].includes(
      String(o.reason),
    )
  );
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
  pendingClosed?: PendingClosed;
  responseTarget?: ResponseTarget;
}

function pendingClosedFromRawPayload(
  o: Record<string, unknown>,
): PendingClosed | undefined {
  if (!("pendingClosed" in o)) return undefined;
  return isPendingClosed(o.pendingClosed) ? o.pendingClosed : undefined;
}

return {
  type: normalized.type,
  sessionId: normalized.sessionId,
  tool: normalized.tool,
  status: normalized.status,
  task: normalized.task,
  timestamp: normalized.timestamp,
  ...(pendingPart !== undefined ? { pendingAction: pendingPart } : {}),
  ...(pendingClosedPart !== undefined ? { pendingClosed: pendingClosedPart } : {}),
  ...(responseTargetPart !== undefined ? { responseTarget: responseTargetPart } : {}),
} as SessionEvent;
```

- [ ] **Step 5: Re-run ingress tests**

Run: `npm test -- src/main/ingress/hookIngress.test.ts`

Expected: PASS for existing `pendingAction` coverage plus the new `pendingClosed` cases.

## Task 2: Session Store Pending Lifecycle

**Files:**
- Modify: `src/main/session/sessionStore.ts`
- Test: `src/main/session/sessionStore.test.ts`

- [ ] **Step 1: Add failing store tests for close, expiry, and duplicate rejection**

```ts
it("closes only the matching action when pendingClosed arrives", () => {
  const store = createSessionStore();
  store.applyEvent({
    sessionId: "s1",
    tool: "cursor",
    status: "waiting",
    timestamp: 1,
    pendingAction: {
      id: "a1",
      type: "approval",
      title: "A1",
      options: ["OK"],
    },
  });
  store.applyEvent({
    sessionId: "s1",
    tool: "cursor",
    status: "waiting",
    timestamp: 2,
    pendingAction: {
      id: "a2",
      type: "approval",
      title: "A2",
      options: ["OK"],
    },
  });

  store.applyEvent({
    sessionId: "s1",
    tool: "cursor",
    status: "running",
    timestamp: 3,
    pendingClosed: {
      actionId: "a1",
      reason: "consumed_remote",
    },
  });

  expect(store.getSessions()[0].pendingActions).toEqual([
    expect.objectContaining({ id: "a2" }),
  ]);
  expect(store.isPendingActionClosed("s1", "a1")).toBe(true);
});

it("expires stale pending actions based on responseTarget timeout", () => {
  const store = createSessionStore();
  store.applyEvent({
    sessionId: "s1",
    tool: "cursor",
    status: "waiting",
    timestamp: 1_000,
    pendingAction: {
      id: "slow",
      type: "approval",
      title: "Slow",
      options: ["OK"],
    },
    responseTarget: {
      mode: "socket",
      socketPath: "/tmp/slow.sock",
      timeoutMs: 50,
    },
  });

  expect(store.expirePendingActions(1_040)).toBe(false);
  expect(store.expirePendingActions(1_051)).toBe(true);
  expect(store.getSessions()[0].pendingActions).toBeUndefined();
  expect(store.isPendingActionClosed("s1", "slow")).toBe(true);
});

it("rejects duplicate preparation after an action is already closed", () => {
  const store = createSessionStore();
  store.applyEvent({
    sessionId: "s1",
    tool: "cursor",
    status: "waiting",
    timestamp: 1,
    pendingAction: {
      id: "dup",
      type: "approval",
      title: "Dup",
      options: ["OK"],
    },
  });

  expect(store.closePendingAction("s1", "dup", "consumed_local")).toBe(true);
  expect(store.preparePendingActionResponse("s1", "dup", "OK")).toBeNull();
  expect(store.isPendingActionClosed("s1", "dup")).toBe(true);
});
```

- [ ] **Step 2: Run the targeted store tests and confirm the new cases fail**

Run: `npm test -- src/main/session/sessionStore.test.ts`

Expected: FAIL because the store does not yet understand `pendingClosed`, expiry, or closed-action tracking.

- [ ] **Step 3: Add lifecycle state and constants to the session store**

```ts
const DEFAULT_PENDING_TIMEOUT_MS = 30_000;
const CLOSED_LEDGER_RETENTION_MS = 5 * 60_000;

type PendingActionRuntimeState = {
  action: PendingAction;
  responseTarget?: ResponseTarget;
  createdAt: number;
  lastSeenAt: number;
  expiresAt: number;
};

type ClosedActionRuntimeState = {
  reason: PendingCloseReason;
  closedAt: number;
};

type InternalSessionRecord = {
  id: string;
  tool: string;
  status: SessionStatus;
  task?: string;
  updatedAt: number;
  pendingById: Map<string, PendingActionRuntimeState>;
  closedById: Map<string, ClosedActionRuntimeState>;
};
```

- [ ] **Step 4: Apply per-action close and upsert semantics**

```ts
function closePendingAction(
  sessionId: string,
  actionId: string,
  reason: PendingCloseReason,
): boolean {
  const internal = sessions.get(sessionId);
  const pending = internal?.pendingById.get(actionId);
  if (!internal || !pending) {
    return false;
  }

  const nextPending = new Map(internal.pendingById);
  nextPending.delete(actionId);
  const nextClosed = new Map(internal.closedById);
  nextClosed.set(actionId, {
    reason,
    closedAt: Date.now(),
  });

  sessions.set(sessionId, {
    ...internal,
    pendingById: nextPending,
    closedById: nextClosed,
    updatedAt: Date.now(),
  });
  return true;
}

if (event.pendingClosed) {
  closePendingAction(event.sessionId, event.pendingClosed.actionId, event.pendingClosed.reason);
}
```

- [ ] **Step 5: Add expiry sweep and duplicate ledger helpers**

```ts
function resolvePendingExpiry(timestamp: number, responseTarget?: ResponseTarget): number {
  const timeoutMs =
    responseTarget?.timeoutMs && responseTarget.timeoutMs > 0
      ? responseTarget.timeoutMs
      : DEFAULT_PENDING_TIMEOUT_MS;
  return timestamp + timeoutMs;
}

function expirePendingActions(now: number): boolean {
  let changed = false;

  for (const [sessionId, internal] of sessions) {
    const expired = [...internal.pendingById.entries()].filter(
      ([, state]) => state.expiresAt <= now,
    );
    if (expired.length === 0) {
      continue;
    }

    let next = internal;
    for (const [actionId] of expired) {
      closePendingAction(sessionId, actionId, "expired");
    }
    next = sessions.get(sessionId)!;

    const keptClosed = [...next.closedById.entries()].filter(
      ([, closed]) => now - closed.closedAt < CLOSED_LEDGER_RETENTION_MS,
    );
    next.closedById = new Map(keptClosed);
    sessions.set(sessionId, next);
    changed = true;
  }

  return changed;
}

function isPendingActionClosed(sessionId: string, actionId: string): boolean {
  return sessions.get(sessionId)?.closedById.has(actionId) ?? false;
}
```

- [ ] **Step 6: Re-run session-store tests**

Run: `npm test -- src/main/session/sessionStore.test.ts`

Expected: PASS for existing pending behavior, per-action close, expiry cleanup, and duplicate rejection.

## Task 3: Dispatch First-Win and Main-Process Expiry Sweep

**Files:**
- Modify: `src/main/actionResponse/dispatchActionResponse.ts`
- Test: `src/main/actionResponse/dispatchActionResponse.test.ts`
- Modify: `src/main/main.ts`

- [ ] **Step 1: Add a failing dispatch test for duplicate-response no-op**

```ts
it("when action was already closed: returns false, logs duplicate, and does not send", async () => {
  const store = createSessionStore();
  store.applyEvent({
    sessionId: "s1",
    tool: "cursor",
    status: "waiting",
    timestamp: 1,
    pendingAction: {
      id: "act-1",
      type: "single_choice",
      title: "Pick",
      options: ["A", "B"],
    },
  });
  store.closePendingAction("s1", "act-1", "consumed_remote");

  const transport = { send: vi.fn(async () => {}) };
  const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const broadcastSessions = vi.fn();

  const result = await dispatchActionResponse(
    store,
    transport,
    broadcastSessions,
    "s1",
    "act-1",
    "A",
  );

  expect(result).toBe(false);
  expect(transport.send).not.toHaveBeenCalled();
  expect(broadcastSessions).not.toHaveBeenCalled();
  expect(warnSpy).toHaveBeenCalledWith(
    "[DevPilot] duplicate action_response ignored:",
    "s1",
    "act-1",
  );
});
```

- [ ] **Step 2: Run the targeted dispatch tests and confirm the new case fails**

Run: `npm test -- src/main/actionResponse/dispatchActionResponse.test.ts`

Expected: FAIL because `dispatchActionResponse()` cannot distinguish a duplicate-closed request from a missing request.

- [ ] **Step 3: Update dispatch to close locally and reject duplicates**

```ts
export type ActionResponseSessionStore = {
  preparePendingActionResponse(
    sessionId: string,
    actionId: string,
    option: string,
  ): PendingActionResponsePrep | null;
  closePendingAction(
    sessionId: string,
    actionId: string,
    reason: PendingCloseReason,
  ): boolean;
  isPendingActionClosed(sessionId: string, actionId: string): boolean;
};

export async function dispatchActionResponse(
  sessionStore: ActionResponseSessionStore,
  fallbackTransport: ActionResponseTransport,
  broadcastSessions: () => void,
  sessionId: string,
  actionId: string,
  option: string,
): Promise<boolean> {
  const prep = sessionStore.preparePendingActionResponse(sessionId, actionId, option);
  if (!prep) {
    if (sessionStore.isPendingActionClosed(sessionId, actionId)) {
      console.warn("[DevPilot] duplicate action_response ignored:", sessionId, actionId);
    }
    return false;
  }

  const transport =
    prep.responseTarget !== undefined
      ? createActionResponseTransportFromResponseTarget(prep.responseTarget)
      : fallbackTransport;

  await transport.send(prep.line);
  sessionStore.closePendingAction(sessionId, actionId, "consumed_local");
  broadcastSessions();
  return true;
}
```

- [ ] **Step 4: Add a periodic expiry sweep in the main process**

```ts
const PENDING_SWEEP_INTERVAL_MS = 1_000;
let pendingSweepTimer: NodeJS.Timeout | null = null;

app.whenReady().then(() => {
  wireActionResponseIpc();
  wireIpcHub();
  pendingSweepTimer = setInterval(() => {
    if (sessionStore.expirePendingActions(Date.now())) {
      broadcastSessions();
    }
  }, PENDING_SWEEP_INTERVAL_MS);
  const win = getOrCreateMainWindow();
  win.webContents.once("dom-ready", () => {
    broadcastSessions();
  });
  createTray();
});

app.on("before-quit", () => {
  if (pendingSweepTimer) {
    clearInterval(pendingSweepTimer);
    pendingSweepTimer = null;
  }
});
```

- [ ] **Step 5: Re-run dispatch tests**

Run: `npm test -- src/main/actionResponse/dispatchActionResponse.test.ts`

Expected: PASS for fallback transport, per-request transport, no-clear-on-send-failure, and duplicate-response rejection.

## Task 4: Renderer Removal Semantics and E2E Validation

**Files:**
- Modify: `src/renderer/sessionBootstrap.test.ts`
- Modify: `tests/e2e/devpilot-action-response.e2e.ts`

- [ ] **Step 1: Add a renderer mapping test that a pushed session snapshot removes pending cards immediately**

```ts
it("rowsFromSessions reflects a push update that removes pendingActions", () => {
  const rows = rowsFromSessions([
    {
      id: "s1",
      tool: "cursor",
      status: "running",
      task: "continued",
      updatedAt: 2,
    },
  ]);

  expect(rows[0].pendingActions).toBeUndefined();
  expect(rows[0].status).toBe("running");
});
```

- [ ] **Step 2: Add an E2E for remote close removing only the matching pending card**

```ts
test("remote consumed close removes only the matching pending card", async () => {
  const devpilot = await launchDevPilot({ actionResponseSocketPath: collector.socketPath });
  const page = await devpilot.app.firstWindow();

  await sendStatusChange(
    {
      type: "status_change",
      sessionId: "close-session",
      tool: "cursor",
      status: "waiting",
      timestamp: Date.now(),
      pendingAction: {
        id: "a1",
        type: "approval",
        title: "Approve A1",
        options: ["OK"],
      },
    },
    devpilot.ipcSocketPath,
  );
  await sendStatusChange(
    {
      type: "status_change",
      sessionId: "close-session",
      tool: "cursor",
      status: "waiting",
      timestamp: Date.now() + 1,
      pendingAction: {
        id: "a2",
        type: "approval",
        title: "Approve A2",
        options: ["OK"],
      },
    },
    devpilot.ipcSocketPath,
  );

  await expect(page.getByLabel("Approve A1")).toBeVisible();
  await expect(page.getByLabel("Approve A2")).toBeVisible();

  await sendStatusChange(
    {
      type: "status_change",
      sessionId: "close-session",
      tool: "cursor",
      status: "running",
      timestamp: Date.now() + 2,
      pendingClosed: {
        actionId: "a1",
        reason: "consumed_remote",
      },
    },
    devpilot.ipcSocketPath,
  );

  await expect(page.getByLabel("Approve A1")).toBeHidden();
  await expect(page.getByLabel("Approve A2")).toBeVisible();
});
```

- [ ] **Step 3: Add an E2E for timeout expiry removing stale pending**

```ts
test("expired pending is removed from the actionable UI", async () => {
  const devpilot = await launchDevPilot({ actionResponseSocketPath: collector.socketPath });
  const page = await devpilot.app.firstWindow();

  await sendStatusChange(
    {
      type: "status_change",
      sessionId: "expire-session",
      tool: "cursor",
      status: "waiting",
      timestamp: Date.now(),
      pendingAction: {
        id: "expire-me",
        type: "approval",
        title: "Expire me",
        options: ["OK"],
      },
      responseTarget: {
        mode: "socket",
        socketPath: "/tmp/devpilot-unused.sock",
        timeoutMs: 150,
      },
    },
    devpilot.ipcSocketPath,
  );

  await expect(page.getByLabel("Expire me")).toBeVisible();
  await expect(page.getByLabel("Expire me")).toBeHidden({ timeout: 5_000 });
});
```

- [ ] **Step 4: Add an E2E for duplicate local response no-op after first-win**

```ts
test("second response attempt after first-win is a no-op", async () => {
  const hook = startBlockingCursorHook({
    repoRoot,
    ipcSocketPath: devpilot.ipcSocketPath,
    payload: {
      type: "status_change",
      sessionId: "dup-session",
      tool: "cursor",
      status: "waiting",
      timestamp: Date.now(),
      pendingAction: {
        id: "dup-action",
        type: "single_choice",
        title: "Duplicate me",
        options: ["Approve", "Reject"],
      },
    },
  });

  await expect(page.getByLabel("Duplicate me")).toBeVisible();
  await page.getByLabel("Duplicate me").getByRole("button", { name: "Approve" }).click();
  await expect(hook.waitForExitCode()).resolves.toBe(0);
  await expect(page.getByLabel("Duplicate me")).toBeHidden();
  await expect(
    page.getByLabel("Duplicate me").getByRole("button", { name: "Approve" }),
  ).toHaveCount(0);
});
```

- [ ] **Step 5: Run targeted tests**

Run: `npm test -- src/renderer/sessionBootstrap.test.ts`

Expected: PASS after the new snapshot-removal case is added.

Run: `npm run test:e2e -- --grep "remote consumed close|expired pending|first-win"`

Expected: FAIL before implementation is complete, then PASS once close parsing, store expiry, and sweep logic are in place.

## Task 5: Status Docs and Full Verification

**Files:**
- Modify: `README.md`
- Modify: `docs/context/current-status.md`

- [ ] **Step 1: Update repo docs to describe bounded stale-pending cleanup**

```md
- Pending action write-back now rejects duplicate responses after first-win.
- DevPilot can remove pending cards from explicit per-action close signals.
- Pending cards also expire out of the actionable UI after timeout if no close signal arrives.
```

- [ ] **Step 2: Run the focused verification suite**

Run: `npm test -- src/main/ingress/hookIngress.test.ts src/main/session/sessionStore.test.ts src/main/actionResponse/dispatchActionResponse.test.ts src/renderer/sessionBootstrap.test.ts`

Expected: PASS

Run: `npm run test:e2e -- --grep "action-response|consumed close|expired pending|first-win"`

Expected: PASS

- [ ] **Step 3: Run the full verification suite**

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

- `stale pending` may briefly appear, but is now bounded by timeout and explicit close: covered by Tasks 2, 3, and 4.
- `first-win` with duplicate-response rejection: covered by Tasks 2, 3, and 4.
- per-action consumed/closed signal: covered by Tasks 1, 2, and 4.
- immediate UI removal after close/expiry: covered by Tasks 3 and 4.
- no protocol migration as the first remedy: preserved across all tasks.

### Placeholder Scan

- No `TBD`, `TODO`, or “implement later” placeholders remain.
- Each task lists exact files, commands, and code snippets.

### Type Consistency

- Upstream/session events use `pendingClosed` as the per-action close field.
- Session runtime uses `pendingById` plus `closedById`.
- Dispatch closes successful local responses with reason `consumed_local`.
- Remote/native close signals use reason `consumed_remote`.
