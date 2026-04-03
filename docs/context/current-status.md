# Current Status

## Repository State

- Repository: `shamcleren/CodePal`
- Local path: `personal/shamcleren/private/CodePal`
- Stack: Electron + React + TypeScript + electron-vite + Vitest + Tailwind CSS
- Bootstrap status: complete

## What Already Exists

### App Shell

- Electron main process, preload bridge, tray, and floating window shell
- Renderer monitoring panel with status bar, session rows, recent-activity hover details, plus a separate settings window for integrations
- Shared session and payload types in `src/shared/`

### Monitoring Flow

- Hook / bridge -> IPC Hub -> ingress -> session store -> renderer
- TCP is supported by default
- Unix socket path is also supported when `CODEPAL_SOCKET_PATH` is configured

### Current Phase Focus

- Phase 1 product validation is now explicitly dashboard-first
- Main UI prioritizes session/activity/usage visibility, not control-loop visibility
- Existing pending-action/control code remains in-repo, but is no longer the primary user-facing path
- Cursor remains available in-repo and continues to calibrate usage plus dashboard connection flow
- JetBrains / PyCharm CodeBuddy plugin calibration and deeper Claude / CodeBuddy coverage are the next dashboard-only expansion candidates

### Current Adapters

- Codex session-log adapter now reads `~/.codex/sessions/**/*.jsonl` and maps recent active session files into the shared session model
- Cursor normalizer plus executable hook bridge remain in-repo for ongoing calibration
- CodeBuddy normalizer remains in-repo for future expansion, but is outside the current Phase 1 acceptance target
- PyCharm is expected to integrate through CodeBuddy plugin payloads rather than a separate adapter
- Cursor and Codex activity flow now normalize into shared `ActivityItem[]` session activity records before render
- Claude Code now also feeds the shared monitoring model by reading `~/.claude/projects/**/*.jsonl`, including user/assistant/tool activity plus first-pass token usage
- Cursor and Codex now both have shared fixture-backed calibration baselines under `tests/fixtures/cursor/` and `tests/fixtures/codex/`, and those samples are exercised through adapter plus ingress / watcher tests
- Expanded timeline now uses a unified visual hierarchy: message bubbles, execution-style tool cards, and lighter sideband notes/system rows
- Codex tool-call timeline items now preserve upstream `call_id` / `callId` metadata when available, so later events can be correlated without renderer-side guessing
- Codex tool-result rows can now recover the earlier tool name from the matching call when upstream output events only carry `call_id`, reducing anonymous `Tool` result cards in the panel
- Single low-information terminal status notes such as `Working` / `Completed` are now suppressed in the expanded timeline because the top summary row already carries session state
- Low-signal system sideband rows such as `File edited` are now suppressed alongside duplicate status tails, keeping Cursor/Codex closer to the same visual rhythm
- Running sessions now use a sticky pseudo-reply loading indicator inside the expanded timeline footer instead of a duplicated top-row status marker
- Cursor normalizer now covers a broader first-pass activity subset including assistant responses, shell/MCP/read tool calls, tool results, and file-edit system events
- Session list no longer jumps between `Current / History`; it is now a single flat list ordered by `lastUserMessageAt` first, then `updatedAt`
- Session cards now carry clearer state-level row treatment, including stronger `running` / `waiting` distinction and lightweight running-only motion
- Session cards now also suppress low-value hook/event names such as `Stop` / `UserPromptSubmit` when choosing title and collapsed summary text
- Session history now expires with dashboard-oriented retention windows instead of effectively accumulating forever:
  - `running` / `waiting`: retained
  - `completed` / `idle` / `offline`: 24 hours
  - `error`: 48 hours

### Integration Settings

- Main process diagnostics now expose the current CodePal listener endpoint, executable entrypoint, and per-agent integration health (`active` / `legacy_path` / `repair_needed` / `not_configured`)
- UI can write or repair user-level hook config for:
  - `Codex` via `~/.codex/config.toml` `notify = [...]` (live hook entry groundwork; session-log monitoring remains in place)
  - `Cursor` via `~/.cursor/hooks.json`
  - `CodeBuddy` via `~/.codebuddy/settings.json`
- Writes are idempotent and create a backup before overwriting an existing file
- Invalid or incompatible existing config structures are reported back to the UI instead of being force-overwritten
- Main process now also carries a dedicated usage aggregation path separate from session timeline state
- Renderer top bar now uses a compact quota-first usage strip
- Usage strip now supports `compact` / `detailed` density, with reset times either shown inline or exposed by hover title
- Settings layout is now grouped into:
  - `接入与诊断`
  - `显示与用量`
  - `实验功能`

### Test Build

- A macOS internal test build can be produced via `npm run dist:mac`
- Current artifacts are unsigned / ad-hoc and land under `release/`

### Pending Action Loop

- `approval`
- `single_choice`
- `multi_choice`

`approval` actions still round-trip through the hook path with explicit `allow / deny` semantics. They are no longer treated as generic option payloads internally, while `single_choice` and `multi_choice` continue to use option-value responses.

End-to-end path for tool hooks:

`renderer -> preload -> main -> action_response line` → connect to the `responseTarget.socketPath` stored on that pending action (or env fallback socket when no target is set).

Same `sessionId` may have multiple pending actions at once; each keeps its own optional `responseTarget`, so concurrent blocking hooks receive only their matching `actionId` line.

**Pending lifecycle cleanup (Phase 1, bounded):**

- Duplicate `action_response` payloads for the same `actionId` are rejected after the first successful handling (first-win).
- CodePal removes pending cards when an explicit per-action close signal arrives from the upstream flow.
- When no close signal arrives, pending cards can expire out of the actionable UI after a timeout.
- This is intentional **bounded stale-pending cleanup** for the panel; it is **not** a guarantee of perfect cross-surface consistency with every IDE or hook process.

## Confirmed Product Decisions

- Phase 1 is about unified monitoring first
- Header should only keep high-frequency, actionable information
- Default panel should feel like a usable dashboard, not a control console
- Hover should reveal more context without forcing deep navigation
- Tool identity should use logo-like markers or letter badges
- `text_input` belongs to Phase 2, not Phase 1
- “Do everything in the current window” is not a Phase 1 hard promise

## Important Files

- `README.md`: current repo-level overview and commands
- `AGENTS.md`: session startup expectations and guardrails
- `src/main/`: Electron main process, ingress, IPC Hub, session store
- `src/renderer/`: monitoring UI
- `src/adapters/`: external event normalization
- `src/shared/`: shared session and response payload types
- `src/main/hook/`: executable hook CLI and bridge modules

## Validation Commands

Run from repo root:

```bash
npm test
npm run test:e2e
npm run lint
npm run build
npm run dist:mac
```

## Known Gaps

- Codex integration currently focuses on session/activity visibility; structured pending-action write-back is not part of the current primary UX
- Cursor full hook-event calibration is still being expanded beyond the current normalized subset; unknown payloads should continue to be pushed down into adapter/normalizer work instead of renderer-side guessing
- JetBrains / PyCharm should integrate through CodeBuddy AI conversation data rather than raw chat-agent workspace lifecycle logs
- Claude Code still lacks a real quota/reset source; current coverage is token-usage-first
- CodeBuddy still needs broader real-payload calibration beyond the current normalized subset
- The current macOS test build has moved to the executable hook path, but still does not include formal signing / notarization
- CodePal -> codeagent message sending is still missing; current product is intentionally stronger on monitoring than on active conversation control
- GitHub Project creation is blocked until `gh auth refresh -s project,read:project` is completed

## Delivery Baseline

### Stable Now

- CodePal Phase 1 is a unified monitoring panel first, not a full multi-agent control console
- Main app shell, tray, floating panel, separate settings window, and local packaging flow are already usable
- Shared session model plus `ActivityItem[]` timeline model are already the renderer-facing baseline
- Cursor and Codex both feed the shared monitoring surface; Cursor does so through hook ingress, Codex currently does so through session-log watching
- Supported in-app structured actions remain in the codebase, but are no longer the primary UI path:
  - `approval`
  - `single_choice`
  - `multi_choice`
- Integration diagnostics and repair flow are already in place for Cursor and CodeBuddy user-level hook config
- Cursor dashboard login and spend sync are already in place, including session-expired handling
- Header usage display, usage density switching, and settings regrouping are already in place
- Session ordering and expiration now follow dashboard-oriented defaults

### In Flight

- The highest-priority product gap is broader dashboard coverage across more agents:
  - JetBrains / PyCharm CodeBuddy conversation calibration
  - deeper Claude Code usage / reset calibration
  - broader CodeBuddy payload calibration
- Codex session-log watching now also ingests `event_msg.type = "token_count"` into the usage store for first-pass aggregate tokens / context / rate-limit visibility
- Hook ingress now also has a dedicated usage-extraction path, so Cursor / other agents can populate the unified usage panel as soon as their hook payloads start carrying usage fields
- Codex quota display is now modeled as dual windows and supports detailed reset-time display in the top strip
- Cursor and Codex fixture-backed calibration should continue to expand when new real payloads appear
- Unified usage is now in-product, but other agents still need source-specific usage calibration before the panel becomes truly cross-agent complete

### Explicitly Deferred

- ACP / `acpx` common capability extraction
- freeform `text_input`
- a general CodePal -> codeagent free-text message channel
- deep IDE / terminal pane navigation promises
- moving control-loop UX back onto the main dashboard path

## Recommended Next Steps

1. Finish the current dashboard-first V1 polish:
   - full README/current-status alignment
   - full test/build verification
   - remaining settings and density polish
2. Expand fixture-backed payload coverage when new real Cursor/Codex samples appear
3. Add the next dashboard-only agents:
   - Claude Code
   - CodeBuddy
   - JetBrains
4. Re-evaluate whether any control-loop UX should return to the main path only after dashboard adoption is validated
