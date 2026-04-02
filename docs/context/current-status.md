# Current Status

## Repository State

- Repository: `shamcleren/CodePal`
- Local path: `personal/shamcleren/private/CodePal`
- Stack: Electron + React + TypeScript + electron-vite + Vitest + Tailwind CSS
- Bootstrap status: complete

## What Already Exists

### App Shell

- Electron main process, preload bridge, tray, and floating window shell
- Renderer monitoring panel with status bar, session rows, hover details, plus a separate settings window for integrations
- Shared session and payload types in `src/shared/`

### Monitoring Flow

- Hook / bridge -> IPC Hub -> ingress -> session store -> renderer
- TCP is supported by default
- Unix socket path is also supported when `CODEPAL_SOCKET_PATH` is configured

### Current Adapters

- Cursor normalizer plus a minimal official Cursor hook bridge for lifecycle events (`sessionStart` / `stop`)
- CodeBuddy normalizer with fixture-driven CLI / hook calibration for explicit status fields plus documented hook events (`SessionStart`, `Notification`, `UserPromptSubmit`, `PreToolUse`, `SessionEnd`)
- PyCharm is expected to integrate through CodeBuddy plugin payloads rather than a separate adapter

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

- PyCharm / CodeBuddy plugin-specific payloads are still outside the calibrated mainline; this round only stabilizes CodeBuddy CLI / hook payloads
- Cursor auto-config currently enables only the minimal lifecycle hook bridge; it does not recreate the full pending-action semantics from the existing custom `StatusChange` path
- The current macOS test build has moved to the executable hook path, but still does not include formal signing / notarization
- Activity flow in the UI is still shallow compared with the full design intent
- GitHub Project creation is blocked until `gh auth refresh -s project,read:project` is completed

## Recommended Next Steps

1. Add richer activity events into session state and renderer
2. Package hook forwarding into a more self-contained runtime so test builds do not depend on system `node` / `python3`
3. Verify PyCharm / CodeBuddy plugin payloads against the new fixture matrix
