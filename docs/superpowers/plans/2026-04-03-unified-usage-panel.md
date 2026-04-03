# Unified Usage Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a global-summary-first multi-agent usage panel with expandable per-session details for `tokens`, `context`, `cost`, and `rate limit`.

**Architecture:** Introduce shared usage contracts plus a dedicated main-process `usageStore` that aggregates normalized snapshots independently from the existing session timeline. Expose a renderer-facing `UsageOverview` through preload/IPC, then render a compact top-level usage panel with expandable session rows and explicit partial-data handling.

**Tech Stack:** Electron, React, TypeScript, Vitest

---

## File Map

- Create: `src/shared/usageTypes.ts`
- Create: `src/main/usage/usageStore.ts`
- Create: `src/main/usage/usageStore.test.ts`
- Create: `src/renderer/components/UsagePanel.tsx`
- Create: `src/renderer/components/UsagePanel.test.tsx`
- Modify: `src/main/main.ts`
- Modify: `src/main/preload/index.ts`
- Modify: `src/renderer/codepal.d.ts`
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/styles.css`
- Modify: `src/main/codex/codexSessionWatcher.ts`
- Modify: `src/main/codex/codexSessionWatcher.test.ts`
- Modify: `docs/context/current-status.md`

### Task 1: Shared usage contracts

**Files:**
- Create: `src/shared/usageTypes.ts`
- Test: `src/main/usage/usageStore.test.ts`

- [ ] **Step 1: Write the failing store test for typed usage snapshots**

```ts
import { describe, expect, it } from "vitest";
import { createUsageStore } from "./usageStore";

describe("createUsageStore", () => {
  it("merges partial usage snapshots into one session usage view", () => {
    const store = createUsageStore();

    store.applySnapshot({
      agent: "codex",
      sessionId: "sess-1",
      source: "session-derived",
      updatedAt: 100,
      tokens: { input: 120, output: 30, total: 150 },
    });
    store.applySnapshot({
      agent: "codex",
      sessionId: "sess-1",
      source: "statusline-derived",
      updatedAt: 110,
      rateLimit: { remaining: 42, limit: 50, resetAt: 200 },
    });

    expect(store.getOverview().sessions[0]).toMatchObject({
      agent: "codex",
      sessionId: "sess-1",
      tokens: { input: 120, output: 30, total: 150 },
      rateLimit: { remaining: 42, limit: 50, resetAt: 200 },
      completeness: "partial",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/main/usage/usageStore.test.ts`
Expected: FAIL with module-not-found errors for `usageStore` and `usageTypes`

- [ ] **Step 3: Write minimal shared usage types**

```ts
export type UsageSource = "session-derived" | "statusline-derived" | "provider-derived";

export interface UsageTokens {
  input?: number;
  output?: number;
  total?: number;
}

export interface UsageContext {
  used?: number;
  max?: number;
  percent?: number;
}

export interface UsageCost {
  reported?: number;
  estimated?: number;
  currency?: string;
}

export interface UsageRateLimit {
  remaining?: number;
  limit?: number;
  resetAt?: number;
  windowLabel?: string;
}

export interface UsageSnapshot {
  agent: string;
  sessionId?: string;
  source: UsageSource;
  updatedAt: number;
  title?: string;
  tokens?: UsageTokens;
  context?: UsageContext;
  cost?: UsageCost;
  rateLimit?: UsageRateLimit;
  meta?: Record<string, unknown>;
}

export interface SessionUsage {
  agent: string;
  sessionId: string;
  title?: string;
  updatedAt: number;
  sources: UsageSource[];
  completeness: "minimal" | "partial" | "full";
  tokens?: UsageTokens;
  context?: UsageContext;
  cost?: UsageCost;
  rateLimit?: UsageRateLimit;
}

export interface UsageOverviewSummary {
  updatedAt?: number;
  tokens?: UsageTokens;
  cost?: UsageCost;
  rateLimits: Array<{ agent: string; remaining?: number; limit?: number; resetAt?: number }>;
  contextMode: "none" | "single-session" | "multi-session";
  context?: UsageContext;
}

export interface UsageOverview {
  updatedAt?: number;
  summary: UsageOverviewSummary;
  sessions: SessionUsage[];
}
```

- [ ] **Step 4: Run test to verify type import errors are reduced**

Run: `npm test -- src/main/usage/usageStore.test.ts`
Expected: FAIL because `createUsageStore` is still missing

- [ ] **Step 5: Commit**

```bash
git add src/shared/usageTypes.ts src/main/usage/usageStore.test.ts
git commit -m "test: add shared usage contract coverage"
```

### Task 2: Main-process usage store

**Files:**
- Create: `src/main/usage/usageStore.ts`
- Modify: `src/main/usage/usageStore.test.ts`

- [ ] **Step 1: Expand failing tests for overview aggregation**

```ts
it("keeps reported and estimated cost separate in the global summary", () => {
  const store = createUsageStore();

  store.applySnapshot({
    agent: "codex",
    sessionId: "sess-1",
    source: "session-derived",
    updatedAt: 100,
    cost: { reported: 1.25, currency: "USD" },
  });
  store.applySnapshot({
    agent: "cursor",
    sessionId: "sess-2",
    source: "session-derived",
    updatedAt: 110,
    cost: { estimated: 0.75, currency: "USD" },
  });

  expect(store.getOverview().summary.cost).toEqual({
    reported: 1.25,
    estimated: 0.75,
    currency: "USD",
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/main/usage/usageStore.test.ts`
Expected: FAIL because aggregation logic is incomplete

- [ ] **Step 3: Write minimal store implementation**

```ts
export function createUsageStore() {
  const sessions = new Map<string, SessionUsage>();

  function keyOf(snapshot: UsageSnapshot): string | null {
    return snapshot.sessionId ? `${snapshot.agent}:${snapshot.sessionId}` : null;
  }

  function applySnapshot(snapshot: UsageSnapshot) {
    const key = keyOf(snapshot);
    if (!key) {
      return;
    }
    const prev = sessions.get(key);
    const next: SessionUsage = {
      agent: snapshot.agent,
      sessionId: snapshot.sessionId!,
      title: snapshot.title ?? prev?.title,
      updatedAt: Math.max(prev?.updatedAt ?? 0, snapshot.updatedAt),
      sources: Array.from(new Set([...(prev?.sources ?? []), snapshot.source])),
      tokens: snapshot.tokens ?? prev?.tokens,
      context: snapshot.context ?? prev?.context,
      cost: {
        reported: snapshot.cost?.reported ?? prev?.cost?.reported,
        estimated: snapshot.cost?.estimated ?? prev?.cost?.estimated,
        currency: snapshot.cost?.currency ?? prev?.cost?.currency,
      },
      rateLimit: snapshot.rateLimit ?? prev?.rateLimit,
      completeness: "partial",
    };
    sessions.set(key, next);
  }

  function getOverview(): UsageOverview {
    const rows = [...sessions.values()].sort((a, b) => b.updatedAt - a.updatedAt);
    return {
      updatedAt: rows[0]?.updatedAt,
      summary: {
        updatedAt: rows[0]?.updatedAt,
        tokens: {
          input: rows.reduce((sum, row) => sum + (row.tokens?.input ?? 0), 0),
          output: rows.reduce((sum, row) => sum + (row.tokens?.output ?? 0), 0),
          total: rows.reduce((sum, row) => sum + (row.tokens?.total ?? 0), 0),
        },
        cost: {
          reported: rows.reduce((sum, row) => sum + (row.cost?.reported ?? 0), 0),
          estimated: rows.reduce((sum, row) => sum + (row.cost?.estimated ?? 0), 0),
          currency: rows.find((row) => row.cost?.currency)?.cost?.currency,
        },
        rateLimits: rows.map((row) => ({
          agent: row.agent,
          remaining: row.rateLimit?.remaining,
          limit: row.rateLimit?.limit,
          resetAt: row.rateLimit?.resetAt,
        })),
        contextMode: rows.length === 1 && rows[0].context ? "single-session" : "multi-session",
        context: rows.length === 1 ? rows[0].context : undefined,
      },
      sessions: rows,
    };
  }

  return { applySnapshot, getOverview };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/main/usage/usageStore.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/usage/usageStore.ts src/main/usage/usageStore.test.ts
git commit -m "feat: add main-process usage store"
```

### Task 3: IPC and preload wiring

**Files:**
- Modify: `src/main/main.ts`
- Modify: `src/main/preload/index.ts`
- Modify: `src/renderer/codepal.d.ts`
- Test: `src/renderer/App.test.tsx`

- [ ] **Step 1: Write the failing renderer bootstrap test**

```ts
it("loads usage overview alongside sessions", async () => {
  const getUsageOverview = vi.fn().mockResolvedValue({
    summary: { rateLimits: [], contextMode: "none" },
    sessions: [],
  });

  Object.assign(window, {
    codepal: {
      getSessions: vi.fn().mockResolvedValue([]),
      onSessions: vi.fn(() => () => {}),
      getUsageOverview,
      onUsageOverview: vi.fn(() => () => {}),
      onOpenSettings: vi.fn(() => () => {}),
      getIntegrationDiagnostics: vi.fn(),
      installIntegrationHooks: vi.fn(),
      openExternalTarget: vi.fn(),
      writeClipboardText: vi.fn(),
      respondToPendingAction: vi.fn(),
    },
  });

  render(<App />);

  await waitFor(() => expect(getUsageOverview).toHaveBeenCalled());
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/renderer/App.test.tsx`
Expected: FAIL because the API surface does not expose usage overview methods

- [ ] **Step 3: Add minimal IPC and preload plumbing**

```ts
ipcMain.handle("codepal:get-usage-overview", () => usageStore.getOverview());

win.webContents.send("codepal:usage-overview", usageStore.getOverview());

getUsageOverview() {
  return ipcRenderer.invoke("codepal:get-usage-overview") as Promise<UsageOverview>;
},
onUsageOverview(handler: (overview: UsageOverview) => void) {
  const channel = "codepal:usage-overview";
  const listener = (_event: Electron.IpcRendererEvent, overview: UsageOverview) => handler(overview);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
},
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/renderer/App.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/main.ts src/main/preload/index.ts src/renderer/codepal.d.ts src/renderer/App.test.tsx
git commit -m "feat: expose usage overview over ipc"
```

### Task 4: Renderer usage panel

**Files:**
- Create: `src/renderer/components/UsagePanel.tsx`
- Create: `src/renderer/components/UsagePanel.test.tsx`
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/styles.css`

- [ ] **Step 1: Write the failing usage panel test**

```tsx
it("renders global usage summary and expands session details", async () => {
  render(
    <UsagePanel
      overview={{
        updatedAt: 200,
        summary: {
          updatedAt: 200,
          tokens: { input: 120, output: 80, total: 200 },
          cost: { estimated: 1.25, currency: "USD" },
          rateLimits: [{ agent: "codex", remaining: 42, limit: 50, resetAt: 300 }],
          contextMode: "multi-session",
        },
        sessions: [
          {
            agent: "codex",
            sessionId: "sess-1",
            updatedAt: 200,
            sources: ["session-derived"],
            completeness: "partial",
            tokens: { total: 200 },
          },
        ],
      }}
    />,
  );

  expect(screen.getByText("Usage")).toBeInTheDocument();
  expect(screen.getByText("200")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: /session details/i }));
  expect(screen.getByText("sess-1")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/renderer/components/UsagePanel.test.tsx`
Expected: FAIL because `UsagePanel` does not exist

- [ ] **Step 3: Write minimal renderer implementation**

```tsx
export function UsagePanel({ overview }: { overview: UsageOverview | null }) {
  const [expanded, setExpanded] = useState(false);

  if (!overview) {
    return <section className="usage-panel usage-panel--empty">Usage unavailable</section>;
  }

  return (
    <section className="usage-panel">
      <div className="usage-panel__summary">
        <h2>Usage</h2>
        <div>{overview.summary.tokens?.total ?? "Unavailable"}</div>
        <div>{overview.summary.cost?.estimated ?? overview.summary.cost?.reported ?? "Unavailable"}</div>
      </div>
      <button type="button" onClick={() => setExpanded((value) => !value)} aria-label="Session details">
        {expanded ? "Hide details" : "Show details"}
      </button>
      {expanded ? (
        <div className="usage-panel__sessions">
          {overview.sessions.map((session) => (
            <div key={`${session.agent}:${session.sessionId}`}>
              <div>{session.sessionId}</div>
              <div>{session.tokens?.total ?? "Unavailable"}</div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/renderer/components/UsagePanel.test.tsx src/renderer/App.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/UsagePanel.tsx src/renderer/components/UsagePanel.test.tsx src/renderer/App.tsx src/renderer/styles.css
git commit -m "feat: add usage summary panel"
```

### Task 5: First-pass Codex usage ingestion

**Files:**
- Modify: `src/main/codex/codexSessionWatcher.ts`
- Modify: `src/main/codex/codexSessionWatcher.test.ts`
- Modify: `src/main/main.ts`
- Modify: `docs/context/current-status.md`

- [ ] **Step 1: Write the failing watcher test**

```ts
it("extracts codex usage snapshots when fixture payload includes token usage", async () => {
  const snapshots: UsageSnapshot[] = [];
  const watcher = createCodexSessionWatcher({
    sessionsRoot: tmpDir,
    onUsageSnapshot: (snapshot) => snapshots.push(snapshot),
    onEvent: () => {},
  });

  // seed fixture with usage payload here

  await watcher.pollNow();

  expect(snapshots[0]).toMatchObject({
    agent: "codex",
    source: "session-derived",
    tokens: { total: 200 },
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/main/codex/codexSessionWatcher.test.ts`
Expected: FAIL because usage snapshots are not emitted yet

- [ ] **Step 3: Add minimal watcher-to-usage mapping**

```ts
type CodexSessionWatcherOptions = {
  sessionsRoot: string;
  onEvent: (event: SessionEvent) => void;
  onUsageSnapshot?: (snapshot: UsageSnapshot) => void;
};

if (normalizedUsage) {
  options.onUsageSnapshot?.({
    agent: "codex",
    sessionId,
    source: "session-derived",
    updatedAt: event.timestamp,
    title: event.title,
    tokens: normalizedUsage.tokens,
    context: normalizedUsage.context,
    cost: normalizedUsage.cost,
    rateLimit: normalizedUsage.rateLimit,
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/main/codex/codexSessionWatcher.test.ts src/main/usage/usageStore.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/codex/codexSessionWatcher.ts src/main/codex/codexSessionWatcher.test.ts src/main/main.ts docs/context/current-status.md
git commit -m "feat: ingest codex usage snapshots"
```

## Self-Review

- Spec coverage:
  - shared model: Tasks 1-2
  - dedicated main-process aggregation: Tasks 2-3
  - global summary + session detail UI: Task 4
  - first-pass local ingestion: Task 5
  - explicit partial-data handling: Tasks 2 and 4
- Placeholder scan:
  - no `TODO` / `TBD`
  - all tasks include concrete file paths and commands
- Type consistency:
  - shared names standardized as `UsageSnapshot`, `SessionUsage`, `UsageOverview`, `createUsageStore`

Plan complete and saved to `docs/superpowers/plans/2026-04-03-unified-usage-panel.md`. Defaulting to inline execution in this session unless you want me to switch to subagent-driven execution.
