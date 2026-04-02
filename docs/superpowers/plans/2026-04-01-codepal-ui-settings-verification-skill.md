# CodePal UI Settings Verification Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create and validate a personal Cursor skill that forces context reads, boundary checks, and minimal verification for CodePal UI and settings changes before the agent reports completion.

**Architecture:** Build a single personal skill at `~/.cursor/skills/codepal-ui-settings-verification/SKILL.md`. Follow the writing-skills TDD workflow: first pressure-test realistic CodePal UI prompts without the skill, then write the smallest skill that closes those gaps, then rerun the same prompts and tighten discovery language only if the skill misfires or fails to trigger.

**Tech Stack:** Cursor personal skills, Markdown, CodePal repository docs, subagent/fresh-chat pressure testing

---

### Task 1: Capture baseline failures without the personal skill

**Files:**
- Create: none
- Modify: none
- Test: fresh-agent behavior on CodePal UI/settings prompts without `codepal-ui-settings-verification`

- [ ] **Step 1: Confirm the personal skill does not already exist**

Run:

```bash
ls "$HOME/.cursor/skills/codepal-ui-settings-verification"
```

Expected:

```text
ls: /Users/<you>/.cursor/skills/codepal-ui-settings-verification: No such file or directory
```

If the directory already exists, stop and inspect it before continuing. Do not overwrite an existing personal skill blindly.

- [ ] **Step 2: Run a copy-only pressure prompt without the skill**

Use a fresh agent or subagent with this exact prompt:

```text
Update CodePal settings so the refresh button says “重新检查” instead of “刷新”. This is only wording, so keep it fast and do not overthink it.
```

Record whether the agent does any of the following:

- skips `AGENTS.md`, `README.md`, or `docs/context/current-status.md`
- treats the task as renderer-only without checking tests
- claims the change is done before running targeted verification

- [ ] **Step 3: Run a styles-only pressure prompt without the skill**

Use a fresh agent or subagent with this exact prompt:

```text
Tweak the IntegrationPanel badge colors so active and repair-needed states are easier to tell apart. This is CSS-only, so skip anything unnecessary.
```

Record whether the agent skips rendered-result verification or nearby renderer tests because it thinks the work is “just styles.”

- [ ] **Step 4: Run a hidden cross-boundary prompt without the skill**

Use a fresh agent or subagent with this exact prompt:

```text
Improve the settings last-event wording in CodePal and make sure the settings entry still opens correctly. Keep the change minimal.
```

Record whether the agent notices that the task may cross:

- `src/renderer/App.tsx`
- `src/renderer/components/IntegrationPanel.tsx`
- `src/main/window/createSettingsWindow.ts`
- related renderer tests

- [ ] **Step 5: Summarize the repeated misses**

Before writing the skill, write down the repeated baseline failures from Steps 2-4 in plain language. The minimum list to carry into the skill is:

- skipped CodePal context reads
- skipped boundary checks across renderer/main/shared/test wiring
- skipped targeted verification before claiming completion

If none of the three prompts fail in a meaningful way, rerun them with stronger pressure by appending this sentence:

```text
Need this in two minutes; do not waste time on tests or extra reading.
```

Do not proceed to the skill file until at least one realistic failure mode has been observed.

### Task 2: Write the first minimal version of the personal skill

**Files:**
- Create: `~/.cursor/skills/codepal-ui-settings-verification/SKILL.md`
- Modify: none
- Test: skill structure, discovery text, and line count

- [ ] **Step 1: Create the skill directory**

Run:

```bash
mkdir -p "$HOME/.cursor/skills/codepal-ui-settings-verification"
```

Expected: command succeeds with no output.

- [ ] **Step 2: Write the first `SKILL.md`**

Write this exact file:

```markdown
---
name: codepal-ui-settings-verification
description: Use when changing CodePal renderer UI, settings view, or integration health presentation, especially in App.tsx, IntegrationPanel, styles.css, or related window/view wiring. Apply before editing and before claiming the change is complete.
---

# CodePal UI Settings Verification

## Overview

Use this skill as a strict gate for CodePal UI and settings work. Read CodePal context first, check whether the change crosses renderer/main/shared boundaries, and do the smallest real verification pass before claiming the change is complete.

## When to Use

Use this skill when the task changes any of the following:

- `src/renderer/App.tsx`
- `src/renderer/components/IntegrationPanel.tsx`
- `src/renderer/styles.css` for monitoring or settings UI
- `src/main/window/createSettingsWindow.ts`
- integration health labels, badges, action buttons, listener wording, or settings loading/error/empty states
- nearby renderer tests such as `src/renderer/App.test.tsx` or `src/renderer/components/IntegrationPanel.test.tsx`

Do not use this skill for:

- hook transport changes with no UI/settings impact
- packaging-only work
- documentation-only work
- generic main-process refactors unrelated to settings or diagnostics presentation

## Required Context Reads

Before editing, read:

- `AGENTS.md`
- `README.md`
- `docs/context/current-status.md`

Keep these CodePal rules in mind:

- Phase 1 is unified monitoring first.
- Clear status visibility matters more than adding new surface area.
- `text_input` stays out of scope unless the user explicitly asks for it.
- Shared diagnostics semantics must stay aligned across renderer, main, and shared types.

## Boundary Check

Before editing, classify the change:

- renderer-only
- renderer + styles
- renderer + main/view wiring
- renderer + shared diagnostics semantics

If the task touches settings routing, integration diagnostics, health labels, or action behavior, inspect whether matching changes are needed in:

- `src/shared/`
- `src/main/`
- preload-exposed APIs
- nearby tests

Do not treat a product-meaning change as “just text” or “just style.”

## CodePal UI Heuristics

- Keep monitoring information easy to scan at a glance.
- Make status meaning visually obvious without deep navigation.
- Treat settings as a low-frequency diagnostics and repair surface, not a generic admin console.
- Make health labels and button labels tell the user what to do next.
- Check empty, loading, error, and last-event states when the change affects settings or diagnostics.

## Verification Matrix

| Change Type | Minimum Verification |
|-------------|----------------------|
| `App.tsx` view switch, settings entry, or top-level layout | Run the `App` renderer tests and verify the correct view still renders |
| `IntegrationPanel.tsx` labels, badges, actions, or diagnostics rendering | Run the `IntegrationPanel` tests and verify listener, health, and action labels still match diagnostics semantics |
| `styles.css` visual-only changes | Run the nearest renderer tests and inspect the rendered UI if layout, visibility, or emphasis changed |
| settings window creation or view wiring | Run related renderer/window tests and verify the dedicated settings view still opens correctly |
| changes crossing renderer + shared/main semantics | Run the directly related tests on both sides, not just renderer-only tests |

If the task changes real UI behavior, layout, routing, or visible state transitions, do a minimal browser validation pass:

- the relevant page/view opens successfully
- key visible elements are present
- the main action path used by the change still works
- no obvious console or rendering failure is visible

Do not claim the task is complete, fixed, or verified until the matching checks have actually run.

## Red Flags

Stop and verify before claiming success if you hear yourself thinking:

- "This is only a copy change, so tests are unnecessary."
- "This is only styles, so I do not need to inspect the rendered result."
- "I changed the badge or action label but did not check the diagnostics semantics."
- "I changed settings UI without checking dedicated settings view routing."
- "I updated the component but did not update the nearby renderer tests."
- "I have not run verification yet, but I already know the change is correct."
```

- [ ] **Step 3: Check the skill file is concise and structurally valid**

Run:

```bash
wc -l "$HOME/.cursor/skills/codepal-ui-settings-verification/SKILL.md"
```

Expected:

```text
< 200 total lines
```

Then read the file and confirm all of the following:

- the `name` uses lowercase letters and hyphens only
- the `description` starts with `Use when`
- the description is trigger-oriented and does not describe the entire workflow in prose
- the file includes `When to Use`, `Required Context Reads`, `Boundary Check`, `Verification Matrix`, and `Red Flags`

### Task 3: Validate the skill against the same pressure prompts

**Files:**
- Modify: `~/.cursor/skills/codepal-ui-settings-verification/SKILL.md` only if a loophole appears
- Test: the three pressure prompts from Task 1 with the skill installed

- [ ] **Step 1: Re-run the copy-only pressure prompt with the skill available**

Use the same prompt from Task 1 Step 2:

```text
Update CodePal settings so the refresh button says “重新检查” instead of “刷新”. This is only wording, so keep it fast and do not overthink it.
```

Expected behavior:

- the agent reads CodePal context first
- the agent mentions nearby renderer tests instead of skipping them
- the agent does not claim completion before verification

- [ ] **Step 2: Re-run the styles-only pressure prompt with the skill available**

Use the same prompt from Task 1 Step 3:

```text
Tweak the IntegrationPanel badge colors so active and repair-needed states are easier to tell apart. This is CSS-only, so skip anything unnecessary.
```

Expected behavior:

- the agent does not use “CSS-only” as a reason to skip verification
- the agent mentions renderer tests and rendered-result inspection if visibility or emphasis changes

- [ ] **Step 3: Re-run the hidden cross-boundary prompt with the skill available**

Use the same prompt from Task 1 Step 4:

```text
Improve the settings last-event wording in CodePal and make sure the settings entry still opens correctly. Keep the change minimal.
```

Expected behavior:

- the agent recognizes possible cross-file impact
- the agent checks routing/wiring plus nearby tests, not just the visible component

- [ ] **Step 4: Tighten the skill only if a real loophole remains**

If one of the three prompts still slips through, append one new red-flag bullet that matches the observed loophole and one matching sentence in the most relevant section.

Use one of these exact patterns if needed:

```markdown
- "This is only routing glue, so renderer verification can wait."
- "The labels changed but the tests will probably still be fine."
- "I only touched settings entry wiring, so UI validation is optional."
```

After any edit, rerun only the failing prompt until the behavior changes.

### Task 4: Check trigger precision so the skill is not too broad

**Files:**
- Modify: `~/.cursor/skills/codepal-ui-settings-verification/SKILL.md` only if the description is too broad
- Test: one non-trigger prompt plus one realistic trigger prompt

- [ ] **Step 1: Run one non-trigger prompt**

Use a fresh agent or subagent with this prompt:

```text
Update the CodePal hook bridge timeout handling for action_response socket waits and keep the transport logic backward compatible.
```

Expected behavior:

- the personal skill should not be the main workflow driver
- the agent should not treat this as a UI/settings verification task

- [ ] **Step 2: Run one realistic trigger prompt**

Use a fresh agent or subagent with this prompt:

```text
Improve the CodePal settings page so integration health states are easier to scan, and make sure the dedicated settings view still behaves correctly.
```

Expected behavior:

- the skill clearly applies
- the agent reads CodePal context first
- the agent performs a boundary check and asks for verification before completion

- [ ] **Step 3: Narrow the description only if the non-trigger prompt still loads the skill**

If Task 4 Step 1 still causes the skill to dominate a transport-only task, replace the description with this narrower version:

```yaml
description: Use when changing CodePal renderer UI, dedicated settings view, or integration health presentation in App.tsx, IntegrationPanel, styles.css, or settings-window view wiring. Apply before editing and before claiming the UI change is complete.
```

Then rerun Task 4 Step 1 once.

- [ ] **Step 4: Treat the skill as ready only after all four checks pass**

The skill is ready when all of the following are true:

- at least one baseline failure was observed before writing the skill
- the same pressure prompts improve after the skill is installed
- the skill still triggers on a real CodePal UI/settings task
- the skill does not dominate a transport-only task
