# Cursor Phase 1 Product Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a Cursor-only Phase 1 product with full Cursor hook coverage, actionable pending flow, and installable macOS test packaging.

**Architecture:** Expand the existing Cursor adapter from a lifecycle-only bridge into a full hook pipeline while reusing the current ingress, session store, pending-action routing, and renderer. Update integration installation and product copy so Cursor becomes the only Phase 1 promise, then verify the end-to-end path with unit, integration, E2E, and packaging checks.

**Tech Stack:** Electron, React, TypeScript, Vitest, Playwright, electron-builder

---

### Task 1: Define the Full Cursor Hook Contract

**Files:**
- Modify: `src/main/hook/runHookCli.ts`
- Modify: `src/main/hook/commandBuilder.ts`
- Modify: `src/main/hook/commandBuilder.test.ts`
- Modify: `src/main/hook/runHookCli.test.ts`
- Create: `src/main/hook/cursorHook.ts`
- Create: `src/main/hook/cursorHook.test.ts`

- [ ] **Step 1: Write the failing command-builder and CLI tests for a full Cursor hook command**

Add tests that assert Cursor uses a single executable hook subcommand instead of only `cursor-lifecycle`.

```ts
it("builds the full cursor hook command in dev mode", () => {
  expect(
    buildCursorHookCommand({
      packaged: false,
      execPath: "/tmp/Electron",
      appPath: "/tmp/app",
    }),
  ).toBe('"/tmp/Electron" "/tmp/app" --codepal-hook cursor');
});

it("parses the cursor hook subcommand", async () => {
  const exitCode = await runHookCli(
    ["CodePal", "--codepal-hook", "cursor"],
    stdinFromString(JSON.stringify({ session_id: "s1", hook_event_name: "SessionStart" })),
    stdout,
    stderr,
    env,
  );

  expect(exitCode).toBe(0);
});
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `npm test -- src/main/hook/commandBuilder.test.ts src/main/hook/runHookCli.test.ts`

Expected: FAIL because `buildCursorHookCommand` and `--codepal-hook cursor` do not exist yet.

- [ ] **Step 3: Implement the full Cursor hook command builder and CLI branch**

Add a dedicated Cursor hook builder and CLI branch that routes raw payloads into a new `cursorHook` pipeline.

```ts
export function buildCursorHookCommand(context: HookCommandContext): string {
  const hookArgs = buildCodePalHookArgs("cursor");
  if (context.packaged) {
    return `${quoteArg(context.execPath)} ${hookArgs}`;
  }
  return `${quoteArg(context.execPath)} ${quoteArg(context.appPath)} ${hookArgs}`;
}
```

```ts
if (subcommand === "cursor") {
  return { kind: "cursor" };
}
```

- [ ] **Step 4: Implement the raw Cursor hook pipeline with blocking/non-blocking dispatch**

Create `src/main/hook/cursorHook.ts` with one public function that:

- parses raw Cursor JSON
- normalizes it
- sends ordinary events with `sendEventLine`
- sends blocking events with `runBlockingHookFromRaw`

```ts
export async function runCursorHookPipeline(
  rawText: string,
  env: NodeJS.ProcessEnv,
): Promise<string | undefined> {
  const payload = JSON.parse(rawText) as Record<string, unknown>;
  const normalized = normalizeCursorHookPayload(payload);
  if (!normalized) {
    return undefined;
  }
  if (normalized.kind === "blocking") {
    return runBlockingHookFromRaw(JSON.stringify(normalized.event), env);
  }
  await sendEventLine(JSON.stringify(normalized.event), env);
  return undefined;
}
```

- [ ] **Step 5: Run the focused tests to verify they pass**

Run: `npm test -- src/main/hook/commandBuilder.test.ts src/main/hook/runHookCli.test.ts src/main/hook/cursorHook.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the hook contract changes**

```bash
git add src/main/hook/runHookCli.ts src/main/hook/commandBuilder.ts src/main/hook/commandBuilder.test.ts src/main/hook/runHookCli.test.ts src/main/hook/cursorHook.ts src/main/hook/cursorHook.test.ts
git commit -m "feat: add full cursor hook pipeline"
```

### Task 2: Expand Cursor Normalization and Ingress Coverage

**Files:**
- Modify: `src/adapters/cursor/normalizeCursorEvent.ts`
- Modify: `src/adapters/cursor/normalizeCursorEvent.test.ts`
- Modify: `src/main/ingress/hookIngress.ts`
- Modify: `src/main/ingress/hookIngress.test.ts`
- Modify: `src/main/session/sessionStore.test.ts`
- Modify: `src/shared/sessionTypes.ts`
- Modify: `src/main/session/sessionTypes.ts`

- [ ] **Step 1: Write failing adapter and ingress tests for full Cursor event coverage**

Add tests that cover:

- lifecycle events
- progress/status events
- supported pending actions
- unsupported interactive action degradation
- pending close signals

```ts
it("maps a cursor approval payload into a waiting pending action", () => {
  const event = normalizeCursorHookPayload({
    session_id: "cursor-1",
    hook_event_name: "Notification",
    status: "waiting",
    pendingAction: {
      id: "approve-1",
      type: "approval",
      title: "Run command?",
      options: ["Allow", "Deny"],
    },
  });

  expect(event).toMatchObject({
    kind: "blocking",
    event: {
      sessionId: "cursor-1",
      status: "waiting",
      pendingAction: { id: "approve-1", type: "approval" },
    },
  });
});
```

```ts
it("degrades unsupported interactive payloads into visible non-action events", () => {
  const event = lineToSessionEvent(
    JSON.stringify({
      hook_event_name: "Notification",
      session_id: "cursor-2",
      status: "waiting",
      meta: { unsupported_action_type: "text_input" },
      task: "Unsupported Cursor action: text_input",
    }),
  );

  expect(event).toMatchObject({
    sessionId: "cursor-2",
    status: "waiting",
    task: "Unsupported Cursor action: text_input",
  });
});
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `npm test -- src/adapters/cursor/normalizeCursorEvent.test.ts src/main/ingress/hookIngress.test.ts src/main/session/sessionStore.test.ts`

Expected: FAIL because Cursor still only supports the minimal `StatusChange` path.

- [ ] **Step 3: Implement the Cursor event matrix and conservative fallback mapping**

Expand Cursor normalization to:

- accept both legacy `StatusChange` and the new full Cursor hook payload path
- produce shared session events with `meta`, `pendingAction`, `pendingClosed`, and optional unsupported markers
- preserve current session identity rules

```ts
type NormalizedCursorHookResult =
  | { kind: "event"; event: StatusChangeUpstreamEvent }
  | { kind: "blocking"; event: StatusChangeUpstreamEvent };

function unsupportedCursorActionEvent(
  sessionId: string,
  actionType: string,
  task: string,
): StatusChangeUpstreamEvent {
  return {
    type: "status_change",
    sessionId,
    tool: "cursor",
    status: "waiting",
    task,
    timestamp: Date.now(),
    meta: {
      hook_event_name: "Notification",
      unsupported_action_type: actionType,
    },
  };
}
```

- [ ] **Step 4: Update session-store activity wording tests for degraded Cursor actions and close flows**

Add or adjust tests to assert the activity timeline stays user-visible for:

- pending action opens
- pending closes
- unsupported Cursor interactive actions

```ts
expect(store.getSessions()[0].activities).toEqual([
  "Unsupported Cursor action: text_input",
  "Closed action approve-1 (consumed_local)",
  "Pending action: Run command?",
]);
```

- [ ] **Step 5: Run the focused tests to verify they pass**

Run: `npm test -- src/adapters/cursor/normalizeCursorEvent.test.ts src/main/ingress/hookIngress.test.ts src/main/session/sessionStore.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the normalization changes**

```bash
git add src/adapters/cursor/normalizeCursorEvent.ts src/adapters/cursor/normalizeCursorEvent.test.ts src/main/ingress/hookIngress.ts src/main/ingress/hookIngress.test.ts src/main/session/sessionStore.test.ts src/shared/sessionTypes.ts src/main/session/sessionTypes.ts
git commit -m "feat: expand cursor event coverage"
```

### Task 3: Make Cursor the Only Phase 1 Integration Promise

**Files:**
- Modify: `src/main/integrations/integrationService.ts`
- Modify: `src/main/integrations/integrationService.test.ts`
- Modify: `src/renderer/components/IntegrationPanel.tsx`
- Modify: `src/renderer/components/IntegrationPanel.test.tsx`
- Modify: `README.md`
- Modify: `docs/context/current-status.md`

- [ ] **Step 1: Write failing integration-service and UI copy tests for Cursor-first behavior**

Add tests that assert:

- Cursor install writes the new full hook command
- settings messaging emphasizes Cursor as the Phase 1 supported integration
- CodeBuddy/PyCharm are no longer presented as current product promises

```ts
expect(JSON.parse(text)).toMatchObject({
  hooks: {
    sessionStart: [{ command: `"${execPath}" "${appPath}" --codepal-hook cursor` }],
  },
});
```

```tsx
expect(html).toContain("Phase 1 当前只保证 Cursor 接入");
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `npm test -- src/main/integrations/integrationService.test.ts src/renderer/components/IntegrationPanel.test.tsx`

Expected: FAIL because installation and product copy still reflect the old multi-agent positioning.

- [ ] **Step 3: Implement Cursor-first installation and diagnostics**

Update integration installation so Cursor writes the full hook command everywhere the new config expects it, while preserving idempotence, backups, and legacy detection.

```ts
const requiredNew = {
  sessionStart: buildCursorHookCommand(hookCtx),
  stop: buildCursorHookCommand(hookCtx),
};
```

If Cursor supports more event keys in `hooks.json`, include them explicitly in one shared required config builder instead of scattering literals.

- [ ] **Step 4: Update renderer and docs copy to match the new product promise**

Adjust settings copy and repository docs so Phase 1 clearly says:

- Cursor is the current supported integration
- CodeBuddy/PyCharm are future work
- the packaged macOS build is an internal test build

- [ ] **Step 5: Run the focused tests to verify they pass**

Run: `npm test -- src/main/integrations/integrationService.test.ts src/renderer/components/IntegrationPanel.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit the Cursor-first product changes**

```bash
git add src/main/integrations/integrationService.ts src/main/integrations/integrationService.test.ts src/renderer/components/IntegrationPanel.tsx src/renderer/components/IntegrationPanel.test.tsx README.md docs/context/current-status.md
git commit -m "feat: make cursor the phase1 integration"
```

### Task 4: Verify End-to-End Cursor Product Flow

**Files:**
- Modify: `playwright.e2e.config.ts`
- Modify: `e2e/*` or existing Playwright test files that cover settings/install and pending flow
- Modify: any fixture or support files needed for Cursor-only end-to-end coverage

- [ ] **Step 1: Write failing E2E coverage for Cursor install plus interactive flow**

Add or update a Playwright scenario that:

- opens the settings page
- installs Cursor hooks
- sends simulated Cursor events
- verifies activity timeline updates
- resolves an approval or choice action from the UI
- verifies degraded unsupported action visibility

```ts
await expect(page.getByText("Phase 1 当前只保证 Cursor 接入")).toBeVisible();
await expect(page.getByText("Pending action: Run command?")).toBeVisible();
await expect(page.getByText("Unsupported Cursor action: text_input")).toBeVisible();
```

- [ ] **Step 2: Run the focused E2E test to verify it fails**

Run: `npm run test:e2e -- --grep "cursor phase1"`

Expected: FAIL because the full Cursor-first flow is not wired yet.

- [ ] **Step 3: Implement the minimal E2E fixture and app changes required to satisfy the test**

Keep the implementation small. Reuse existing E2E helper paths and only add the Cursor-first data/setup needed for the new test.

- [ ] **Step 4: Run the focused E2E test to verify it passes**

Run: `npm run test:e2e -- --grep "cursor phase1"`

Expected: PASS.

- [ ] **Step 5: Commit the end-to-end verification changes**

```bash
git add playwright.e2e.config.ts e2e
git commit -m "test: cover cursor phase1 end to end"
```

### Task 5: Run Full Verification and Package the Product

**Files:**
- Modify only if verification reveals a concrete issue in code, tests, or packaging config

- [ ] **Step 1: Run the full unit and integration suite**

Run: `npm test`

Expected: PASS with all Vitest suites green.

- [ ] **Step 2: Run static analysis**

Run: `npm run lint`

Expected: PASS with no lint errors.

- [ ] **Step 3: Run the production build**

Run: `npm run build`

Expected: PASS and generate fresh Electron/Vite outputs.

- [ ] **Step 4: Run the end-to-end suite**

Run: `npm run test:e2e`

Expected: PASS.

- [ ] **Step 5: Build the macOS test artifacts**

Run: `npm run dist:mac`

Expected: PASS and produce `.zip` and `.dmg` under `release/`.

- [ ] **Step 6: If any command fails, fix with a new red-green cycle before proceeding**

For any failing area:

- add or narrow a failing test
- implement the minimal fix
- rerun the failing command

- [ ] **Step 7: Commit the final verification-driven fixes**

```bash
git add -A
git commit -m "chore: verify cursor phase1 product"
```
