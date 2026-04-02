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

- Phase 1 product validation now prioritizes Codex-first monitoring
- Cursor remains available in-repo and can continue to be calibrated, but is no longer the only acceptance target
- CodeBuddy and PyCharm remain future expansion items and are not part of the current delivery promise

### Current Adapters

- Codex session-log adapter now reads `~/.codex/sessions/**/*.jsonl` and maps recent active session files into the shared session model
- Cursor normalizer plus executable hook bridge remain in-repo for ongoing calibration
- CodeBuddy normalizer remains in-repo for future expansion, but is outside the current Phase 1 acceptance target
- PyCharm is expected to integrate through CodeBuddy plugin payloads rather than a separate adapter
- Cursor and Codex activity flow now normalize into shared `ActivityItem[]` session activity records before render
- Expanded timeline now uses a unified visual hierarchy: message bubbles, execution-style tool cards, and lighter sideband notes/system rows
- Single low-information terminal status notes such as `Working` / `Completed` are now suppressed in the expanded timeline because the top summary row already carries session state
- Low-signal system sideband rows such as `File edited` are now suppressed alongside duplicate status tails, keeping Cursor/Codex closer to the same visual rhythm
- Running sessions now use a sticky pseudo-reply loading indicator inside the expanded timeline footer instead of a duplicated top-row status marker
- Cursor normalizer now covers a broader first-pass activity subset including assistant responses, shell/MCP/read tool calls, tool results, and file-edit system events

### Integration Settings

- Main process diagnostics now expose the current CodePal listener endpoint, executable entrypoint, and per-agent integration health (`active` / `legacy_path` / `repair_needed` / `not_configured`)
- UI can write or repair user-level hook config for:
  - `Cursor` via `~/.cursor/hooks.json`
  - `CodeBuddy` via `~/.codebuddy/settings.json`
- Writes are idempotent and create a backup before overwriting an existing file
- Invalid or incompatible existing config structures are reported back to the UI instead of being force-overwritten

### Test Build

- A macOS internal test build can be produced via `npm run dist:mac`
- Current artifacts are unsigned / ad-hoc and land under `release/`

### Pending Action Loop

- `approval`
- `single_choice`
- `multi_choice`

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
- Default panel must show all task states clearly
- Status markers should be visually obvious
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

- Codex integration currently focuses on session/activity visibility; structured pending-action write-back is not implemented there yet
- Cursor full hook-event calibration is still being expanded beyond the current normalized subset; unknown payloads should continue to be pushed down into adapter/normalizer work instead of renderer-side guessing
- PyCharm / CodeBuddy plugin-specific payloads are intentionally outside the current Phase 1 acceptance target
- The current macOS test build has moved to the executable hook path, but still does not include formal signing / notarization
- Cursor payload calibration is still incomplete beyond the current normalized subset
- Cursor still needs more real-payload calibration for edge-case hook variants and richer tool-result bodies
- Tool card visual upgrade and long-text density optimization have landed in a first pass, but can still be refined after more real payload coverage arrives
- Loading treatment is now clearer for running sessions, but still needs real-session validation to tune wording, prominence, and mixed message/tool timing edge cases
- GitHub Project creation is blocked until `gh auth refresh -s project,read:project` is completed

## Recommended Next Steps

1. Keep expanding Cursor payload coverage so more source/tool/system distinctions are decided inside adapter normalization
2. Refine execution-card content structure against real tool payloads, especially richer tool result and system event variants
3. Continue tuning long-text density and loading prominence for mixed message/tool sessions without reintroducing source-specific renderer branching
4. Verify PyCharm / CodeBuddy plugin payloads against the new fixture matrix after the shared protocol remains stable
