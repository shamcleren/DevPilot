# Hook Approval Semantics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stabilize hook-based `approval` pending actions with explicit `allow / deny` response semantics while keeping existing `single_choice` and `multi_choice` behavior unchanged.

**Architecture:** Keep the current hook control loop and per-action pending lifecycle intact. Narrow the change to shared action-response typing, session-store response preparation, and renderer approval labeling so Phase 1 semantics become explicit without introducing ACP abstractions.

**Tech Stack:** TypeScript, Electron, React, Vitest, Playwright

---

### Task 1: Lock Approval Response Semantics in Tests

**Files:**
- Modify: `src/shared/actionResponsePayload.test.ts`
- Modify: `src/main/session/sessionStore.test.ts`
- Modify: `src/renderer/components/SessionRow.test.tsx`

- [ ] **Step 1: Write the failing shared payload test**

```ts
it("builds approval responses as explicit allow/deny payloads", () => {
  expect(buildActionResponsePayload("sid", "aid", "approval", "Allow")).toEqual({
    type: "action_response",
    sessionId: "sid",
    actionId: "aid",
    response: { kind: "approval", decision: "allow" },
  });
});
```

- [ ] **Step 2: Run the shared payload test to verify it fails**

Run: `npm test -- src/shared/actionResponsePayload.test.ts`
Expected: FAIL because the payload builder only supports `{ kind: "option", value }`.

- [ ] **Step 3: Write the failing session-store tests**

```ts
it("preparePendingActionResponse returns explicit approval payloads", () => {
  // approval pending action with options ["Allow", "Deny"]
  expect(store.preparePendingActionResponse("s1", "act-1", "Allow")).toEqual({
    line: JSON.stringify({
      type: "action_response",
      sessionId: "s1",
      actionId: "act-1",
      response: { kind: "approval", decision: "allow" },
    }),
  });
});
```

```ts
it("rejects approval responses outside the allowed decision set", () => {
  expect(() => store.respondToPendingAction("s1", "act-1", "Later")).toThrow(
    "invalid approval option",
  );
});
```

- [ ] **Step 4: Run the session-store tests to verify they fail**

Run: `npm test -- src/main/session/sessionStore.test.ts`
Expected: FAIL because approval actions still serialize as generic option payloads and accept arbitrary strings.

- [ ] **Step 5: Write the failing renderer test**

```tsx
it("renders approval buttons with allow/deny labels", () => {
  expect(html).toContain(">Allow<");
  expect(html).toContain(">Deny<");
});
```

- [ ] **Step 6: Run the renderer test to verify it fails if the UI still exposes generic labels**

Run: `npm test -- src/renderer/components/SessionRow.test.tsx`
Expected: FAIL if approval cards are not normalized to explicit allow/deny labels.

### Task 2: Implement Shared + Store Approval Semantics

**Files:**
- Modify: `src/shared/actionResponsePayload.ts`
- Modify: `src/main/session/sessionStore.ts`
- Modify: `src/main/preload/index.ts`
- Modify: `src/renderer/App.tsx`
- Modify: `src/main/hook/sendEventBridge.ts`

- [ ] **Step 1: Add explicit response types in the shared payload module**

```ts
export type ActionResponse =
  | { kind: "option"; value: string }
  | { kind: "approval"; decision: "allow" | "deny" };
```

- [ ] **Step 2: Add approval-aware payload builder helpers**

```ts
function actionResponseFromPending(type: PendingActionType, option: string): ActionResponse {
  if (type !== "approval") {
    return { kind: "option", value: option };
  }
  if (option === "Allow") return { kind: "approval", decision: "allow" };
  if (option === "Deny") return { kind: "approval", decision: "deny" };
  throw new Error(`invalid approval option: ${option}`);
}
```

- [ ] **Step 3: Make session-store response preparation type-aware**

```ts
const state = internal.pendingById.get(actionId);
const line = stringifyActionResponsePayload(sessionId, actionId, state.action.type, option);
```

- [ ] **Step 4: Keep preload / renderer / hook bridge signatures aligned with the existing option string transport**

```ts
respondToPendingAction(sessionId: string, actionId: string, option: string)
```

Expected: The UI can still send a clicked label string, but main-process serialization now depends on the pending action type.

- [ ] **Step 5: Run targeted tests to verify the implementation passes**

Run: `npm test -- src/shared/actionResponsePayload.test.ts src/main/session/sessionStore.test.ts src/renderer/components/SessionRow.test.tsx`
Expected: PASS

### Task 3: Sync UI Labels and Handoff Docs

**Files:**
- Modify: `src/renderer/components/SessionRow.tsx`
- Modify: `tests/e2e/codepal-action-response.e2e.ts`
- Modify: `docs/context/current-status.md`

- [ ] **Step 1: Normalize approval button labels in the renderer**

```tsx
function displayOptions(action: PendingAction): string[] {
  return action.type === "approval" ? ["Allow", "Deny"] : action.options;
}
```

- [ ] **Step 2: Update E2E expectations for approval payload semantics**

```ts
response: { kind: "approval", decision: "allow" }
```

- [ ] **Step 3: Update handoff documentation**

```md
- `approval` actions now round-trip with explicit `allow / deny` semantics on the hook path.
- ACP remains a later complementary control plane and is still gated on stable prompt/session/pending semantics.
```

- [ ] **Step 4: Run verification commands**

Run: `npm test`
Expected: PASS

Run: `npm run lint`
Expected: PASS

- [ ] **Step 5: Review the diff**

Run: `git diff -- src/shared/actionResponsePayload.ts src/main/session/sessionStore.ts src/renderer/components/SessionRow.tsx docs/context/current-status.md tests/e2e/codepal-action-response.e2e.ts`
Expected: Diff shows approval semantics tightened on the hook path only, with no ACP common-layer changes.
