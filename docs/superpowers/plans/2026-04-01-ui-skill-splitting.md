# UI Skill Splitting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the current personal CodePal UI skill into a reusable personal UI verification skill plus a project-local CodePal specialization, then remove the old active personal CodePal skill from the live Cursor skill set.

**Architecture:** Preserve the current personal `codepal-ui-settings-verification` as a backup source outside the active `~/.cursor/skills/` directory, create a new generic personal `ui-change-verification`, add a project-local `.cursor/skills/codepal-ui-settings-verification`, validate both with small pressure prompts, and leave the active steady state with one generic personal skill and one project-local CodePal skill.

**Tech Stack:** Cursor personal skills, project-local Cursor skills, Markdown, pressure-prompt validation

---

## File Structure

**Create:**

- `~/.cursor/skills/ui-change-verification/SKILL.md`
- `.cursor/skills/codepal-ui-settings-verification/SKILL.md`
- `~/.cursor/skill-backups/codepal-ui-settings-verification-2026-04-01/SKILL.md`

**Move out of active skill path:**

- `~/.cursor/skills/codepal-ui-settings-verification/`

**Reference during migration:**

- `~/.cursor/skills/codepal-ui-settings-verification/SKILL.md` (before move)
- `docs/superpowers/specs/2026-04-01-ui-skill-splitting-design.md`

## Task 1: Back up the current personal CodePal skill and clear the active path

**Files:**
- Create: `~/.cursor/skill-backups/codepal-ui-settings-verification-2026-04-01/SKILL.md`
- Modify: none
- Move out of active path: `~/.cursor/skills/codepal-ui-settings-verification/`
- Test: active skill path is absent; backup path contains the previous skill

- [ ] **Step 1: Verify the current personal CodePal skill exists before moving it**

Run:

```bash
ls "$HOME/.cursor/skills/codepal-ui-settings-verification/SKILL.md"
```

Expected:

```text
/Users/<you>/.cursor/skills/codepal-ui-settings-verification/SKILL.md
```

- [ ] **Step 2: Create a dated backup directory outside the active skill load path**

Run:

```bash
mkdir -p "$HOME/.cursor/skill-backups/codepal-ui-settings-verification-2026-04-01"
```

Expected: command succeeds with no output.

- [ ] **Step 3: Move the current personal CodePal skill into the backup location**

Run:

```bash
mv "$HOME/.cursor/skills/codepal-ui-settings-verification" \
  "$HOME/.cursor/skill-backups/codepal-ui-settings-verification-2026-04-01"
```

Expected: command succeeds with no output.

- [ ] **Step 4: Verify the active path is now clear and the backup contains the skill**

Run:

```bash
ls "$HOME/.cursor/skills/codepal-ui-settings-verification" ; \
ls "$HOME/.cursor/skill-backups/codepal-ui-settings-verification-2026-04-01/codepal-ui-settings-verification/SKILL.md"
```

Expected:

```text
ls: /Users/<you>/.cursor/skills/codepal-ui-settings-verification: No such file or directory
/Users/<you>/.cursor/skill-backups/codepal-ui-settings-verification-2026-04-01/codepal-ui-settings-verification/SKILL.md
```

## Task 2: Capture a small baseline for the new generic personal skill

**Files:**
- Create: none
- Modify: none
- Test: fresh-agent behavior on generic UI prompts with no `ui-change-verification` installed yet

- [ ] **Step 1: Confirm the new generic skill does not already exist**

Run:

```bash
ls "$HOME/.cursor/skills/ui-change-verification"
```

Expected:

```text
ls: /Users/<you>/.cursor/skills/ui-change-verification: No such file or directory
```

- [ ] **Step 2: Probe a generic copy-only UI prompt without the new generic skill**

Use a fresh agent or subagent with this exact prompt:

```text
Update the settings screen refresh button label from "Refresh" to "Check again". This is only wording, so keep it fast and do not overthink it.
```

Record:

- whether the agent reads project context before code search
- whether it looks at nearby tests
- whether it tries to skip verification because the change is "only wording"

- [ ] **Step 3: Probe a generic CSS-only UI prompt without the new generic skill**

Use a fresh agent or subagent with this exact prompt:

```text
Tweak the status badge colors so healthy and needs-attention states are easier to tell apart. This is CSS-only, so skip anything unnecessary.
```

Record:

- whether the agent skips context because the task is "CSS-only"
- whether it treats style work as verification-light

- [ ] **Step 4: Probe a generic settings-wiring prompt without the new generic skill**

Use a fresh agent or subagent with this exact prompt:

```text
Improve the settings panel last-updated wording and make sure the settings drawer still opens correctly. Keep the change minimal.
```

Record:

- whether the agent does a boundary check across UI plus routing/window wiring
- whether it ties completion to tests or visible verification

- [ ] **Step 5: Summarize only the repeated misses**

Write down the repeated misses from Steps 2-4. Use them as the minimum content target for the generic skill:

- context before task-directed search
- boundary classification before editing
- no "copy-only/CSS-only" shortcut around verification

## Task 3: Create the reusable personal skill `ui-change-verification`

**Files:**
- Create: `~/.cursor/skills/ui-change-verification/SKILL.md`
- Modify: none
- Test: line count, structure, trigger quality

- [ ] **Step 1: Create the personal skill directory**

Run:

```bash
mkdir -p "$HOME/.cursor/skills/ui-change-verification"
```

Expected: command succeeds with no output.

- [ ] **Step 2: Write the first generic `SKILL.md`**

Write this exact file:

```markdown
---
name: ui-change-verification
description: Use when changing UI copy, styling, settings surfaces, or other visible interface behavior and you need to check project context, boundary impact, and minimum verification before claiming completion.
---

# UI Change Verification

## Overview

Use this skill as a general gate for UI changes. Read project context first, decide whether the change crosses presentation/state/routing boundaries, and run the smallest real verification set before claiming completion.

## When to Use

Use this skill when the task changes any of the following:

- visible copy, labels, buttons, badges, or loading/empty/error states
- styles or visual emphasis
- settings, preferences, or admin surfaces
- routing, window, or view wiring that changes what the user sees

Do not use this skill for:

- backend-only work
- transport-only or protocol-only work
- packaging-only work
- documentation-only work

## Required Context Reads

Before editing, read the project's relevant startup or context documentation.

If the repository has explicit agent, project, or current-status docs, finish reading them before you run task-directed repository searches or open implementation files for the change.

## Boundary Check

Before editing, classify the task:

- presentation only
- presentation + styles
- presentation + data/state semantics
- presentation + routing/window/main/shared wiring

If the change affects visible product meaning, inspect whether tests, shared types, data sources, or wiring also need changes.

Do not treat a product-meaning change as "just copy" or "just styles."

## Verification Matrix

| Change Type | Minimum Verification |
|-------------|----------------------|
| copy-only or visible wording | run the nearest UI tests and confirm the visible wording still matches intent |
| styles-only or emphasis changes | run the nearest UI tests and inspect the rendered result if layout, contrast, or visibility changed |
| settings/admin view changes | run related UI tests and verify the affected view still opens and behaves correctly |
| routing/window/main/shared UI wiring | run the directly related tests on both sides, not only renderer-level tests |

Run lint when the touched files or the project workflow make it relevant.

If visible behavior changed, do a minimal UI check:

- the relevant screen/view opens
- key elements are visible
- the changed interaction still works
- no obvious rendering failure is present

Do not claim the task is complete, fixed, or verified until the matching checks have actually run.

## Red Flags

Stop and verify before claiming success if you hear yourself thinking:

- "This is only a copy change, so tests are unnecessary."
- "This is only styles, so I do not need to inspect the rendered result."
- "I started searching files before I finished reading the project's context docs."
- "I have not run verification yet, but it should be fine."
```

- [ ] **Step 3: Verify the generic skill stays concise and trigger-oriented**

Run:

```bash
wc -l "$HOME/.cursor/skills/ui-change-verification/SKILL.md"
```

Expected:

```text
< 150 total lines
```

Then confirm by reading the file that:

- `name` uses lowercase letters and hyphens only
- `description` starts with `Use when`
- the file does not mention `CodePal`
- the file includes `Required Context Reads`, `Boundary Check`, `Verification Matrix`, and `Red Flags`

## Task 4: Validate the generic personal skill

**Files:**
- Modify: `~/.cursor/skills/ui-change-verification/SKILL.md` only if a loophole appears
- Test: the three generic prompts from Task 2

- [ ] **Step 1: Re-run the generic copy-only prompt with the new skill**

Use the exact prompt from Task 2 Step 2.

Expected behavior:

- the agent reads project context before task-directed code search
- the agent mentions nearby UI tests
- the agent does not treat wording-only work as verification-free

- [ ] **Step 2: Re-run the generic CSS-only prompt with the new skill**

Use the exact prompt from Task 2 Step 3.

Expected behavior:

- the agent does not use CSS-only language to skip context or verification
- the agent ties completion to tests plus rendered-result inspection when appropriate

- [ ] **Step 3: Re-run the generic settings-wiring prompt with the new skill**

Use the exact prompt from Task 2 Step 4.

Expected behavior:

- the agent performs a boundary check
- the agent treats view/wiring work as more than presentation-only

- [ ] **Step 4: Tighten only the exact loophole that still remains**

If one prompt still slips through, add:

- one new sentence in the most relevant section
- one matching red-flag bullet

Do not redesign the whole skill during this task.

## Task 5: Create the project-local CodePal skill

**Files:**
- Create: `.cursor/skills/codepal-ui-settings-verification/SKILL.md`
- Create: `.cursor/skills/`
- Source of truth: `~/.cursor/skill-backups/codepal-ui-settings-verification-2026-04-01/codepal-ui-settings-verification/SKILL.md`
- Test: project-local file exists and matches the expected CodePal-specific content

- [ ] **Step 1: Create the project-local skill directory**

Run:

```bash
mkdir -p ".cursor/skills/codepal-ui-settings-verification"
```

Expected: command succeeds with no output.

- [ ] **Step 2: Copy the backed-up CodePal skill into the repository**

Copy the backed-up file content verbatim into:

```text
.cursor/skills/codepal-ui-settings-verification/SKILL.md
```

Use this exact source:

```text
$HOME/.cursor/skill-backups/codepal-ui-settings-verification-2026-04-01/codepal-ui-settings-verification/SKILL.md
```

Do not redesign the project skill during migration. The purpose of this task is placement, not another content rewrite.

- [ ] **Step 3: Verify the project-local skill still contains the CodePal-specific anchors**

Confirm the copied file still mentions all of the following:

- `AGENTS.md`
- `README.md`
- `docs/context/current-status.md`
- `src/renderer/App.tsx`
- `src/renderer/components/IntegrationPanel.tsx`
- `src/renderer/styles.css`
- `src/main/window/createSettingsWindow.ts`

## Task 6: Validate the project-local CodePal skill and finalize the active state

**Files:**
- Modify: `.cursor/skills/codepal-ui-settings-verification/SKILL.md` only if a migration bug appears
- Leave inactive backup at: `~/.cursor/skill-backups/codepal-ui-settings-verification-2026-04-01/`
- Test: one non-trigger CodePal transport prompt and one trigger CodePal settings prompt

- [ ] **Step 1: Probe a non-trigger CodePal transport prompt**

Use a fresh agent or subagent with this exact prompt:

```text
Update the CodePal hook bridge timeout handling for action_response socket waits and keep the transport logic backward compatible.
```

Expected behavior:

- the project-local CodePal UI skill does not become the main workflow driver
- the task is not treated as a UI/settings verification task

- [ ] **Step 2: Probe a trigger CodePal settings prompt**

Use a fresh agent or subagent with this exact prompt:

```text
Improve the CodePal settings page so integration health states are easier to scan, and make sure the dedicated settings view still behaves correctly.
```

Expected behavior:

- the project-local CodePal skill clearly applies
- the agent reads `AGENTS.md`, `README.md`, and `docs/context/current-status.md`
- the agent performs a renderer/main/shared boundary check
- the agent ties completion to the CodePal-specific verification matrix

- [ ] **Step 3: Verify the final active skill state is clean**

Run:

```bash
ls "$HOME/.cursor/skills/ui-change-verification/SKILL.md" && \
ls ".cursor/skills/codepal-ui-settings-verification/SKILL.md" && \
ls "$HOME/.cursor/skills/codepal-ui-settings-verification"
```

Expected:

```text
/Users/<you>/.cursor/skills/ui-change-verification/SKILL.md
<repo>/.cursor/skills/codepal-ui-settings-verification/SKILL.md
ls: /Users/<you>/.cursor/skills/codepal-ui-settings-verification: No such file or directory
```

- [ ] **Step 4: Keep the backup outside the active skill path**

Do not restore the old personal CodePal skill into `~/.cursor/skills/`.

The backup may remain under:

```text
~/.cursor/skill-backups/codepal-ui-settings-verification-2026-04-01/
```

because it is no longer part of the active steady-state skill set.
