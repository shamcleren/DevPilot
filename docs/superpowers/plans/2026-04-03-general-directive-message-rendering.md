# General Directive Message Rendering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade assistant-message directive rendering from git-only chips to a generic known-directive plus fallback chip system.

**Architecture:** Keep the change renderer-only by replacing the narrow git-specific parser in `HoverDetails.tsx` with a generic directive mapper. Known directives get explicit human labels; unknown directives become normalized fallback chips. Existing chip styling remains the baseline so only the parsing and test surface expands.

**Tech Stack:** React, TypeScript, ReactMarkdown, Vitest, renderer CSS

---

### File Map

**Files:**
- Modify: `/Users/renjinming/code/my_porjects/shamcleren/CodePal/src/renderer/components/HoverDetails.tsx`
- Modify: `/Users/renjinming/code/my_porjects/shamcleren/CodePal/src/renderer/components/SessionRow.test.tsx`
- Reuse without change unless needed: `/Users/renjinming/code/my_porjects/shamcleren/CodePal/src/renderer/styles.css`

Responsibilities:

- `src/renderer/components/HoverDetails.tsx`
  Replace the git-only directive helper with a generic mapper for known directives and fallback chips.
- `src/renderer/components/SessionRow.test.tsx`
  Lock in known non-git directive labels, fallback behavior, and directive-only rendering.
- `src/renderer/styles.css`
  Reuse existing chip styling; edit only if expanded behavior reveals spacing issues.

### Task 1: Expand Tests to Cover Known Non-Git Directives and Fallback

**Files:**
- Modify: `/Users/renjinming/code/my_porjects/shamcleren/CodePal/src/renderer/components/SessionRow.test.tsx`
- Test: `/Users/renjinming/code/my_porjects/shamcleren/CodePal/src/renderer/components/SessionRow.test.tsx`

- [ ] **Step 1: Replace the unknown-directive passthrough assertion with fallback-chip expectations**

```tsx
  it("renders unknown directives as generic fallback chips", () => {
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
              body: "保留摘要。\n\n::sync_status{state=\"ok\"}",
              timestamp: 1,
            },
          ],
        })}
        expanded
        onToggleExpanded={vi.fn()}
        onRespond={vi.fn()}
      />,
    );

    expect(html).toContain("保留摘要");
    expect(html).toContain("session-stream__directive-chips");
    expect(html).toContain("sync status");
    expect(html).not.toContain("::sync_status");
  });
```

- [ ] **Step 2: Add a test for known non-git directives**

```tsx
  it("renders known non-git directives with explicit labels", () => {
    const html = renderToStaticMarkup(
      <SessionRow
        session={baseRow({
          timelineItems: [
            {
              id: "known-directive-2",
              kind: "message",
              source: "assistant",
              label: "Assistant",
              title: "Assistant",
              body:
                "::git-create-branch{branch=\"codex/directive-ui\"} ::git-create-pr{url=\"https://example.test/pr/1\"} ::code-comment{file=\"/tmp/demo.ts\"} ::archive{reason=\"done\"}",
              timestamp: 1,
            },
          ],
        })}
        expanded
        onToggleExpanded={vi.fn()}
        onRespond={vi.fn()}
      />,
    );

    expect(html).toContain("已创建分支 codex/directive-ui");
    expect(html).toContain("已创建 PR");
    expect(html).toContain("已添加评论");
    expect(html).toContain("已归档");
  });
```

- [ ] **Step 3: Add a test for automation-update modes**

```tsx
  it("renders automation-update directives with mode-aware labels", () => {
    const html = renderToStaticMarkup(
      <SessionRow
        session={baseRow({
          timelineItems: [
            {
              id: "automation-directive-1",
              kind: "message",
              source: "assistant",
              label: "Assistant",
              title: "Assistant",
              body:
                "::automation-update{mode=\"suggested create\" name=\"Daily report\"} ::automation-update{mode=\"suggested update\" id=\"123\"} ::automation-update{mode=\"view\" id=\"456\"}",
              timestamp: 1,
            },
          ],
        })}
        expanded
        onToggleExpanded={vi.fn()}
        onRespond={vi.fn()}
      />,
    );

    expect(html).toContain("建议自动化");
    expect(html).toContain("建议更新自动化");
    expect(html).toContain("查看自动化");
  });
```

- [ ] **Step 4: Run the focused renderer tests to verify failure**

Run:

```bash
npm test -- src/renderer/components/SessionRow.test.tsx
```

Expected:

```text
FAIL  src/renderer/components/SessionRow.test.tsx
```

The new tests should fail because the current parser only understands git stage / commit / push and still leaves other directives in prose.

### Task 2: Replace the Git-Only Parser with a Generic Directive Mapper

**Files:**
- Modify: `/Users/renjinming/code/my_porjects/shamcleren/CodePal/src/renderer/components/HoverDetails.tsx`
- Test: `/Users/renjinming/code/my_porjects/shamcleren/CodePal/src/renderer/components/SessionRow.test.tsx`

- [ ] **Step 1: Generalize the helper types and add a directive-name normalizer**

```tsx
type DirectiveChip = {
  id: string;
  label: string;
};

function normalizeDirectiveName(name: string): string {
  return name.replace(/[-_]+/g, " ").trim().toLowerCase();
}
```

- [ ] **Step 2: Replace the git-only mapping helper with a known-directive mapper plus fallback**

```tsx
function toDirectiveChip(name: string, payload: string, index: number): DirectiveChip | null {
  switch (name) {
    case "git-stage":
      return { id: `directive-${index}`, label: "已暂存" };
    case "git-commit":
      return { id: `directive-${index}`, label: "已提交" };
    case "git-push": {
      const branch = readDirectiveAttribute(payload, "branch");
      return { id: `directive-${index}`, label: branch ? `已推送 ${branch}` : "已推送" };
    }
    case "git-create-branch": {
      const branch = readDirectiveAttribute(payload, "branch");
      return { id: `directive-${index}`, label: branch ? `已创建分支 ${branch}` : "已创建分支" };
    }
    case "git-create-pr":
      return { id: `directive-${index}`, label: "已创建 PR" };
    case "code-comment":
      return { id: `directive-${index}`, label: "已添加评论" };
    case "archive":
      return { id: `directive-${index}`, label: "已归档" };
    case "automation-update": {
      const mode = readDirectiveAttribute(payload, "mode");
      if (mode === "suggested create") {
        return { id: `directive-${index}`, label: "建议自动化" };
      }
      if (mode === "suggested update") {
        return { id: `directive-${index}`, label: "建议更新自动化" };
      }
      if (mode === "view") {
        return { id: `directive-${index}`, label: "查看自动化" };
      }
      return { id: `directive-${index}`, label: "自动化已更新" };
    }
    default:
      return { id: `directive-${index}`, label: normalizeDirectiveName(name) };
  }
}
```

- [ ] **Step 3: Update `parseAssistantBody` to remove all parsed directives, including fallback chips**

```tsx
function parseAssistantBody(text: string): ParsedAssistantBody {
  const matches = [...text.matchAll(/::([a-z0-9_-]+)\{([^{}]*)\}/gi)];
  if (matches.length === 0) {
    return { cleanedText: text, chips: [] };
  }

  const chips: DirectiveChip[] = [];
  let cleanedText = text;

  for (const [index, match] of matches.entries()) {
    const fullMatch = match[0];
    const directiveName = match[1] ?? "";
    const payload = match[2] ?? "";
    const chip = toDirectiveChip(directiveName, payload, index);

    if (!chip) {
      continue;
    }

    chips.push(chip);
    cleanedText = cleanedText.replace(fullMatch, "");
  }

  return {
    cleanedText: cleanedText.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim(),
    chips,
  };
}
```

- [ ] **Step 4: Run focused tests to verify the generalized parser**

Run:

```bash
npm test -- src/renderer/components/SessionRow.test.tsx
```

Expected:

```text
PASS  src/renderer/components/SessionRow.test.tsx
```

### Task 3: Re-Run Broader Verification

**Files:**
- Test: `/Users/renjinming/code/my_porjects/shamcleren/CodePal/src/renderer/components/SessionRow.test.tsx`
- Test: `/Users/renjinming/code/my_porjects/shamcleren/CodePal/src/renderer/sessionRows.test.ts`

- [ ] **Step 1: Run the nearby renderer regression set**

Run:

```bash
npm test -- src/renderer/components/SessionRow.test.tsx src/renderer/sessionRows.test.ts
```

Expected:

```text
PASS  src/renderer/components/SessionRow.test.tsx
PASS  src/renderer/sessionRows.test.ts
```

- [ ] **Step 2: Inspect the diff for unintended renderer churn**

Run:

```bash
git diff -- src/renderer/components/HoverDetails.tsx src/renderer/components/SessionRow.test.tsx
```

Expected:

```text
Only directive parsing and test expectation changes
```

## Self-Review

Spec coverage:

- Known directives rendered with explicit labels: covered by Task 1 and Task 2.
- Unknown directives rendered via fallback chips: covered by Task 1 and Task 2.
- Raw directive text removed from assistant prose: covered by Task 2.
- Directive-only messages continue to render cleanly: preserved by Task 1 regression coverage.

Placeholder scan:

- No placeholders or deferred implementation notes remain.

Type consistency:

- The plan consistently uses `DirectiveChip`, `normalizeDirectiveName`, `toDirectiveChip`, and `parseAssistantBody`.
