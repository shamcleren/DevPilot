# Git Directive Message Rendering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render known Codex git directives in assistant messages as lightweight status chips instead of raw protocol text.

**Architecture:** Keep the change renderer-only by parsing known git directives inside the assistant message rendering path, stripping recognized directives from the markdown body, and appending a compact chip row below the prose. Preserve existing markdown, artifact, and note rendering behavior by keeping all logic local to `HoverDetails.tsx` plus CSS and renderer tests.

**Tech Stack:** React, TypeScript, ReactMarkdown, Vitest, renderer CSS

---

### File Map

**Files:**
- Modify: `/Users/renjinming/code/my_porjects/shamcleren/CodePal/src/renderer/components/HoverDetails.tsx`
- Modify: `/Users/renjinming/code/my_porjects/shamcleren/CodePal/src/renderer/styles.css`
- Modify: `/Users/renjinming/code/my_porjects/shamcleren/CodePal/src/renderer/components/SessionRow.test.tsx`

Responsibilities:

- `src/renderer/components/HoverDetails.tsx`
  Add narrow directive parsing helpers and render extracted git chips under assistant markdown.
- `src/renderer/styles.css`
  Define low-priority chip-row and chip visuals aligned with the existing assistant bubble palette.
- `src/renderer/components/SessionRow.test.tsx`
  Lock in expected behavior for cleaned prose, chip rendering, directive-only messages, and unknown directive passthrough.

### Task 1: Lock the Renderer Contract with Failing Tests

**Files:**
- Modify: `/Users/renjinming/code/my_porjects/shamcleren/CodePal/src/renderer/components/SessionRow.test.tsx`
- Test: `/Users/renjinming/code/my_porjects/shamcleren/CodePal/src/renderer/components/SessionRow.test.tsx`

- [ ] **Step 1: Add a failing test for prose plus known git directives**

```tsx
  it("renders known git directives as lightweight chips under assistant prose", () => {
    const html = renderToStaticMarkup(
      <SessionRow
        session={baseRow({
          timelineItems: [
            {
              id: "git-directive-1",
              kind: "message",
              source: "assistant",
              label: "Assistant",
              title: "Assistant",
              body:
                "已提交并推送到 `origin/main`。\n\n::git-stage{cwd=\"/Users/demo/CodePal\"} ::git-commit{cwd=\"/Users/demo/CodePal\"} ::git-push{cwd=\"/Users/demo/CodePal\" branch=\"main\"}",
              timestamp: 1,
            },
          ],
        })}
        expanded
        onToggleExpanded={vi.fn()}
        onRespond={vi.fn()}
      />,
    );

    expect(html).toContain("已提交并推送到");
    expect(html).toContain("session-stream__directive-chips");
    expect(html).toContain("session-stream__directive-chip");
    expect(html).toContain("已暂存");
    expect(html).toContain("已提交");
    expect(html).toContain("已推送 main");
    expect(html).not.toContain("::git-stage");
    expect(html).not.toContain("::git-commit");
    expect(html).not.toContain("::git-push");
  });
```

- [ ] **Step 2: Add a failing test for directive-only messages and unknown directive passthrough**

```tsx
  it("renders directive-only assistant messages without an empty prose block", () => {
    const html = renderToStaticMarkup(
      <SessionRow
        session={baseRow({
          timelineItems: [
            {
              id: "git-directive-only",
              kind: "message",
              source: "assistant",
              label: "Assistant",
              title: "Assistant",
              body:
                "::git-stage{cwd=\"/Users/demo/CodePal\"}\n::git-push{cwd=\"/Users/demo/CodePal\" branch=\"main\"}",
              timestamp: 1,
            },
          ],
        })}
        expanded
        onToggleExpanded={vi.fn()}
        onRespond={vi.fn()}
      />,
    );

    expect(html).toContain("session-stream__directive-chips");
    expect(html).toContain("已暂存");
    expect(html).toContain("已推送 main");
    expect(html).not.toContain("<p></p>");
  });

  it("leaves unknown directives inside assistant markdown text", () => {
    const html = renderToStaticMarkup(
      <SessionRow
        session={baseRow({
          timelineItems: [
            {
              id: "unknown-directive-1",
              kind: "message",
              source: "assistant",
              label: "Assistant",
              title: "Assistant",
              body: "保留原文 ::git-create-pr{branch=\"codex/demo\"}",
              timestamp: 1,
            },
          ],
        })}
        expanded
        onToggleExpanded={vi.fn()}
        onRespond={vi.fn()}
      />,
    );

    expect(html).toContain("::git-create-pr");
    expect(html).not.toContain("session-stream__directive-chips");
  });
```

- [ ] **Step 3: Run the focused renderer tests to verify failure**

Run:

```bash
npm test -- src/renderer/components/SessionRow.test.tsx
```

Expected:

```text
FAIL  src/renderer/components/SessionRow.test.tsx
```

The new tests should fail because directive chips are not implemented yet and raw `::git-*` text still renders inside the assistant body.

### Task 2: Implement Narrow Git Directive Parsing in the Assistant Message Path

**Files:**
- Modify: `/Users/renjinming/code/my_porjects/shamcleren/CodePal/src/renderer/components/HoverDetails.tsx`
- Test: `/Users/renjinming/code/my_porjects/shamcleren/CodePal/src/renderer/components/SessionRow.test.tsx`

- [ ] **Step 1: Add narrow helper types and parsers above `RichTextBlock`**

```tsx
type GitDirectiveChip = {
  id: string;
  label: string;
};

type ParsedAssistantBody = {
  cleanedText: string;
  chips: GitDirectiveChip[];
};

function readDirectiveAttribute(source: string, name: string): string | null {
  const match = source.match(new RegExp(`${name}="([^"]+)"`));
  return match?.[1] ?? null;
}

function toGitDirectiveChip(name: string, payload: string, index: number): GitDirectiveChip | null {
  switch (name) {
    case "git-stage":
      return { id: `git-stage-${index}`, label: "已暂存" };
    case "git-commit":
      return { id: `git-commit-${index}`, label: "已提交" };
    case "git-push": {
      const branch = readDirectiveAttribute(payload, "branch");
      return {
        id: `git-push-${index}`,
        label: branch ? `已推送 ${branch}` : "已推送",
      };
    }
    default:
      return null;
  }
}

function parseAssistantBody(text: string): ParsedAssistantBody {
  const matches = [...text.matchAll(/::([a-z0-9-]+)\{([^{}]*)\}/gi)];
  if (matches.length === 0) {
    return { cleanedText: text, chips: [] };
  }

  const chips: GitDirectiveChip[] = [];
  let cleanedText = text;

  matches.forEach((match, index) => {
    const fullMatch = match[0];
    const directiveName = match[1] ?? "";
    const payload = match[2] ?? "";
    const chip = toGitDirectiveChip(directiveName, payload, index);
    if (!chip) {
      return;
    }
    chips.push(chip);
    cleanedText = cleanedText.replace(fullMatch, "");
  });

  return {
    cleanedText: cleanedText.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim(),
    chips,
  };
}
```

- [ ] **Step 2: Update `RichTextBlock` to render optional chips below cleaned markdown**

```tsx
function RichTextBlock({ text }: { text: string }) {
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const { cleanedText, chips } = parseAssistantBody(text);
  const hasMarkdownBody = cleanedText.trim().length > 0;

  async function copyCodeBlock(code: string) {
    // keep existing implementation
  }

  return (
    <div className="session-stream__richtext">
      {hasMarkdownBody ? (
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            // keep existing markdown component map unchanged
          }}
        >
          {cleanedText}
        </ReactMarkdown>
      ) : null}
      {chips.length > 0 ? (
        <div className="session-stream__directive-chips" aria-label="Git actions">
          {chips.map((chip) => (
            <span key={chip.id} className="session-stream__directive-chip">
              {chip.label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 3: Run the focused renderer tests to verify the implementation**

Run:

```bash
npm test -- src/renderer/components/SessionRow.test.tsx
```

Expected:

```text
PASS  src/renderer/components/SessionRow.test.tsx
```

The new directive tests and the existing markdown rendering tests should pass together.

### Task 3: Polish the Chip Presentation and Re-Run Verification

**Files:**
- Modify: `/Users/renjinming/code/my_porjects/shamcleren/CodePal/src/renderer/styles.css`
- Test: `/Users/renjinming/code/my_porjects/shamcleren/CodePal/src/renderer/components/SessionRow.test.tsx`

- [ ] **Step 1: Add compact directive chip styles near the existing richtext styles**

```css
.session-stream__directive-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 2px;
}

.session-stream__directive-chip {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 0 9px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--accent) 18%, var(--border));
  background: color-mix(in srgb, var(--accent) 8%, transparent);
  color: color-mix(in srgb, var(--text) 84%, var(--muted));
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  line-height: 1;
}
```

- [ ] **Step 2: Run the focused renderer tests once more**

Run:

```bash
npm test -- src/renderer/components/SessionRow.test.tsx
```

Expected:

```text
PASS  src/renderer/components/SessionRow.test.tsx
```

- [ ] **Step 3: Run a broader renderer-facing check**

Run:

```bash
npm test -- src/renderer/components/SessionRow.test.tsx src/renderer/sessionRows.test.ts
```

Expected:

```text
PASS  src/renderer/components/SessionRow.test.tsx
PASS  src/renderer/sessionRows.test.ts
```

This verifies the new assistant rendering path did not regress adjacent session-row behavior.

## Self-Review

Spec coverage:

- Known git directives converted to lightweight chips: covered by Task 1 and Task 2.
- Assistant prose remains readable with markdown intact: covered by Task 1 and Task 2.
- Unknown directives remain unchanged: covered by Task 1.
- Styling remains subtle and local to renderer: covered by Task 3.

Placeholder scan:

- No `TODO`, `TBD`, or deferred implementation markers remain.

Type consistency:

- The plan consistently uses `GitDirectiveChip`, `ParsedAssistantBody`, `parseAssistantBody`, and the CSS classes `session-stream__directive-chips` / `session-stream__directive-chip`.
