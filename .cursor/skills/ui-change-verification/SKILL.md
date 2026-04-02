---
name: ui-change-verification
description: Use when changing UI copy, styling, settings surfaces, or other visible interface behavior in this repository and you need to check project context, boundary impact, and minimum verification before claiming completion.
---

# UI Change Verification

## Overview

Use this skill as a general gate for UI changes in CodePal. Read project context first, decide whether the change crosses presentation, state, or window-routing boundaries, and run the smallest real verification set before claiming completion.

For CodePal settings and integration-health work, prefer using this together with `codepal-ui-settings-verification`.

## When to Use

Use this skill when the task changes any of the following:

- visible copy, labels, buttons, badges, or loading/empty/error states
- styles or visual emphasis
- settings, preferences, or diagnostics surfaces
- routing, window, or view wiring that changes what the user sees

Do not use this skill for:

- backend-only work
- transport-only or protocol-only work
- packaging-only work
- documentation-only work

## Required Context Reads

Before editing, read these first:

- `AGENTS.md`
- `README.md`
- `docs/context/current-status.md`

Treat those files as required context, not optional background.

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
| settings/diagnostics view changes | run related UI tests and verify the affected view still opens and behaves correctly |
| routing/window/main/shared UI wiring | run the directly related tests on both sides, not only renderer-level tests |

Run lint when the touched files or the project workflow make it relevant.

If visible behavior changed, do a minimal UI check:

- the relevant screen or view opens
- key elements are visible
- the changed interaction still works
- no obvious rendering failure is present

Do not claim the task is complete, fixed, or verified until the matching checks have actually run.

## Red Flags

Stop and verify before claiming success if you hear yourself thinking:

- "This is only a copy change, so tests are unnecessary."
- "This is only styles, so I do not need to inspect the rendered result."
- "I can grep or open the component first and catch up on AGENTS.md, README.md, or current-status later."
- "I started searching files before I finished reading the project's context docs."
- "I have not run verification yet, but it should be fine."
