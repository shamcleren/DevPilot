# Cursor Phase 1 Product Design

## Goal

Deliver a complete Phase 1 product focused only on Cursor:

- Cursor can be configured from CodePal with one click
- Cursor hook events are fully ingested through the app-owned executable hook path
- Cursor actions are fully surfaced in the panel, including actionable pending items already supported by CodePal
- The app can be packaged as an installable macOS internal test build

This phase explicitly removes CodeBuddy and PyCharm from the product promise. They remain future work and must not shape current scope or acceptance.

## Product Scope

### In Scope

- Cursor-first product messaging across README, settings diagnostics, and packaging expectations
- Full Cursor hook ingestion path using the CodePal executable entrypoint
- Full Cursor action coverage within the limit of events Cursor exposes through hooks
- Mapping Cursor events into:
  - session status
  - activity timeline
  - pending action UI
  - blocking action response write-back
  - pending close / cleanup behavior
- One-click installation or repair of Cursor user hook config
- Validation of installable macOS test artifacts

### Out of Scope

- CodeBuddy and PyCharm functional parity
- Free-form text input
- Precise editor navigation or deep window control
- Signed, notarized, or auto-updating distribution
- Any Cursor behavior not exposed through official hook payloads

## Acceptance Criteria

Phase 1 is complete when all of the following are true:

1. A fresh machine or user profile can install Cursor hooks from CodePal settings without manual file edits.
2. Cursor sessions appear in the panel with correct lifecycle and activity updates.
3. All Cursor hook-exposed action types are either:
   - rendered and handled as a supported CodePal pending action, or
   - explicitly mapped into non-action timeline/status events with no silent drop.
4. Existing supported interactive actions (`approval`, `single_choice`, `multi_choice`) complete the full blocking round-trip from Cursor hook -> CodePal UI -> hook response.
5. Unsupported Cursor action shapes are visible as degraded informational events rather than disappearing.
6. `npm test`, `npm run test:e2e`, `npm run lint`, `npm run build`, and `npm run dist:mac` pass.
7. The resulting `.zip` and `.dmg` artifacts can be used as internal installable test builds.

## Recommended Approach

Use a dedicated Cursor hook pipeline while keeping the existing session store and renderer contracts.

Why this approach:

- It preserves the current stable app core: ingress, session store, pending-action routing, and renderer behavior.
- It avoids a broad multi-adapter refactor that would delay validation.
- It lets Cursor become the first complete adapter without reworking unrelated CodeBuddy logic first.

## Architecture

### 1. Cursor-Owned Hook Pipeline

Replace the current “lifecycle only” Cursor entry with a full Cursor pipeline in the executable hook CLI.

The pipeline must:

- accept raw Cursor hook payloads from stdin
- detect the Cursor hook event type
- normalize the payload into CodePal upstream events
- send ordinary events through the existing send-event bridge
- send blocking actions through the existing blocking-hook bridge so response sockets are injected and matched by `sessionId + actionId`

The current `cursor-lifecycle` path may remain temporarily for compatibility, but settings installation must target the new full Cursor pipeline.

### 2. Cursor Event Normalization Layer

Expand the Cursor adapter from a minimal `StatusChange` parser into a real event matrix.

The normalizer must:

- parse all official Cursor hook event payload shapes used by this product
- extract stable session identity
- derive status transitions consistently
- derive user-facing task/activity wording
- translate interactive actions into CodePal `pendingAction`
- translate action completion/closure into `pendingClosed`
- preserve raw event hints in `meta` for timeline rendering and diagnostics

Normalization rules must prefer explicit payload fields and only use conservative fallback inference.

### 3. Session and Activity Model Reuse

Do not create a Cursor-only session model.

Instead, continue to map Cursor events into the existing shared model:

- `status`
- `task`
- `meta`
- `pendingAction`
- `responseTarget`
- `pendingClosed`

Any new Cursor richness should arrive through `meta` and improved wording, not through a separate renderer path unless the current shared model is proven insufficient.

### 4. Settings and Installation

Cursor integration settings become the primary product entry point.

The installation flow must:

- detect whether `~/.cursor/hooks.json` is absent, compatible, incompatible, legacy, or already active
- write the full Cursor hook configuration idempotently
- back up existing config before overwrite
- report precise remediation status in the settings UI

The health labels should remain simple for the user:

- active
- legacy_path
- repair_needed
- not_configured

But copy and emphasis should make it clear Cursor is the supported Phase 1 integration.

### 5. Packaging

The packaged app must include everything needed for the Cursor hook path to work through the executable entrypoint.

Packaging validation must prove:

- the packaged app computes the correct executable hook command
- settings diagnostics reference the packaged executable path correctly
- generated `.zip` and `.dmg` are suitable for internal installation and demo

Unsigned/ad-hoc distribution remains acceptable in this phase and should be documented clearly.

## Cursor Event Coverage Rules

“Full coverage” in this phase means full coverage of Cursor hook-exposed actions and event types used by CodePal.

For each Cursor hook event category:

- If it represents a session lifecycle change, it must update session status.
- If it represents meaningful work progress, it must appear in the activity timeline.
- If it represents an interactive action that matches current CodePal action capabilities, it must become a pending card and support response write-back.
- If it represents an interactive action outside current CodePal capabilities, it must still surface as a degraded informational event with explicit unsupported metadata.
- If it closes or supersedes a prior action, it must remove or expire the matching pending item cleanly.

No Cursor hook event in the supported matrix may be silently ignored unless it is proven non-user-facing noise and intentionally filtered in the spec-to-plan implementation notes.

## Error Handling

The system must fail visibly and conservatively.

- Invalid Cursor payload JSON should fail the hook invocation with a clear stderr message.
- Missing session identity should reject the event rather than create anonymous sessions.
- Unsupported interactive payloads should not break the hook pipeline; they should degrade into visible non-action events.
- Response socket timeouts should preserve current bounded cleanup behavior and leave enough metadata for diagnosis.
- Incompatible Cursor config structures should be reported, not force-overwritten.

## Testing Strategy

### Unit Tests

- Cursor normalizer coverage for each supported hook event and action shape
- Cursor hook CLI argument parsing and raw payload handling
- Integration service install/repair logic for full Cursor hook config
- Session store updates for Cursor-specific pending open/replace/close flows

### Integration Tests

- Ingress conversion from raw Cursor payload lines into session events
- Blocking hook bridge with Cursor-originated pending actions
- Packaged/unpackaged hook command generation

### E2E Tests

- Settings page installs Cursor hooks
- A simulated Cursor session appears in the panel with activity updates
- Blocking approval and choice actions can be answered from the UI and write back correctly
- Unsupported action shapes degrade visibly instead of disappearing

### Release Verification

- `npm run dist:mac` produces expected artifacts under `release/`
- A smoke check confirms the packaged app still advertises a working executable hook command

## Implementation Boundaries

To keep Phase 1 focused, the work should prefer:

- adapter expansion over renderer reinvention
- shared types over Cursor-only UI state
- explicit documented degradation over speculative support

The work should avoid:

- broad protocol redesign for all adapters
- introducing `text_input`
- pulling CodeBuddy or PyCharm back into current promises

## Rollout Outcome

After this work, CodePal should be demoable as:

- a floating desktop monitor for Cursor sessions
- a settings-driven installer for Cursor hooks
- a panel that shows Cursor activity and handles supported interactive actions
- a macOS test build another internal user can install and try

## Open Decisions Already Resolved

- Phase 1 supports Cursor only
- Packaging is required for acceptance
- “Full coverage” is defined by Cursor hook-exposed actions/events, not undocumented internal Cursor behaviors
