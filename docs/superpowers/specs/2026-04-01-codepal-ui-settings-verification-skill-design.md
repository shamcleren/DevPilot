# CodePal UI Settings Verification Skill Design

## Context

CodePal Phase 1 is centered on unified monitoring, clear status visibility, and a bounded pending-action loop across multiple IDE and agent integrations.

Recent work added a dedicated settings view for integration diagnostics and hook repair flows. That surface is no longer a pure renderer-only concern. Even small changes may span:

- `src/renderer/App.tsx`
- `src/renderer/components/IntegrationPanel.tsx`
- `src/renderer/styles.css`
- `src/main/window/createSettingsWindow.ts`
- shared integration diagnostics types
- renderer and main-process tests that assert view wiring, labels, and health presentation

This creates a recurring failure mode during future development:

- a change looks like "just UI"
- but it silently affects view routing, health semantics, or renderer/main/shared alignment
- and the work is reported as complete before the smallest meaningful verification has run

The project already has general-purpose skills for frontend design, browser validation, and completion verification. What is missing is a CodePal-specific skill that turns those generic capabilities into a focused gate for UI and settings work in this repository.

## Goals

- Create a personal skill for repeated use during CodePal UI and settings work.
- Trigger specifically on CodePal renderer UI changes and settings / integration health presentation changes.
- Force the agent to check CodePal project context before editing.
- Force the agent to detect when a seemingly local UI change also affects `src/shared/`, `src/main/`, or preload / window wiring.
- Require a minimal verification pass before the agent claims the change is complete.
- Keep the skill narrow enough that it does not fire for unrelated backend or hook-transport work.

## Non-Goals

- Replacing general-purpose frontend design skills.
- Replacing general-purpose browser testing skills.
- Becoming a repository-wide completion workflow for all CodePal changes.
- Covering unrelated main-process or hook transport work that does not affect UI or settings presentation.
- Defining full implementation details for every future UI change.

## Recommended Skill Identity

### Name

`codepal-ui-settings-verification`

### Intended Placement

Personal Cursor skill:

`~/.cursor/skills/codepal-ui-settings-verification/`

This keeps the workflow reusable across future CodePal sessions without adding project-local skill files to the repository.

### Discovery Description

Recommended draft:

```yaml
description: Use when changing CodePal renderer UI, settings view, or integration health presentation, especially in App.tsx, IntegrationPanel, styles.css, or related window/view wiring. Apply before editing and before claiming the change is complete.
```

This description is intentionally narrow and trigger-oriented so the skill does not fire for unrelated repository work.

## Trigger Scope

The skill should activate when the task includes any of the following:

- changes to the main renderer surface in `src/renderer/App.tsx`
- changes to the dedicated settings view in `src/renderer/components/IntegrationPanel.tsx`
- changes to `src/renderer/styles.css` that affect the monitoring panel or settings UI
- changes to settings-window creation or view routing such as `src/main/window/createSettingsWindow.ts`
- changes to integration health labels, badges, action buttons, listener state messaging, or settings-page empty/loading/error presentation
- changes to tests that validate the above behavior, especially:
  - `src/renderer/App.test.tsx`
  - `src/renderer/components/IntegrationPanel.test.tsx`

The skill should not activate for:

- hook transport changes with no renderer or settings impact
- packaging-only work
- documentation-only work
- generic main-process refactors unrelated to UI or settings semantics

## Core Workflow

The skill should behave like a strict repository-specific gate, not a light suggestion list.

### Step 1: Load CodePal Context First

Before editing, the agent must read:

- `AGENTS.md`
- `README.md`
- `docs/context/current-status.md`

The skill should restate the important project guardrails:

- Phase 1 is unified monitoring first.
- Clear status visibility matters more than adding new surface area.
- `text_input` remains out of scope unless explicitly requested.
- Shared event and diagnostics semantics must stay aligned across renderer, main, and shared types.

### Step 2: Perform a Boundary Check

Before editing, the agent must decide whether the task is:

- renderer-only
- renderer + styles
- renderer + main/view wiring
- renderer + shared diagnostics semantics

If the change touches settings routing, integration diagnostics, health labels, or action behavior, the skill should require the agent to inspect whether matching updates are needed in:

- `src/shared/`
- `src/main/`
- preload-exposed APIs
- related tests

The skill should explicitly forbid the common shortcut of treating these changes as "just text or style" when they alter product meaning.

### Step 3: Apply CodePal-Specific UI Heuristics

During implementation, the skill should bias the agent toward these repository-specific expectations:

- Monitoring information should be easy to scan at a glance.
- Status meaning must be visually obvious without deep navigation.
- Settings is a low-frequency diagnostics and repair surface, not a generic admin console.
- Health labels and button labels should tell the user what to do next.
- Empty, loading, error, and last-event states matter because this product often surfaces partial system truth rather than perfect global truth.

This section should guide judgment, not invent new UI requirements.

### Step 4: Require Minimal Verification Before Completion

Before reporting success, the agent must run the smallest meaningful verification set that matches the change.

Minimum expected checks:

- run targeted renderer tests for the changed UI surface
- run targeted lint checks or workspace lint if needed for touched files
- if the task affects real UI behavior, layout, routing, or visible state transitions, perform a minimal browser validation pass

The skill should state that the agent may not claim the work is complete, fixed, or verified until those checks have run and been inspected.

### Step 5: Final Consistency Check

Before closing the task, the agent must confirm:

- UI text and tests still agree
- settings entry points still route to the expected dedicated view
- health badge semantics still match the underlying diagnostics state
- visible states still cover empty, loading, success, and error cases where relevant

## Verification Matrix

The skill should include a compact verification table like this.

| Change Type | Minimum Verification |
|-------------|----------------------|
| `App.tsx` view switch, settings entry, top-level layout | Run `App` renderer tests; verify settings entry still opens or renders the correct view |
| `IntegrationPanel.tsx` labels, badges, action buttons, diagnostics rendering | Run `IntegrationPanel` tests; verify listener, health, and action labels still match the diagnostics shape |
| `styles.css` visual-only changes with no semantic impact | Run the closest renderer tests; do minimal UI validation if layout or visibility changed |
| settings window creation or view wiring | Run related renderer and window/view tests; do minimal UI validation if user-visible routing changed |
| changes crossing renderer + shared/main semantics | Run all directly related tests on both sides, not just renderer snapshots |

The skill should prefer targeted verification over always forcing a full repository test pass, but it should never allow zero verification.

## Browser Validation Rule

When browser validation is needed, the skill should require at least:

- the relevant page/view opens successfully
- key visible elements are present
- the main action path used by the change still works
- no obvious console or rendering failure is observed

This keeps UI verification practical while still enforcing evidence before completion.

## Explicit Red Flags

The skill should include a red-flag section that calls out the most likely failure patterns:

- "This is only a copy change, so tests are unnecessary."
- "This is only styles, so I do not need to inspect the rendered result."
- "I changed the badge or action label but did not check the diagnostics semantics."
- "I changed settings UI without checking dedicated settings view routing."
- "I updated the component but did not update the nearby renderer tests."
- "I have not run verification yet, but I already know the change is correct."

The skill should treat these as stop signs that require a verification pass before completion.

## Relationship to Existing Skills

This skill should be framed as a repository-specific coordinator:

- it does not replace `frontend-design`
- it does not replace `webapp-testing`
- it does not replace `verification-before-completion`

Instead, it specializes those general patterns for the high-risk UI and settings paths in CodePal.

## Suggested SKILL.md Shape

The eventual skill file should stay short and practical:

1. Overview
2. When to Use
3. Required Context Reads
4. Boundary Check
5. CodePal UI Heuristics
6. Verification Matrix
7. Red Flags

No supporting files are required unless later experience shows a reusable browser-validation helper or checklist template is valuable.

## Acceptance Criteria

This design is successful if the eventual skill causes future agents to do all of the following on CodePal UI/settings tasks:

- load CodePal context before editing
- notice when the work crosses renderer/main/shared boundaries
- update nearby tests instead of treating the change as presentation-only
- run a minimal but real verification pass
- avoid claiming completion without evidence

## Implementation Note

Because the chosen scope is personal rather than project-local, the next step after spec approval should be:

1. create the skill under `~/.cursor/skills/codepal-ui-settings-verification/`
2. write a concise `SKILL.md`
3. verify the description is trigger-oriented and not overly broad
4. test the skill against a small CodePal UI change scenario before relying on it
