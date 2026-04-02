# Unified Activity Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move session activity semantics into a shared schema flowing from adapters through the store into the renderer.

**Architecture:** Introduce `ActivityItem` in shared types, emit normalized activity items from Cursor and Codex adapters, keep a compatibility fallback in the session store for producers not yet migrated, and simplify renderer mapping so it only consumes shared schema. Preserve pending-action lifecycle behavior while replacing old string-based timeline reconstruction.

**Tech Stack:** TypeScript, Vitest, React, Electron

---

### Task 1: Define shared activity types

**Files:**
- Modify: `src/shared/sessionTypes.ts`
- Modify: `src/adapters/shared/eventEnvelope.ts`
- Test: `src/main/session/sessionStore.test.ts`

- [ ] Add failing tests that expect `SessionRecord` snapshots to expose normalized `activityItems` instead of only string activity lines.
- [ ] Run `npm test -- src/main/session/sessionStore.test.ts` and verify the new assertions fail.
- [ ] Add `ActivityItem` and related unions to shared session types and extend the upstream event envelope with optional `activityItems`.
- [ ] Re-run `npm test -- src/main/session/sessionStore.test.ts` and confirm type-level and runtime expectations pass or advance to the next failing case.

### Task 2: Normalize Cursor and Codex activity items

**Files:**
- Modify: `src/adapters/cursor/normalizeCursorEvent.ts`
- Modify: `src/adapters/codex/normalizeCodexLogEvent.ts`
- Test: `src/adapters/cursor/normalizeCursorEvent.test.ts`
- Test: `src/adapters/codex/normalizeCodexLogEvent.test.ts`

- [ ] Add failing adapter tests for Cursor tool calls, waiting notifications, unsupported actions, Codex user messages, assistant completions, and system events to assert `activityItems` content.
- [ ] Run `npm test -- src/adapters/cursor/normalizeCursorEvent.test.ts src/adapters/codex/normalizeCodexLogEvent.test.ts` and verify the new assertions fail.
- [ ] Implement minimal adapter changes so Cursor and Codex emit `activityItems` matching the shared schema.
- [ ] Re-run the focused adapter tests and confirm they pass.

### Task 3: Migrate store accumulation to shared activity items

**Files:**
- Modify: `src/main/session/sessionStore.ts`
- Modify: `src/main/ingress/hookIngress.ts`
- Modify: `src/main/codex/codexSessionWatcher.ts`
- Test: `src/main/session/sessionStore.test.ts`

- [ ] Add failing store tests for reverse-chronological `activityItems`, pending-close system items, and compatibility fallback behavior when an event has only `task/meta`.
- [ ] Run `npm test -- src/main/session/sessionStore.test.ts` and verify the new store assertions fail for the right reason.
- [ ] Implement store accumulation, dedupe, truncation, and fallback generation using `activityItems`.
- [ ] Thread `activityItems` through ingress and Codex watcher.
- [ ] Re-run `npm test -- src/main/session/sessionStore.test.ts` and confirm the store path is green.

### Task 4: Simplify renderer to consume shared schema

**Files:**
- Modify: `src/renderer/monitorSession.ts`
- Modify: `src/renderer/sessionRows.ts`
- Modify: `src/renderer/components/HoverDetails.tsx`
- Modify: `src/renderer/components/SessionRow.tsx`
- Test: `src/renderer/sessionRows.test.ts`
- Test: `src/renderer/components/SessionRow.test.tsx`
- Test: `src/renderer/sessionBootstrap.test.ts`

- [ ] Add failing renderer tests that build rows from `activityItems` and assert message/tool/note/system rendering without string classification.
- [ ] Run `npm test -- src/renderer/sessionRows.test.ts src/renderer/components/SessionRow.test.tsx src/renderer/sessionBootstrap.test.ts` and verify the new assertions fail.
- [ ] Replace string parsing in `sessionRows.ts` with direct shared-schema consumption.
- [ ] Update hover and session row components to render the normalized schema.
- [ ] Re-run the focused renderer tests and confirm they pass.

### Task 5: Update handoff and verify

**Files:**
- Modify: `docs/context/current-status.md`

- [ ] Update the handoff doc to record the unified activity-model migration and explicitly preserve the remaining follow-up items: Cursor payload calibration, tool-card visual upgrade, and long-text density optimization.
- [ ] Run `npm test -- src/adapters/cursor/normalizeCursorEvent.test.ts src/adapters/codex/normalizeCodexLogEvent.test.ts src/main/session/sessionStore.test.ts src/renderer/sessionRows.test.ts src/renderer/components/SessionRow.test.tsx src/renderer/sessionBootstrap.test.ts`.
- [ ] Run `npm run lint`.
- [ ] If both commands pass, summarize the migrated flow and remaining follow-up work in the final handoff.
