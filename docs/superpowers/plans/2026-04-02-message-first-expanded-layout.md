# Message-First Expanded Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild expanded session detail so CodePal still scans like a monitoring panel when collapsed, but reveals agent progress as a message-first work stream when expanded.

**Architecture:** Keep the existing collapsed card shell and session store intact, but enrich the renderer-side timeline model from three coarse types into content-oriented work items. Use that richer renderer model to replace the current generic expanded inspector with a layout built from thin metadata, a current progress line, message blocks, work artifact blocks, and muted system notes.

**Tech Stack:** Electron, React, TypeScript, Vitest, CSS

---

### Task 1: Enrich Renderer Timeline Items Beyond `dialog / tool / system`

**Files:**
- Modify: `src/renderer/monitorSession.ts`
- Modify: `src/renderer/sessionRows.ts`
- Modify: `src/renderer/sessionRows.test.ts`

- [ ] **Step 1: Write failing tests for message-first work item classification**

Add tests covering:
- agent reply lines classify as `message`
- `Tool call:` lines classify as `artifact`
- file-edit style lines classify as `artifact`
- `Running/Completed/Waiting` style lines classify as `note`

```ts
it("classifies file edits as work artifacts", () => {
  const row = sessionRecordToRow({
    id: "codex-1",
    tool: "codex",
    status: "running",
    updatedAt: 1_700_000_000_000,
    activities: ["Edited sessionRows.ts +23 -5"],
  });

  expect(row.timelineItems[0]).toMatchObject({
    kind: "artifact",
    artifactType: "file",
  });
});
```

```ts
it("classifies bare running/completed lines as system notes", () => {
  const row = sessionRecordToRow({
    id: "codex-2",
    tool: "codex",
    status: "completed",
    updatedAt: 1_700_000_000_000,
    activities: ["Completed", "Running"],
  });

  expect(row.timelineItems.map((item) => item.kind)).toEqual(["note", "note"]);
});
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `npm test -- src/renderer/sessionRows.test.ts`

Expected: FAIL because the renderer model still only exposes `dialog`, `tool`, and `system`.

- [ ] **Step 3: Extend `TimelineItem` with message-first work classes**

Update the row model so the expanded renderer can distinguish between:
- `message`
- `artifact`
- `note`

and carry optional artifact subtype data.

```ts
export type TimelineItem = {
  id: string;
  kind: "message" | "artifact" | "note";
  label: string;
  body: string;
  artifactType?: "command" | "file" | "tool" | "verification";
};
```

- [ ] **Step 4: Rework activity classification in `sessionRows.ts`**

Add renderer-side heuristics that map raw activity strings into richer work items:
- `Agent:` / `User:` → `message`
- `Tool call:` → `artifact` + `tool`
- `Edited ...` / file-like update lines → `artifact` + `file`
- `npm test` / `build` / command-like lines → `artifact` + `command` or `verification`
- low-signal lifecycle lines → `note`

```ts
if (/^Edited\\s+/i.test(trimmed)) {
  return {
    id: `timeline-${index}`,
    kind: "artifact",
    label: "File Edit",
    body: trimmed,
    artifactType: "file",
  };
}
```

- [ ] **Step 5: Keep collapsed summary selection aligned with the richer model**

Use the new priority:
- pending title
- latest meaningful `message`
- latest meaningful `artifact`
- finally `note`

```ts
const preferred = timelineItems.find((item) => item.kind === "message")
  ?? timelineItems.find((item) => item.kind === "artifact")
  ?? timelineItems.find((item) => item.kind === "note" && !LOW_SIGNAL_SYSTEM_BODIES.has(item.body.trim()));
```

- [ ] **Step 6: Run the focused tests to verify they pass**

Run: `npm test -- src/renderer/sessionRows.test.ts`

Expected: PASS with richer timeline item typing covered.

- [ ] **Step 7: Commit the enriched timeline classification**

```bash
git add src/renderer/monitorSession.ts src/renderer/sessionRows.ts src/renderer/sessionRows.test.ts
git commit -m "feat: classify expanded work stream items"
```

### Task 2: Replace the Expanded Inspector with a Message-First Stream

**Files:**
- Modify: `src/renderer/components/HoverDetails.tsx`
- Modify: `src/renderer/components/SessionRow.tsx`
- Modify: `src/renderer/components/SessionRow.test.tsx`
- Modify: `src/renderer/styles.css`

- [ ] **Step 1: Write failing tests for the new expanded content structure**

Add tests that assert expanded content renders:
- thin metadata header
- current progress summary
- message/artifact/note stream
- interaction zone

```ts
it("renders messages as the dominant stream blocks", () => {
  const html = renderToStaticMarkup(
    <SessionRow
      session={baseRow({
        timelineItems: [
          { id: "1", kind: "message", label: "Agent", body: "已完成补丁调整，下一步等你确认是否合并。" },
          { id: "2", kind: "artifact", label: "File Edit", body: "Edited sessionRows.ts +23 -5", artifactType: "file" },
          { id: "3", kind: "note", label: "Completed", body: "Completed" },
        ],
      })}
      expanded
      onToggleExpanded={vi.fn()}
      onRespond={vi.fn()}
    />,
  );

  expect(html).toContain("session-stream");
  expect(html).toContain("session-stream__item--message");
  expect(html).toContain("session-stream__item--artifact");
  expect(html).toContain("session-stream__item--note");
});
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `npm test -- src/renderer/components/SessionRow.test.tsx`

Expected: FAIL because the current expanded panel still uses the old timeline container structure.

- [ ] **Step 3: Replace `HoverDetails` with a message-first stream renderer**

Refactor the expanded content component to render stream items with different block structures:
- `message` → message card
- `artifact` → compact work block
- `note` → muted annotation row

```tsx
if (item.kind === "message") {
  return <article className="session-stream__item session-stream__item--message">...</article>;
}
if (item.kind === "artifact") {
  return <article className="session-stream__item session-stream__item--artifact">...</article>;
}
return <div className="session-stream__item session-stream__item--note">...</div>;
```

- [ ] **Step 4: Rebuild `SessionRow` expanded layout around the new order**

Use:
- thin metadata header
- current progress summary line
- message-first stream
- interaction slot

```tsx
<div className="session-row__details">
  <div className="session-row__header-strip">...</div>
  <div className="session-row__progress">{session.collapsedSummary}</div>
  <HoverDetails items={session.timelineItems} />
  <div className="session-row__interaction">...</div>
</div>
```

- [ ] **Step 5: Ensure summary text is not repeated in the stream header**

If the progress line equals the first `message` body, suppress the secondary repeat in the header area.

```ts
const streamLead = session.timelineItems.find((item) => item.kind === "message" || item.kind === "artifact");
const progressLine = streamLead?.body === session.collapsedSummary ? null : session.collapsedSummary;
```

- [ ] **Step 6: Run the focused tests to verify they pass**

Run: `npm test -- src/renderer/components/SessionRow.test.tsx`

Expected: PASS with message-first expanded layout covered.

- [ ] **Step 7: Commit the expanded message-first stream**

```bash
git add src/renderer/components/HoverDetails.tsx src/renderer/components/SessionRow.tsx src/renderer/components/SessionRow.test.tsx src/renderer/styles.css
git commit -m "feat: make expanded sessions message-first"
```

### Task 3: Style Message Blocks, Work Artifacts, and System Notes Differently

**Files:**
- Modify: `src/renderer/styles.css`
- Modify: `src/renderer/styles.test.ts`
- Modify: `src/renderer/components/SessionRow.test.tsx`

- [ ] **Step 1: Write failing style tests for the three content classes**

Add style expectations for:
- message blocks using the most readable body text
- artifact blocks using compact structured styling
- note rows using muted annotation styling

```ts
expect(css).toMatch(/\.session-stream__item--message[\s\S]*font-size:\s*13px;/);
expect(css).toMatch(/\.session-stream__item--artifact[\s\S]*border:/);
expect(css).toMatch(/\.session-stream__item--note[\s\S]*color:\s*var\\(--muted\\)/);
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `npm test -- src/renderer/styles.test.ts src/renderer/components/SessionRow.test.tsx`

Expected: FAIL because the current CSS still styles the expanded area as a generic timeline.

- [ ] **Step 3: Style message blocks to feel closer to codeagent conversation**

Message blocks should:
- have readable multiline body
- softer surface
- small source label
- enough breathing room to feel like content, not telemetry

```css
.session-stream__item--message {
  padding: 12px 14px;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 14px;
}
```

- [ ] **Step 4: Style artifacts and notes to recede appropriately**

Artifacts:
- structured
- compact
- informative

Notes:
- thin
- muted
- lightweight

```css
.session-stream__item--artifact {
  padding: 9px 12px;
  border-left: 2px solid color-mix(in srgb, var(--accent) 45%, transparent);
}

.session-stream__item--note {
  font-size: 11px;
  color: var(--muted);
}
```

- [ ] **Step 5: Run the focused tests to verify they pass**

Run: `npm test -- src/renderer/styles.test.ts src/renderer/components/SessionRow.test.tsx`

Expected: PASS with new message/artifact/note styling covered.

- [ ] **Step 6: Commit the expanded stream styling**

```bash
git add src/renderer/styles.css src/renderer/styles.test.ts src/renderer/components/SessionRow.test.tsx
git commit -m "feat: style expanded session work stream"
```

### Task 4: Verify the Rebuilt Expanded Experience

**Files:**
- Modify: any small assertions needed to match final expanded layout wording

- [ ] **Step 1: Run the focused renderer suite**

Run: `npm test -- src/renderer/sessionRows.test.ts src/renderer/sessionBootstrap.test.ts src/renderer/components/SessionRow.test.tsx src/renderer/components/SessionList.test.tsx src/renderer/styles.test.ts src/renderer/App.test.tsx`

Expected: PASS.

- [ ] **Step 2: Run the full project test suite**

Run: `npm test`

Expected: PASS.

- [ ] **Step 3: Run lint**

Run: `npm run lint`

Expected: PASS.

- [ ] **Step 4: Run the production build**

Run: `npm run build`

Expected: PASS.

- [ ] **Step 5: Commit the verified message-first expanded layout**

```bash
git add src/renderer/sessionRows.test.ts src/renderer/sessionBootstrap.test.ts src/renderer/components/SessionRow.test.tsx src/renderer/components/SessionList.test.tsx src/renderer/styles.test.ts src/renderer/App.test.tsx
git commit -m "test: verify message-first expanded layout"
```
