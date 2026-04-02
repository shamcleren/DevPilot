# Session UI Refinement Design

## Goal

Refine the Phase 1 monitoring panel so it remains compact under continuous use while making multiple Codex and Cursor sessions easier to distinguish.

This design focuses on six concrete UI problems already observed in the current product:

- settings should not open in a separate window
- sessions need clearer titles
- history must expire automatically
- expanded details should not interfere with lower rows
- status presentation should be more compact
- Codex and Cursor need clearer visual differentiation through color and icon treatment

## Scope

### In Scope

- replace the separate settings window entry with an in-window drawer
- preserve monitoring state while the settings drawer opens and closes
- add stable session title presentation rules in the renderer/shared session model
- add bounded automatic cleanup for historical sessions
- redesign session-row expansion behavior so details stay contained
- compress top-level status presentation
- differentiate Codex and Cursor visually with tool-specific icon and color treatment
- update tests affected by the new UI and store behavior

### Out of Scope

- adding `text_input`
- redesigning the integration diagnostics domain model
- changing Phase 1 pending-action capabilities
- large protocol changes for ingress or adapter normalization beyond title metadata support
- adding external image assets or formal brand packages

## Product Decisions

### 1. Settings Become a Drawer in the Main Window

The settings entry should open a right-side drawer inside the existing renderer window instead of creating a separate `BrowserWindow`.

Requirements:

- the session list remains mounted while the drawer is open
- opening settings must not reset current monitoring rows
- closing settings returns the user to the same scroll position and expanded state
- the drawer supports close via:
  - explicit back/close button
  - backdrop click
  - `Escape`

The current main-process “open settings window” path should be removed from the normal renderer interaction path. Integration diagnostics fetching remains available through the existing preload/main IPC calls.

### 2. Session Rows Need Stable, Human-Readable Titles

Each session row should display a distinct title separate from the lower-priority task summary.

Title resolution rule:

1. use an upstream-provided title if available
2. otherwise build a fallback title from `tool + task`
3. if task is absent or too weak, fall back to `tool + recent time`

To help distinguish visually similar entries, the row should also surface a weak secondary identifier such as a short session-id suffix.

This requires a shared session field for title-like metadata, but fallback construction can still happen in the renderer to preserve compatibility with older payloads.

### 3. History Must Be Bounded

Pending-action expiry is not enough. Historical sessions themselves must be trimmed automatically.

Rules:

- current sessions (`running`, `waiting`) are never removed by history TTL
- non-current sessions enter history and become eligible for cleanup
- cleanup uses both:
  - time retention, recommended default `7 days`
  - count cap, recommended default `150 history sessions`

This keeps long-lived desktop usage bounded even if upstream integrations keep generating completed/error sessions.

### 4. Expanded Details Must Stay Contained

The current details presentation makes the list feel unstable when a session expands.

The revised behavior should:

- make expansion explicit instead of hover-only
- allow only one expanded session at a time
- keep details inside the owning card
- cap detail height and make the detail body internally scrollable when needed
- render pending actions inside the expanded region so the row remains a single contained unit

This keeps lower rows visible and prevents one session from dominating the whole panel.

### 5. Status Must Be More Compact

Status information should remain visible at a glance, but with less vertical weight.

Changes:

- compress the top status bar into a tighter row of chips
- keep only the highest-signal counts for `running`, `waiting`, and `error`
- reduce the visual weight of per-row status from a large badge to a compact pill
- preserve semantic color contrast so status remains scannable

### 6. Codex and Cursor Need Distinct Visual Identity

Codex and Cursor should no longer rely on the same generic badge treatment.

Requirements:

- assign distinct accent colors for each tool family
- replace empty letter-style placeholders with renderer-owned icon treatment
- keep icons lightweight and internal, such as inline SVG or shaped glyph containers
- preserve a neutral fallback for unknown tools

Recommended direction:

- Codex: blue-green / teal family
- Cursor: blue family

The goal is recognition and separation, not strict third-party brand fidelity.

## UX Structure

### Main Layout

The main window remains a single-screen monitoring surface with three layers:

1. compact header with title and settings trigger
2. compact status row
3. scrollable session list

When settings opens, a backdrop and right-side drawer appear above the session list without unmounting the list.

### Session Card Layout

Each session card should present:

- tool icon
- tool name
- title
- compact status pill
- secondary metadata row:
  - task summary
  - duration
  - relative or formatted recent update time
  - short session identifier

Expanded content should include:

- summary/context copy
- recent activities
- pending actions, if any

## Data Model Changes

### Shared Session Type

Add optional title metadata to the shared session model so adapters can provide stronger labels when available.

Recommended shape:

- `title?: string`

This keeps the model simple while allowing better upstream labeling later.

### Session Store

The session store should continue to track all sessions in memory, but cleanup must remove stale historical records during the existing periodic maintenance path.

Recommended additions:

- history expiry helper that removes eligible non-current sessions older than retention
- history count trimming after TTL cleanup

The store remains the source of truth for what gets broadcast to the renderer.

## Error Handling

- If title metadata is missing, fallback title generation must always produce a non-empty label.
- If cleanup thresholds are reached, current sessions must never be deleted.
- If settings diagnostics fail while the drawer is open, the drawer should show an inline error state instead of closing.
- If a pending action exists on an expanded row, interaction should remain usable inside the contained detail region.

## Testing Strategy

### Renderer Tests

- settings opens as an in-app drawer instead of calling the old window-opening path
- closing the drawer keeps session content visible and stateful
- session rows render titles using upstream title first and fallback logic otherwise
- only one session row expands at a time
- expanded content remains rendered within the row card structure
- compact status chips still show correct counts
- tool-specific styling/icons render for Codex and Cursor

### Store Tests

- stale history sessions expire after the configured retention window
- history count cap trims oldest non-current sessions
- running/waiting sessions survive cleanup

### Integration Tests

- existing session broadcast flow still works with the added `title` field
- integration diagnostics can be opened from the renderer drawer flow without spawning a second window

## Implementation Notes

- Prefer renderer state for drawer open/close and row expansion.
- Remove normal use of `window.codepal.openSettings()` from the main app UI.
- Keep current IPC methods for diagnostics/install actions; only the presentation shell changes.
- Favor CSS layout containment over absolute-positioned floating detail panels.
- Keep the current shared session/task pipeline aligned across `src/shared/`, `src/main/session/`, and `src/renderer/`.

## Acceptance Criteria

This refinement is complete when all of the following are true:

1. Clicking settings opens an in-window right drawer and does not create a new Electron window.
2. Closing the drawer returns the user to the same monitoring state without losing current rows.
3. Sessions display distinguishable titles using the approved fallback hierarchy.
4. Historical sessions are automatically bounded by time and count.
5. Expanding a session does not obscure lower sessions and keeps details visually contained.
6. The top status area is visibly more compact while still showing `running`, `waiting`, and `error`.
7. Codex and Cursor are clearly distinguishable by icon and color.
8. `npm test`, `npm run lint`, and `npm run build` pass after the implementation.
