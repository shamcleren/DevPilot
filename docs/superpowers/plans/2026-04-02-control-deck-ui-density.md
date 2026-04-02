# Control Deck UI Density Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the current monitoring panel into a denser control-deck UI with higher-value collapsed summaries, layered expanded context, and a future-ready interaction slot.

**Architecture:** Keep the existing Electron + renderer shell and session broadcast flow, but enrich the renderer row model with derived summary and timeline presentation data. Use renderer-side extraction first so the UI can distinguish dialog, tool calls, and system events without forcing a broad protocol redesign, then rebuild the session card and expanded context layout around that richer presentation model.

**Tech Stack:** Electron, React, TypeScript, Vitest, CSS

---

### Task 1: Add Renderer-Side Summary Extraction and Timeline Classification

**Files:**
- Modify: `src/renderer/monitorSession.ts`
- Modify: `src/renderer/sessionRows.ts`
- Modify: `src/renderer/sessionBootstrap.test.ts`
- Create: `src/renderer/sessionRows.test.ts`

- [ ] **Step 1: Write failing tests for collapsed summary extraction and event grouping**

Add tests for:
- pending action title winning the collapsed summary
- long dialog text reducing to the last meaningful sentence
- tool-call activity lines mapping to tool timeline items
- generic state lines degrading to system timeline items

```ts
it("uses the last meaningful sentence from a dialog-like activity line", () => {
  const row = sessionRecordToRow({
    id: "codex-1",
    tool: "codex",
    status: "running",
    updatedAt: 1_700_000_000_000,
    activities: [
      "Agent: 我已经完成比对。最后需要你确认是否继续合并？",
      "Tool call: Bash",
    ],
  });

  expect(row.collapsedSummary).toBe("最后需要你确认是否继续合并？");
});
```

```ts
it("classifies tool-call activities separately from system events", () => {
  const row = sessionRecordToRow({
    id: "cursor-1",
    tool: "cursor",
    status: "waiting",
    updatedAt: 1_700_000_000_000,
    activities: [
      "Tool call: Bash",
      "Closed action a1 (consumed_local)",
    ],
  });

  expect(row.timelineItems.map((item) => item.kind)).toEqual(["tool", "system"]);
});
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `npm test -- src/renderer/sessionRows.test.ts src/renderer/sessionBootstrap.test.ts`

Expected: FAIL because the row model does not yet expose `collapsedSummary`, `pendingCount`, or classified timeline items.

- [ ] **Step 3: Extend the renderer row model with derived control-deck presentation fields**

Add explicit presentation fields needed by the denser UI.

```ts
export type TimelineItem = {
  id: string;
  kind: "dialog" | "tool" | "system";
  label: string;
  body: string;
};

export type MonitorSessionRow = SessionRecord & {
  titleLabel: string;
  shortId: string;
  updatedLabel: string;
  durationLabel: string;
  pendingCount: number;
  collapsedSummary: string;
  timelineItems: TimelineItem[];
  activities: string[];
  hoverSummary: string;
};
```

- [ ] **Step 4: Implement summary extraction and timeline classification in `sessionRows.ts`**

Add helpers that:
- split dialog-like text into sentences
- choose the last meaningful sentence
- classify activity strings into dialog/tool/system items
- fall back conservatively when data is ambiguous

```ts
function lastMeaningfulSentence(text: string): string {
  const parts = text
    .split(/(?<=[。！？?!])/)
    .map((part) => part.trim())
    .filter(Boolean);
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const candidate = parts[index];
    if (!["好的", "继续", "嗯"].includes(candidate)) {
      return candidate;
    }
  }
  return text.trim();
}
```

```ts
function buildCollapsedSummary(record: SessionRecord, timelineItems: TimelineItem[]): string {
  const pendingTitle = record.pendingActions?.[0]?.title?.trim();
  if (pendingTitle) return pendingTitle;
  const latest = timelineItems[0];
  if (!latest) return record.task?.trim() || record.status;
  return latest.kind === "dialog" ? lastMeaningfulSentence(latest.body) : latest.body;
}
```

- [ ] **Step 5: Update bootstrap tests to use the new derived fields**

Expand session bootstrap expectations to cover:
- `collapsedSummary`
- `pendingCount`
- non-empty `timelineItems`

```ts
expect(rows[0]).toMatchObject({
  collapsedSummary: "Pick one",
  pendingCount: 1,
});
expect(rows[0].timelineItems[0]?.kind).toBe("system");
```

- [ ] **Step 6: Run the focused tests to verify they pass**

Run: `npm test -- src/renderer/sessionRows.test.ts src/renderer/sessionBootstrap.test.ts`

Expected: PASS with summary extraction and timeline grouping covered.

- [ ] **Step 7: Commit the row-model enrichment**

```bash
git add src/renderer/monitorSession.ts src/renderer/sessionRows.ts src/renderer/sessionRows.test.ts src/renderer/sessionBootstrap.test.ts
git commit -m "feat: derive control deck session summaries"
```

### Task 2: Redesign the Collapsed Session Card for Higher Information Density

**Files:**
- Modify: `src/renderer/components/SessionRow.tsx`
- Modify: `src/renderer/components/SessionRow.test.tsx`
- Modify: `src/renderer/components/SessionList.test.tsx`
- Modify: `src/renderer/styles.css`
- Modify: `src/renderer/styles.test.ts`

- [ ] **Step 1: Write failing tests for the denser two-line card structure**

Add tests that assert:
- line 1 renders title, state, and recent time
- line 2 renders collapsed summary, pending count, duration, and short id
- long summaries do not dump the full original activity text

```ts
it("renders the control-deck collapsed summary line", () => {
  const html = renderToStaticMarkup(
    <SessionRow
      session={baseRow({
        collapsedSummary: "最后需要你确认是否继续合并？",
        pendingCount: 2,
        updatedLabel: "04-02 18:10",
        durationLabel: "14m",
        shortId: "8af3",
      })}
      expanded={false}
      onToggleExpanded={vi.fn()}
      onRespond={vi.fn()}
    />,
  );

  expect(html).toContain("最后需要你确认是否继续合并？");
  expect(html).toContain("2 pending");
  expect(html).toContain("04-02 18:10");
  expect(html).toContain("#8af3");
});
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `npm test -- src/renderer/components/SessionRow.test.tsx src/renderer/components/SessionList.test.tsx src/renderer/styles.test.ts`

Expected: FAIL because the row currently renders task text directly instead of the new dense control-deck summary line.

- [ ] **Step 3: Update `SessionRow` to render the two-line control-deck layout**

Restructure the collapsed card into:
- top strip: tool marker, title, state, recent time
- lower strip: collapsed summary, pending count, duration, short id

```tsx
<span className="session-row__topline">
  <span className="tool-name">{meta.label}</span>
  <span className="session-row__title">{session.titleLabel}</span>
  <span className={`state ${stateClass}`}>{stateLabel}</span>
  <span className="session-row__time">{session.updatedLabel}</span>
</span>
<span className="session-row__meta">
  <span className="session-row__summary">{session.collapsedSummary}</span>
  {session.pendingCount > 0 ? <span className="session-row__pending">{session.pendingCount} pending</span> : null}
  <span className="session-row__meta-item">{session.durationLabel}</span>
  <span className="session-row__meta-item">#{session.shortId}</span>
</span>
```

- [ ] **Step 4: Tighten collapsed-card styling without reducing scannability**

Update CSS so the collapsed card becomes denser but remains clipped and readable.

```css
.session-row__summary {
  min-width: 0;
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: color-mix(in srgb, var(--text) 84%, var(--muted));
}

.session-row__pending {
  padding: 2px 7px;
  border-radius: 999px;
  background: rgba(245, 158, 11, 0.12);
  color: var(--waiting);
}
```

- [ ] **Step 5: Run the focused tests to verify they pass**

Run: `npm test -- src/renderer/components/SessionRow.test.tsx src/renderer/components/SessionList.test.tsx src/renderer/styles.test.ts`

Expected: PASS with the denser collapsed card covered.

- [ ] **Step 6: Commit the collapsed card redesign**

```bash
git add src/renderer/components/SessionRow.tsx src/renderer/components/SessionRow.test.tsx src/renderer/components/SessionList.test.tsx src/renderer/styles.css src/renderer/styles.test.ts
git commit -m "feat: redesign collapsed sessions as control deck cards"
```

### Task 3: Replace the Expanded Flat Details Block with a Layered Full-Context Panel

**Files:**
- Modify: `src/renderer/components/HoverDetails.tsx`
- Modify: `src/renderer/components/SessionRow.tsx`
- Modify: `src/renderer/components/SessionRow.test.tsx`
- Modify: `src/renderer/styles.css`

- [ ] **Step 1: Write failing tests for the layered expanded context panel**

Add tests that assert:
- expanded panels render an overview strip
- timeline items are grouped by type styling
- the bottom interaction zone exists even when there are no pending actions

```ts
it("renders a full-context panel with overview, timeline, and interaction slot", () => {
  const html = renderToStaticMarkup(
    <SessionRow
      session={baseRow({
        collapsedSummary: "最后需要你确认是否继续合并？",
        timelineItems: [
          { id: "1", kind: "dialog", label: "Agent", body: "最后需要你确认是否继续合并？" },
          { id: "2", kind: "tool", label: "Bash", body: "git diff --stat" },
          { id: "3", kind: "system", label: "Event", body: "Closed action a1 (consumed_local)" },
        ],
      })}
      expanded
      onToggleExpanded={vi.fn()}
      onRespond={vi.fn()}
    />,
  );

  expect(html).toContain("session-row__overview");
  expect(html).toContain("session-timeline");
  expect(html).toContain("session-row__interaction");
});
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `npm test -- src/renderer/components/SessionRow.test.tsx`

Expected: FAIL because the expanded content still uses the old summary/list block.

- [ ] **Step 3: Replace `HoverDetails` with a typed timeline renderer**

Repurpose or replace `HoverDetails` so it renders typed timeline items instead of treating all activity lines the same.

```tsx
export function SessionTimeline({ items }: { items: TimelineItem[] }) {
  return (
    <div className="session-timeline" role="region" aria-label="Session timeline">
      {items.map((item) => (
        <div key={item.id} className={`session-timeline__item session-timeline__item--${item.kind}`}>
          <div className="session-timeline__label">{item.label}</div>
          <div className="session-timeline__body">{item.body}</div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Rebuild the expanded section into overview + timeline + interaction slot**

Move from a single generic details block to three explicit sections.

```tsx
<div className="session-row__details">
  <div className="session-row__overview">
    <span>{meta.label}</span>
    <span>{session.titleLabel}</span>
    <span>{session.collapsedSummary}</span>
  </div>
  <SessionTimeline items={session.timelineItems} />
  <div className="session-row__interaction">
    {renderPendingActions(session.pendingActions)}
  </div>
</div>
```

- [ ] **Step 5: Add CSS hierarchy for dialog / tool / system entries**

Style each timeline item kind with different scale and weight.

```css
.session-timeline__item--dialog .session-timeline__body {
  font-size: 13px;
  line-height: 1.55;
}

.session-timeline__item--tool .session-timeline__body {
  font-size: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.session-timeline__item--system .session-timeline__body {
  font-size: 11px;
  color: var(--muted);
}
```

- [ ] **Step 6: Run the focused tests to verify they pass**

Run: `npm test -- src/renderer/components/SessionRow.test.tsx`

Expected: PASS with layered expanded context covered.

- [ ] **Step 7: Commit the expanded context redesign**

```bash
git add src/renderer/components/HoverDetails.tsx src/renderer/components/SessionRow.tsx src/renderer/components/SessionRow.test.tsx src/renderer/styles.css
git commit -m "feat: add layered expanded session context"
```

### Task 4: Upgrade the Control-Deck Visual System and Interaction Polish

**Files:**
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/components/StatusBar.tsx`
- Modify: `src/renderer/components/IntegrationPanel.tsx`
- Modify: `src/renderer/styles.css`
- Modify: `src/renderer/styles.test.ts`
- Modify: `src/renderer/App.test.tsx`

- [ ] **Step 1: Write failing tests for the refined control-deck shell**

Add tests that assert:
- app header includes stronger panel framing
- status bar remains compact
- settings drawer still renders inside the same shell

```ts
expect(html).toContain("app-shell");
expect(html).toContain("app-header__meta");
expect(html).toContain("app-settings-drawer");
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `npm test -- src/renderer/App.test.tsx src/renderer/styles.test.ts`

Expected: FAIL because the app shell still uses the simpler first-pass layout and styling.

- [ ] **Step 3: Rework the shell styling toward a refined control-deck aesthetic**

Add:
- stronger atmospheric background treatment
- more intentional surface layering
- tighter header/status relationships
- restrained transitions for drawer and expanded cards

```css
.app-shell {
  position: relative;
  background:
    radial-gradient(circle at top left, rgba(61, 224, 194, 0.08), transparent 35%),
    radial-gradient(circle at top right, rgba(96, 165, 250, 0.08), transparent 38%),
    linear-gradient(180deg, #0b1016, #0f141c 42%, #111720);
}
```

- [ ] **Step 4: Make `waiting` the highest-attention visual state without over-highlighting everything else**

Adjust status pills and pending badges so `waiting` is brightest, `running` is active, and `error` remains sharp but localized.

```css
.state-waiting {
  box-shadow: 0 0 0 1px rgba(255, 190, 92, 0.22), 0 0 18px rgba(255, 176, 64, 0.12);
}
```

- [ ] **Step 5: Run the focused tests to verify they pass**

Run: `npm test -- src/renderer/App.test.tsx src/renderer/styles.test.ts`

Expected: PASS with control-deck shell coverage restored.

- [ ] **Step 6: Commit the visual system polish**

```bash
git add src/renderer/App.tsx src/renderer/components/StatusBar.tsx src/renderer/components/IntegrationPanel.tsx src/renderer/styles.css src/renderer/styles.test.ts src/renderer/App.test.tsx
git commit -m "feat: polish the control deck shell"
```

### Task 5: Verify the Full UI Refinement End-to-End

**Files:**
- Modify: any tests or small assertions needed to match the final UI wording

- [ ] **Step 1: Run the focused renderer suite**

Run: `npm test -- src/renderer/App.test.tsx src/renderer/sessionRows.test.ts src/renderer/sessionBootstrap.test.ts src/renderer/components/SessionList.test.tsx src/renderer/components/SessionRow.test.tsx src/renderer/styles.test.ts`

Expected: PASS.

- [ ] **Step 2: Run the store suite to ensure the richer renderer assumptions still sit on valid session data**

Run: `npm test -- src/main/session/sessionStore.test.ts`

Expected: PASS.

- [ ] **Step 3: Run project lint**

Run: `npm run lint`

Expected: PASS.

- [ ] **Step 4: Run the full project test suite**

Run: `npm test`

Expected: PASS.

- [ ] **Step 5: Run the production build**

Run: `npm run build`

Expected: PASS.

- [ ] **Step 6: Commit the verified control-deck UI refinement**

```bash
git add src/renderer/App.test.tsx src/renderer/sessionRows.test.ts src/renderer/sessionBootstrap.test.ts src/renderer/components/SessionList.test.tsx src/renderer/components/SessionRow.test.tsx src/renderer/styles.test.ts src/main/session/sessionStore.test.ts
git commit -m "test: verify control deck ui density"
```
