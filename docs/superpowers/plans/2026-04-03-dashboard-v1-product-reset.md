# Dashboard V1 Product Reset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reset CodePal Phase 1 into a dashboard-first product by removing low-value header chrome, moving control features off the main path, stabilizing session lifecycle and ordering, and reorganizing settings for real user onboarding.

**Architecture:** Keep the existing Electron main/preload/renderer structure, but shift product emphasis from pending-action control to session/activity/usage monitoring. Most changes stay inside renderer composition and session store retention rules, with shared types only touched where expiration or hiding experimental controls needs explicit state. Preserve existing control-plane code and tests, but stop surfacing it on the primary dashboard path.

**Tech Stack:** Electron, React, TypeScript, Vitest, ESLint

---

## File Map

### Main/session lifecycle

- Modify: `src/main/session/sessionStore.ts`
- Modify: `src/main/session/sessionStore.test.ts`
- Modify: `src/main/main.ts`

### Renderer shell and session ordering

- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/App.test.tsx`
- Modify: `src/renderer/sessionBootstrap.ts`
- Modify: `src/renderer/components/StatusBar.tsx`
- Modify: `src/renderer/components/SessionList.tsx`
- Modify: `src/renderer/components/SessionRow.tsx`
- Modify: `src/renderer/components/SessionRow.test.tsx`
- Modify: `src/renderer/styles.css`
- Modify: `src/renderer/styles.test.ts`

### Settings reorganization

- Modify: `src/renderer/components/IntegrationPanel.tsx`
- Modify: `src/renderer/components/IntegrationPanel.test.tsx`
- Modify: `src/renderer/components/CursorDashboardPanel.tsx`
- Modify: `src/renderer/components/CursorDashboardPanel.test.tsx`
- Modify: `src/renderer/components/DisplayPreferencesPanel.tsx`

### Optional experimental controls isolation

- Modify: `src/renderer/components/SessionRow.tsx`
- Modify: `src/renderer/components/SessionList.tsx`
- Modify: `src/renderer/App.tsx`

### Docs

- Modify: `README.md`
- Modify: `docs/context/current-status.md`

## Task 1: Remove low-value header chrome and make usage the only top summary

**Files:**
- Modify: `src/renderer/components/StatusBar.tsx`
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/App.test.tsx`
- Modify: `src/renderer/styles.css`
- Modify: `src/renderer/styles.test.ts`

- [ ] **Step 1: Write the failing renderer tests for the new shell**

Add assertions in `src/renderer/App.test.tsx` and `src/renderer/styles.test.ts` so the top shell no longer expects the status chips and no longer expects the `Control Deck` kicker.

```tsx
it("renders the dashboard shell without status chips", () => {
  const html = renderToStaticMarkup(<App />);

  expect(html).toContain("CodePal");
  expect(html).not.toContain("Control Deck");
  expect(html).not.toContain("Run ");
  expect(html).not.toContain("Wait ");
  expect(html).not.toContain("Err ");
});
```

Run: `npm test -- src/renderer/App.test.tsx src/renderer/styles.test.ts`
Expected: FAIL because `StatusBar` still renders chips and `App` still renders the kicker.

- [ ] **Step 2: Simplify `StatusBar` to usage-only layout**

Replace the current `StatusCounts` API in `src/renderer/components/StatusBar.tsx` with a usage-only container.

```tsx
import type { ReactNode } from "react";

type StatusBarProps = {
  usage?: ReactNode;
};

export function StatusBar({ usage }: StatusBarProps) {
  if (!usage) {
    return null;
  }

  return (
    <section className="status-bar" aria-label="Usage summary">
      <div className="status-bar__usage">{usage}</div>
    </section>
  );
}
```

- [ ] **Step 3: Remove header kicker/count wiring from `App`**

Update `src/renderer/App.tsx` so it no longer computes `counts`, drops the `Control Deck` kicker, and passes only `usage`.

```tsx
<div className="app-header__meta">
  <h1 className="app-title">CodePal</h1>
</div>
<StatusBar usage={<UsageStatusStrip overview={usageOverview} settings={usageDisplaySettings} />} />
```

- [ ] **Step 4: Adjust shell CSS for single-purpose header**

Update `src/renderer/styles.css` to remove the kicker-specific weight and left/right status-bar distribution.

```css
.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.status-bar {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  padding: 8px 12px;
}

.status-bar__usage {
  min-width: 0;
  width: 100%;
}
```

- [ ] **Step 5: Run targeted tests**

Run: `npm test -- src/renderer/App.test.tsx src/renderer/styles.test.ts src/renderer/components/UsageStatusStrip.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/StatusBar.tsx src/renderer/App.tsx src/renderer/App.test.tsx src/renderer/styles.css src/renderer/styles.test.ts
git commit -m "refactor: simplify dashboard header"
```

## Task 2: Move experimental pending controls off the main session path

**Files:**
- Modify: `src/renderer/components/SessionRow.tsx`
- Modify: `src/renderer/components/SessionRow.test.tsx`
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/components/DisplayPreferencesPanel.tsx`
- Modify: `src/renderer/styles.css`

- [ ] **Step 1: Write the failing test that main session rows do not render pending action buttons**

Add a test in `src/renderer/components/SessionRow.test.tsx` for a session containing `pendingActions`, and assert the main row does not expose `Allow` / `Deny` buttons in dashboard mode.

```tsx
expect(screen.queryByRole("button", { name: "Allow" })).toBeNull();
expect(screen.queryByText("Awaiting decision")).toBeNull();
```

Run: `npm test -- src/renderer/components/SessionRow.test.tsx`
Expected: FAIL because `SessionRow` still renders `.session-row__interaction`.

- [ ] **Step 2: Gate pending-action UI behind an explicit experimental flag**

In `src/renderer/components/SessionRow.tsx`, add a prop such as `showExperimentalControls?: boolean` and skip rendering the interaction block when it is false.

```tsx
type SessionRowProps = {
  session: MonitorSessionRow;
  expanded: boolean;
  showExperimentalControls?: boolean;
  onToggleExpanded: (sessionId: string) => void;
  onRespond: (sessionId: string, actionId: string, option: string) => void;
};

{showExperimentalControls && pendingActions.length > 0 ? (
  <div className="session-row__interaction">…</div>
) : null}
```

- [ ] **Step 3: Keep dashboard default off in `SessionList` and `App`**

Pass `showExperimentalControls={false}` from `src/renderer/components/SessionList.tsx`, and do not add a main-surface override in `src/renderer/App.tsx`.

```tsx
<SessionRow
  key={session.id}
  session={session}
  expanded={expandedSessionId === session.id}
  showExperimentalControls={false}
  onToggleExpanded={toggleExpanded}
  onRespond={onRespond}
/>
```

- [ ] **Step 4: Add a settings placeholder for future experimental controls**

In `src/renderer/components/DisplayPreferencesPanel.tsx`, add a compact `实验功能` section that explains these controls are retained but not shown on the main dashboard path yet.

```tsx
<div className="display-panel__header">
  <div className="display-panel__title">实验功能</div>
  <div className="display-panel__subtitle">
    审批和选项响应能力仍保留，但当前不在主界面展示。
  </div>
</div>
```

- [ ] **Step 5: Run targeted tests**

Run: `npm test -- src/renderer/components/SessionRow.test.tsx src/renderer/App.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/SessionRow.tsx src/renderer/components/SessionRow.test.tsx src/renderer/components/SessionList.tsx src/renderer/App.tsx src/renderer/components/DisplayPreferencesPanel.tsx src/renderer/styles.css
git commit -m "refactor: hide experimental controls from dashboard"
```

## Task 3: Enforce dashboard-oriented session expiration in the store

**Files:**
- Modify: `src/main/session/sessionStore.ts`
- Modify: `src/main/session/sessionStore.test.ts`
- Modify: `src/main/main.ts`

- [ ] **Step 1: Write failing store tests for expiration windows**

Add explicit tests in `src/main/session/sessionStore.test.ts` for:
- `completed` sessions expiring after 6 hours
- `error` sessions expiring after 24 hours
- `running` and `waiting` sessions not expiring

```ts
it("expires completed sessions after six hours", () => {
  const store = createSessionStore();
  store.applyEvent({
    sessionId: "s-1",
    tool: "codex",
    status: "completed",
    timestamp: 1000,
  });

  expect(store.expireStaleSessions(1000 + 6 * 60 * 60 * 1000 + 1)).toBe(true);
  expect(store.getSessions()).toEqual([]);
});
```

Run: `npm test -- src/main/session/sessionStore.test.ts`
Expected: FAIL because `SESSION_HISTORY_RETENTION_MS` still retains sessions for 7 days.

- [ ] **Step 2: Replace the single retention window with per-status policy**

In `src/main/session/sessionStore.ts`, add explicit constants and helper logic.

```ts
export const COMPLETED_SESSION_RETENTION_MS = 6 * 60 * 60 * 1000;
export const ERROR_SESSION_RETENTION_MS = 24 * 60 * 60 * 1000;

function sessionExpiryMs(status: SessionStatus): number | null {
  if (status === "completed" || status === "idle" || status === "offline") {
    return COMPLETED_SESSION_RETENTION_MS;
  }
  if (status === "error") {
    return ERROR_SESSION_RETENTION_MS;
  }
  return null;
}
```

Use the helper inside `expireStaleSessions` instead of the old global retention constant.

- [ ] **Step 3: Keep periodic sweeping but ensure it drives dashboard cleanup**

Verify `src/main/main.ts` continues to call `sweepExpiredPendingActions()` on interval, and rename it if needed so the function clearly covers session cleanup too.

```ts
function sweepExpiredUiState() {
  const now = Date.now();
  const changed =
    sessionStore.expireStalePendingActions(now) || sessionStore.expireStaleSessions(now);
  if (changed) {
    broadcastSessions();
  }
}
```

- [ ] **Step 4: Run focused session-store verification**

Run: `npm test -- src/main/session/sessionStore.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/session/sessionStore.ts src/main/session/sessionStore.test.ts src/main/main.ts
git commit -m "feat: expire stale dashboard sessions"
```

## Task 4: Make session ordering stable and explicitly user-input-first

**Files:**
- Modify: `src/renderer/components/SessionList.tsx`
- Modify: `src/renderer/sessionBootstrap.ts`
- Modify: `src/renderer/components/SessionRow.test.tsx`

- [ ] **Step 1: Write a failing ordering test**

Add a test in `src/renderer/components/SessionRow.test.tsx` or a new `SessionList.test.tsx` that passes sessions with:
- newer tool activity but older `lastUserMessageAt`
- older tool activity but newer `lastUserMessageAt`

The list must place the newer user-input session first.

```tsx
expect(labels).toEqual(["Recent user input", "Recent tool echo"]);
```

Run: `npm test -- src/renderer/components/SessionList.test.tsx`
Expected: FAIL if the current comparator or row conversion does not preserve the intended order under ties.

- [ ] **Step 2: Extract a named comparator and include stable tiebreakers**

In `src/renderer/components/SessionList.tsx`, replace the inline comparator with a shared helper that sorts by:
1. `lastUserMessageAt`
2. `updatedAt`
3. `id`

```ts
export function compareSessions(a: MonitorSessionRow, b: MonitorSessionRow): number {
  const aUserTs = a.lastUserMessageAt ?? Number.NEGATIVE_INFINITY;
  const bUserTs = b.lastUserMessageAt ?? Number.NEGATIVE_INFINITY;
  if (aUserTs !== bUserTs) return bUserTs - aUserTs;
  if (a.updatedAt !== b.updatedAt) return b.updatedAt - a.updatedAt;
  return a.id.localeCompare(b.id);
}
```

- [ ] **Step 3: Keep bootstrap hydration aligned with the same ordering assumptions**

In `src/renderer/sessionBootstrap.ts`, sort inside `rowsFromSessions()` before returning rows so first paint and live updates share the same semantics.

```ts
export function rowsFromSessions(sessions: SessionRecord[]): MonitorSessionRow[] {
  return sessions.map(sessionRecordToRow).sort(compareSessions);
}
```

- [ ] **Step 4: Run the ordering tests**

Run: `npm test -- src/renderer/components/SessionList.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/SessionList.tsx src/renderer/sessionBootstrap.ts src/renderer/components/SessionList.test.tsx
git commit -m "fix: stabilize dashboard session ordering"
```

## Task 5: Reorganize settings into clear dashboard support sections

**Files:**
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/components/IntegrationPanel.tsx`
- Modify: `src/renderer/components/CursorDashboardPanel.tsx`
- Modify: `src/renderer/components/DisplayPreferencesPanel.tsx`
- Modify: `src/renderer/components/IntegrationPanel.test.tsx`
- Modify: `src/renderer/components/CursorDashboardPanel.test.tsx`
- Modify: `src/renderer/styles.css`

- [ ] **Step 1: Write failing tests for section order and copy**

Update renderer tests to expect the settings drawer to present:
1. 接入与诊断
2. 显示与用量
3. 实验功能

```tsx
expect(html.indexOf("接入与诊断")).toBeLessThan(html.indexOf("显示配额"));
expect(html).toContain("实验功能");
```

Run: `npm test -- src/renderer/App.test.tsx src/renderer/components/IntegrationPanel.test.tsx src/renderer/components/CursorDashboardPanel.test.tsx`
Expected: FAIL if the copy or section grouping still reflects the old mixed layout.

- [ ] **Step 2: Tighten integration copy to user-facing status language**

Update `src/renderer/components/IntegrationPanel.tsx` labels so they describe user state instead of implementation detail.

```tsx
<div className="integration-panel__subtitle">
  只在接入、修复或排查问题时使用。正常运行时不需要操作。
</div>
```

Use similar changes for listener and last-event text, e.g. `最近收到事件` instead of `最近事件`.

- [ ] **Step 3: Merge display and usage into one coherent section**

In `src/renderer/App.tsx`, wrap `DisplayPreferencesPanel` and `CursorDashboardPanel` inside a single `显示与用量` group, with `DisplayPreferencesPanel` handling only the strip toggles and `CursorDashboardPanel` handling usage-source connection state.

```tsx
<section className="display-panel" aria-label="显示与用量">
  <DisplayPreferencesPanel ... />
  <CursorDashboardPanel ... />
</section>
```

- [ ] **Step 4: Add the experimental section below the main settings**

Create a simple renderer block in `src/renderer/App.tsx`:

```tsx
<section className="display-panel" aria-label="实验功能">
  <div className="display-panel__header">
    <div className="display-panel__title">实验功能</div>
    <div className="display-panel__subtitle">
      审批与选项响应链路仍保留在应用中，但当前不作为 Dashboard V1 主路径。
    </div>
  </div>
</section>
```

- [ ] **Step 5: Run targeted settings tests**

Run: `npm test -- src/renderer/App.test.tsx src/renderer/components/IntegrationPanel.test.tsx src/renderer/components/CursorDashboardPanel.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/renderer/App.tsx src/renderer/components/IntegrationPanel.tsx src/renderer/components/CursorDashboardPanel.tsx src/renderer/components/DisplayPreferencesPanel.tsx src/renderer/App.test.tsx src/renderer/components/IntegrationPanel.test.tsx src/renderer/components/CursorDashboardPanel.test.tsx src/renderer/styles.css
git commit -m "refactor: reorganize dashboard settings"
```

## Task 6: Polish session-row density for dashboard readability

**Files:**
- Modify: `src/renderer/components/SessionRow.tsx`
- Modify: `src/renderer/components/SessionRow.test.tsx`
- Modify: `src/renderer/styles.css`
- Modify: `src/renderer/styles.test.ts`

- [ ] **Step 1: Write a failing test for reduced meta noise**

Add a renderer test ensuring collapsed rows prioritize:
- tool
- title
- state
- time

and do not over-emphasize secondary metadata such as `#shortId` when the row is narrow.

```tsx
expect(html).not.toContain(">#abc123<");
expect(html).toContain("RUNNING");
```

Run: `npm test -- src/renderer/components/SessionRow.test.tsx`
Expected: FAIL if the old collapsed meta still includes all secondary items.

- [ ] **Step 2: Trim the collapsed row metadata**

Update `src/renderer/components/SessionRow.tsx` so the collapsed row drops `#{shortId}` from the default meta band and keeps only the most useful summary and duration.

```tsx
<span className="session-row__meta">
  {showCollapsedSummary ? (
    <span className="session-row__summary-text">{session.collapsedSummary}</span>
  ) : null}
  <span className="session-row__meta-item">{session.durationLabel}</span>
</span>
```

- [ ] **Step 3: Soften stale-session presentation in CSS**

Add a stale/history visual class in `src/renderer/styles.css` that can be wired later from store age or renderer heuristics.

```css
.session-row--completed,
.session-row--idle,
.session-row--offline {
  opacity: 0.82;
}
```

Keep `running`/`waiting` visually stronger.

- [ ] **Step 4: Run focused UI tests**

Run: `npm test -- src/renderer/components/SessionRow.test.tsx src/renderer/styles.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/SessionRow.tsx src/renderer/components/SessionRow.test.tsx src/renderer/styles.css src/renderer/styles.test.ts
git commit -m "refactor: tighten dashboard session rows"
```

## Task 7: Update repo docs to reflect the dashboard-first Phase 1

**Files:**
- Modify: `README.md`
- Modify: `docs/context/current-status.md`

- [ ] **Step 1: Write a failing doc expectation test or checklist entry**

Use a manual checklist in this task rather than an automated doc test:

```md
- README no longer describes approval/control as the primary Phase 1 story
- current-status marks dashboard-only as the current product baseline
```

Run: `rg -n "approval|control loop|Control Deck" README.md docs/context/current-status.md`
Expected: output still contains the old framing and requires edits.

- [ ] **Step 2: Rewrite README phase summary**

Update `README.md` so the first section describes:
- unified dashboard
- session/activity/usage visibility
- settings-based integration and usage sync

and explicitly states control features are retained but not on the default UI path.

- [ ] **Step 3: Rewrite current-status phase focus**

Update `docs/context/current-status.md` to align with the new product reset:
- dashboard-first V1
- experimental controls off main path
- session expiration and ordering as active work
- agent expansion order

- [ ] **Step 4: Run lint and targeted grep validation**

Run: `npm run lint`
Expected: PASS

Run: `rg -n "Control Deck|主界面审批|control console" README.md docs/context/current-status.md`
Expected: no stale product-framing matches

- [ ] **Step 5: Commit**

```bash
git add README.md docs/context/current-status.md
git commit -m "docs: reset phase one around dashboard v1"
```

## Task 8: Full verification pass

**Files:**
- Modify: none

- [ ] **Step 1: Run focused renderer/store tests**

Run:

```bash
npm test -- src/main/session/sessionStore.test.ts src/renderer/App.test.tsx src/renderer/components/SessionRow.test.tsx src/renderer/components/SessionList.test.tsx src/renderer/components/IntegrationPanel.test.tsx src/renderer/components/CursorDashboardPanel.test.tsx src/renderer/components/UsageStatusStrip.test.tsx src/renderer/styles.test.ts
```

Expected: PASS

- [ ] **Step 2: Run full unit test suite**

Run:

```bash
npm test
```

Expected: PASS

- [ ] **Step 3: Run lint**

Run:

```bash
npm run lint
```

Expected: PASS

- [ ] **Step 4: Build the app**

Run:

```bash
npm run build
```

Expected: PASS

- [ ] **Step 5: Commit the verification checkpoint**

```bash
git add -A
git commit -m "chore: verify dashboard v1 product reset"
```

## Self-Review

### Spec Coverage

- Dashboard-first shell reset: covered by Task 1
- Experimental controls off main path: covered by Task 2
- Session auto-expiry: covered by Task 3
- Sorting stability: covered by Task 4
- Settings cleanup: covered by Task 5
- UI density polish: covered by Task 6
- Product docs reset: covered by Task 7
- End-to-end verification: covered by Task 8

### Placeholder Scan

- No `TODO`, `TBD`, or “similar to Task N” markers remain.
- All code-changing tasks include exact file targets and concrete code snippets.
- All verification steps include commands and expected outcomes.

### Type Consistency

- `StatusBar` is consistently treated as usage-only after Task 1.
- `showExperimentalControls` is introduced as the single renderer gate for pending-action UI in Task 2.
- Session ordering uses the same `compareSessions` semantics in both `SessionList` and `sessionBootstrap`.

