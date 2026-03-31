# Current Status

## Repository State

- Repository: `shamcleren/DevPilot`
- Local path: `personal/shamcleren/private/DevPilot`
- Stack: Electron + React + TypeScript + electron-vite + Vitest + Tailwind CSS
- Bootstrap status: complete

## What Already Exists

### App Shell

- Electron main process, preload bridge, tray, and floating window shell
- Renderer monitoring panel with status bar, session rows, and hover details
- Shared session and payload types in `src/shared/`

### Monitoring Flow

- Hook / bridge -> IPC Hub -> ingress -> session store -> renderer
- TCP is supported by default
- Unix socket path is also supported when `DEVPILOT_SOCKET_PATH` is configured

### Current Adapters

- Cursor normalizer
- CodeBuddy normalizer
- PyCharm is expected to integrate through CodeBuddy plugin payloads rather than a separate adapter

### Pending Action Loop

- `approval`
- `single_choice`
- `multi_choice`

Current state only guarantees the in-app loop:

`renderer -> preload -> main -> action_response payload construction`

The response is not yet fully delivered back to external tool hooks.

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
- `scripts/hooks/`: hook wrappers
- `scripts/bridge/send-event.mjs`: bridge sender

## Validation Commands

Run from repo root:

```bash
npm test
npm run lint
npm run build
```

## Known Gaps

- External `action_response` write-back is not finished
- CodeBuddy real-world payload shapes still need live calibration
- Activity flow in the UI is still shallow compared with the full design intent
- GitHub Project creation is blocked until `gh auth refresh -s project,read:project` is completed

## Recommended Next Steps

1. Finish external `action_response` delivery
2. Add richer activity events into session state and renderer
3. Verify real Cursor / CodeBuddy / PyCharm integration payloads
4. Add issue tracking / project board after GitHub project scopes are granted
