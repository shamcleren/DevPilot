# Session UI Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refine the monitoring panel so settings opens as an in-window drawer, sessions are easier to distinguish, history is bounded, and session details stay compact and contained.

**Architecture:** Keep the existing main-process diagnostics/install IPC and session broadcast flow, but move settings presentation fully into renderer state. Extend the shared session/store model with optional title support and bounded history cleanup, then rebuild the session list UI around explicit card expansion, compact status chips, and tool-specific visual identity.

**Tech Stack:** Electron, React, TypeScript, Vitest, CSS

---

### Task 1: Add Session Title Metadata and Bounded History Cleanup

**Files:**
- Modify: `src/shared/sessionTypes.ts`
- Modify: `src/main/session/sessionStore.ts`
- Modify: `src/main/session/sessionStore.test.ts`
- Modify: `src/renderer/monitorSession.ts`
- Modify: `src/renderer/sessionRows.ts`

- [ ] **Step 1: Write the failing store and row-mapping tests**

Add tests for:
- optional `title` surviving the shared/store pipeline
- fallback row title generation when `title` is absent
- history expiry preserving `running` and `waiting`
- history count trimming removing oldest non-current sessions only

```ts
it("preserves session title from the event payload", () => {
  const store = createSessionStore();

  store.applyEvent({
    sessionId: "s1",
    tool: "codex",
    status: "running",
    title: "Repo audit",
    task: "scan files",
    timestamp: 10,
  });

  expect(store.getSessions()[0]).toMatchObject({
    id: "s1",
    title: "Repo audit",
  });
});

it("expires only stale history sessions", () => {
  const store = createSessionStore();

  store.applyEvent({
    sessionId: "done-1",
    tool: "cursor",
    status: "completed",
    timestamp: 1,
  });
  store.applyEvent({
    sessionId: "live-1",
    tool: "cursor",
    status: "running",
    timestamp: 2,
  });

  expect(store.expireStaleSessions(8 * 24 * 60 * 60 * 1000)).toBe(true);
  expect(store.getSessions().map((session) => session.id)).toEqual(["live-1"]);
});
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `npm test -- src/main/session/sessionStore.test.ts`

Expected: FAIL because `title`, `expireStaleSessions`, and row-title fallback support do not exist yet.

- [ ] **Step 3: Add `title` to the shared and renderer row models**

Update the shared `SessionRecord` type and renderer row shape to carry optional title metadata.

```ts
export interface SessionRecord {
  id: string;
  tool: string;
  status: SessionStatus;
  title?: string;
  task?: string;
  updatedAt: number;
  activities?: string[];
  pendingActions?: PendingAction[];
}
```

```ts
export type MonitorSessionRow = SessionRecord & {
  titleLabel: string;
  shortId: string;
  updatedLabel: string;
  durationLabel: string;
  activities: string[];
  hoverSummary: string;
};
```

- [ ] **Step 4: Implement bounded session cleanup in the store**

Add store-level history cleanup alongside the existing pending sweep. Keep current sessions exempt and trim old history before applying a max-history cap.

```ts
const HISTORY_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_HISTORY_SESSIONS = 150;

function isCurrentStatus(status: SessionStatus): boolean {
  return status === "running" || status === "waiting";
}

function expireStaleSessions(now: number): boolean {
  const nextEntries = [...sessions.entries()]
    .filter(([, session]) => isCurrentStatus(session.status) || now - session.updatedAt < HISTORY_RETENTION_MS)
    .sort((a, b) => b[1].updatedAt - a[1].updatedAt);

  const current = nextEntries.filter(([, session]) => isCurrentStatus(session.status));
  const history = nextEntries
    .filter(([, session]) => !isCurrentStatus(session.status))
    .slice(0, MAX_HISTORY_SESSIONS);

  const nextSessions = new Map([...current, ...history]);
  const changed = nextSessions.size !== sessions.size;
  if (changed) {
    sessions.clear();
    for (const [id, session] of nextSessions) {
      sessions.set(id, session);
    }
  }
  return changed;
}
```

- [ ] **Step 5: Implement renderer-side title fallback formatting**

Build a non-empty title label even when upstream title is missing, and add short id / updated-at presentation fields for the new card layout.

```ts
function buildTitleLabel(record: SessionRecord): string {
  if (record.title?.trim()) return record.title.trim();
  if (record.task?.trim()) return `${record.tool.toUpperCase()} · ${record.task.trim()}`;
  return `${record.tool.toUpperCase()} · ${formatUpdatedAt(record.updatedAt)}`;
}
```

- [ ] **Step 6: Run the focused tests to verify they pass**

Run: `npm test -- src/main/session/sessionStore.test.ts`

Expected: PASS with title preservation and bounded history cleanup covered.

- [ ] **Step 7: Commit the data-model and cleanup changes**

```bash
git add src/shared/sessionTypes.ts src/main/session/sessionStore.ts src/main/session/sessionStore.test.ts src/renderer/monitorSession.ts src/renderer/sessionRows.ts
git commit -m "feat: add session titles and bounded history cleanup"
```

### Task 2: Replace the Separate Settings View with an In-App Drawer

**Files:**
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/App.test.tsx`
- Modify: `src/renderer/components/IntegrationPanel.tsx`
- Modify: `src/renderer/styles.css`
- Modify: `src/main/main.ts`
- Modify: `src/main/window/createSettingsWindow.ts`
- Modify: `src/main/window/createSettingsWindow.test.ts`

- [ ] **Step 1: Write the failing app-shell tests for drawer behavior**

Add tests that assert:
- default `App` renders sessions and a hidden settings drawer shell
- opening settings no longer depends on `initialView="settings"`
- the settings content renders inside the same app tree

```ts
it("renders settings inside a drawer shell without replacing the session view", () => {
  const html = renderToStaticMarkup(<App />);

  expect(html).toContain("CodePal");
  expect(html).toContain("Sessions");
  expect(html).toContain("app-settings-drawer");
  expect(html).toContain("aria-label=\"打开设置\"");
});
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `npm test -- src/renderer/App.test.tsx src/main/window/createSettingsWindow.test.ts`

Expected: FAIL because the renderer still branches on `initialView === "settings"` and the main process still owns a separate settings window path.

- [ ] **Step 3: Move settings visibility to renderer state**

Keep rows mounted at all times and drive settings open/close through local state.

```tsx
const [settingsOpen, setSettingsOpen] = useState(false);

function openSettingsDrawer() {
  setSettingsOpen(true);
  refreshIntegrations();
}

function closeSettingsDrawer() {
  setSettingsOpen(false);
}
```

```tsx
<button type="button" className="app-settings-trigger" onClick={openSettingsDrawer}>
  设置
</button>
<div className={`app-settings-drawer ${settingsOpen ? "app-settings-drawer--open" : ""}`}>
  <IntegrationPanel ... />
</div>
```

- [ ] **Step 4: Remove the normal separate-window settings path**

Delete the main-process `codepal:open-settings` IPC handler and stop using the standalone settings window creator for normal app navigation.

```ts
ipcMain.on("codepal:open-settings", () => {
  // removed; renderer owns settings drawer state
});
```

If `createSettingsWindow` is no longer referenced anywhere, remove the file and its tests in the same task.

- [ ] **Step 5: Add drawer interaction affordances**

Implement:
- backdrop click close
- close button
- `Escape` handling
- inline loading/error behavior while preserving current session state underneath

```tsx
{settingsOpen ? <button className="app-settings-backdrop" onClick={closeSettingsDrawer} /> : null}
```

```ts
useEffect(() => {
  if (!settingsOpen) return;
  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") closeSettingsDrawer();
  }
  window.addEventListener("keydown", onKeyDown);
  return () => window.removeEventListener("keydown", onKeyDown);
}, [settingsOpen]);
```

- [ ] **Step 6: Run the focused tests to verify they pass**

Run: `npm test -- src/renderer/App.test.tsx`

Expected: PASS with the app rendering sessions plus the in-app drawer shell.

- [ ] **Step 7: Commit the drawer shell changes**

```bash
git add src/renderer/App.tsx src/renderer/App.test.tsx src/renderer/components/IntegrationPanel.tsx src/renderer/styles.css src/main/main.ts src/main/window/createSettingsWindow.ts src/main/window/createSettingsWindow.test.ts
git commit -m "feat: move settings into in-app drawer"
```

### Task 3: Rebuild Session Rows Around Explicit Expansion and Clearer Titles

**Files:**
- Modify: `src/renderer/components/SessionList.tsx`
- Modify: `src/renderer/components/SessionList.test.tsx`
- Modify: `src/renderer/components/SessionRow.tsx`
- Modify: `src/renderer/components/SessionRow.test.tsx`
- Modify: `src/renderer/components/HoverDetails.tsx`
- Modify: `src/renderer/styles.css`

- [ ] **Step 1: Write the failing renderer tests for the new card structure**

Add tests for:
- title / task separation
- short session id rendering
- single expanded row at a time
- pending actions rendered inside the expandable details region

```ts
it("renders title and secondary meta separately", () => {
  const html = renderToStaticMarkup(
    <SessionRow session={baseRow({ titleLabel: "Codex · review diff", task: "scan files", shortId: "9af3" })} onRespond={vi.fn()} />
  );

  expect(html).toContain("Codex · review diff");
  expect(html).toContain("scan files");
  expect(html).toContain("9af3");
});
```

```ts
it("renders pending actions inside the expanded details container", () => {
  const html = renderToStaticMarkup(
    <SessionRow session={baseRow({ pendingActions: [{ id: "a1", type: "approval", title: "Proceed?", options: ["Yes", "No"] }] })} expanded onToggleExpanded={vi.fn()} onRespond={vi.fn()} />
  );

  expect(html).toContain("session-row__details");
  expect(html).toContain("Proceed?");
});
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `npm test -- src/renderer/components/SessionRow.test.tsx src/renderer/components/SessionList.test.tsx`

Expected: FAIL because the current row is flat, hover-driven, and has no explicit expansion state.

- [ ] **Step 3: Move expansion state up to `SessionList`**

Track a single expanded session id and pass `expanded` / `onToggleExpanded` into each row.

```tsx
const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);

function toggleExpanded(sessionId: string) {
  setExpandedSessionId((current) => (current === sessionId ? null : sessionId));
}
```

- [ ] **Step 4: Replace hover-only details with an explicit contained details panel**

Make the row header clickable, keep details inside the card, and put activities plus pending actions inside the contained details block.

```tsx
<article className={`session-row ${expanded ? "session-row--expanded" : ""}`}>
  <button type="button" className="session-row__summary" onClick={() => onToggleExpanded(session.id)}>
    <span className="session-row__title">{session.titleLabel}</span>
    <span className="session-row__task">{session.task ?? "No task details"}</span>
  </button>
  {expanded ? (
    <div className="session-row__details">
      <HoverDetails activities={session.activities} summary={session.hoverSummary} />
      {renderPendingActions(session.pendingActions)}
    </div>
  ) : null}
</article>
```

- [ ] **Step 5: Keep details compact and scrollable**

Style the details region with max-height and internal scrolling so it never obscures lower rows by overflowing outside its own card.

```css
.session-row__details {
  max-height: 220px;
  overflow: auto;
  border-top: 1px solid var(--border);
}
```

- [ ] **Step 6: Run the focused tests to verify they pass**

Run: `npm test -- src/renderer/components/SessionRow.test.tsx src/renderer/components/SessionList.test.tsx`

Expected: PASS with title separation, single-row expansion, and contained details covered.

- [ ] **Step 7: Commit the session-card interaction changes**

```bash
git add src/renderer/components/SessionList.tsx src/renderer/components/SessionList.test.tsx src/renderer/components/SessionRow.tsx src/renderer/components/SessionRow.test.tsx src/renderer/components/HoverDetails.tsx src/renderer/styles.css
git commit -m "feat: redesign session cards with contained details"
```

### Task 4: Compact the Status Bar and Add Tool-Specific Visual Identity

**Files:**
- Modify: `src/renderer/components/StatusBar.tsx`
- Modify: `src/renderer/components/SessionRow.tsx`
- Modify: `src/renderer/styles.css`
- Modify: `src/renderer/styles.test.ts`
- Modify: `src/renderer/components/SessionRow.test.tsx`

- [ ] **Step 1: Write the failing compact-status and icon tests**

Add tests that assert:
- the status bar renders as a single compact row
- Codex and Cursor expose distinct tool-marker classes or SVG labels

```ts
it("renders tool-specific markers for codex and cursor", () => {
  const codexHtml = renderToStaticMarkup(<SessionRow session={baseRow({ tool: "codex" })} onRespond={vi.fn()} />);
  const cursorHtml = renderToStaticMarkup(<SessionRow session={baseRow({ tool: "cursor" })} onRespond={vi.fn()} />);

  expect(codexHtml).toContain("tool-icon--codex");
  expect(cursorHtml).toContain("tool-icon--cursor");
});
```

```ts
expect(css).toMatch(/\.status-bar\s*\{[\s\S]*align-items:\s*center;/);
expect(css).toMatch(/\.status-bar\s*\{[\s\S]*padding:\s*6px 10px;/);
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `npm test -- src/renderer/components/SessionRow.test.tsx src/renderer/styles.test.ts`

Expected: FAIL because the current status bar uses a taller block layout and the tool icon is only a text badge.

- [ ] **Step 3: Replace text badges with tool-marker components**

Implement renderer-owned tool markers with distinct classes and lightweight SVG/glyph treatment.

```tsx
<span className={`tool-icon tool-icon--${toolKey}`} aria-hidden="true">
  {toolKey === "codex" ? <svg viewBox="0 0 16 16">...</svg> : null}
  {toolKey === "cursor" ? <svg viewBox="0 0 16 16">...</svg> : null}
</span>
```

- [ ] **Step 4: Compress the status bar and row status pills**

Reduce the top status bar height, simplify labels, and make row-level status smaller so titles lead the scan order.

```tsx
<section className="status-bar" aria-label="Task status distribution">
  <div className="status-chip status-chip--running">Run {counts.running}</div>
  <div className="status-chip status-chip--waiting">Wait {counts.waiting}</div>
  <div className="status-chip status-chip--error">Err {counts.error}</div>
</section>
```

- [ ] **Step 5: Run the focused tests to verify they pass**

Run: `npm test -- src/renderer/components/SessionRow.test.tsx src/renderer/styles.test.ts`

Expected: PASS with compact status layout and tool-specific markers covered.

- [ ] **Step 6: Commit the visual identity changes**

```bash
git add src/renderer/components/StatusBar.tsx src/renderer/components/SessionRow.tsx src/renderer/styles.css src/renderer/styles.test.ts src/renderer/components/SessionRow.test.tsx
git commit -m "feat: compact status bar and add tool markers"
```

### Task 5: Run Full Verification and Update Any Broken Expectations

**Files:**
- Modify: `src/renderer/App.test.tsx`
- Modify: `src/renderer/components/IntegrationPanel.test.tsx`
- Modify: `src/renderer/sessionBootstrap.test.ts`
- Modify: any snapshots or assertions broken by the new session/title UI

- [ ] **Step 1: Run the renderer and store test suite**

Run: `npm test -- src/renderer/App.test.tsx src/renderer/components/IntegrationPanel.test.tsx src/renderer/components/SessionList.test.tsx src/renderer/components/SessionRow.test.tsx src/main/session/sessionStore.test.ts src/renderer/styles.test.ts`

Expected: PASS.

- [ ] **Step 2: Run project lint**

Run: `npm run lint`

Expected: PASS.

- [ ] **Step 3: Run the full project test suite**

Run: `npm test`

Expected: PASS.

- [ ] **Step 4: Run the production build**

Run: `npm run build`

Expected: PASS.

- [ ] **Step 5: Commit the final UI refinement pass**

```bash
git add src/renderer/App.test.tsx src/renderer/components/IntegrationPanel.test.tsx src/renderer/sessionBootstrap.test.ts src/renderer/components/SessionList.test.tsx src/renderer/components/SessionRow.test.tsx src/main/session/sessionStore.test.ts src/renderer/styles.test.ts
git commit -m "test: verify session ui refinement"
```
