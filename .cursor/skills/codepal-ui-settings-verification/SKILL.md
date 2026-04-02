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

Finish reading all three files above before you open any task-specific implementation files (for example renderer components, styles, or tests) for this change or run task-directed repository searches for this change.

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

- "I read this skill and searched the repository or opened component or style files before finishing AGENTS.md, README.md, and docs/context/current-status.md."
- "This is only a copy change, so tests are unnecessary."
- "This is only styles, so I do not need to inspect the rendered result."
- "I changed the badge or action label but did not check the diagnostics semantics."
- "I changed settings UI without checking dedicated settings view routing."
- "I updated the component but did not update the nearby renderer tests."
- "I have not run verification yet, but I already know the change is correct."
