# Self-Contained Hook Bridge Design

## Context

CodePal Phase 1 already has the core monitoring loop, pending action loop, bounded stale-pending cleanup, integration settings UI, and a distributable macOS test build.

Current product gap:

- Hook execution still depends on external runtimes on the user machine.
- `Cursor` and `CodeBuddy` hook entrypoints currently end up calling `node`-based bridge scripts.
- Lightweight payload transforms inside shell wrappers still depend on `python3`.
- The settings page can therefore report `node` / `python3` as missing, which means a freshly installed CodePal build is not actually self-contained.

Current chain (simplified):

`tool hook -> shell wrapper -> node/python helper -> CodePal IPC -> sessionStore -> renderer`

That is acceptable for early bootstrap, but it is not acceptable for the intended product direction:

- development builds and shipped builds should behave the same way
- a newly installed build should work immediately
- future native bridge work (Swift / Dynamic Island style UI) should build on a stable local protocol rather than on shell wrappers and external runtimes

The user-approved product decision for this round is:

- split the larger roadmap into three rounds
- round 1 focuses only on removing all external runtime dependencies from the formal hook path
- old `scripts/hooks/*.sh` based product path should be retired rather than maintained as a permanent fallback

## Goals

- Remove external `node` and `python3` requirements from the formal CodePal hook path.
- Make development builds and packaged builds use the same hook architecture.
- Allow a newly installed CodePal build to receive events and complete blocking hook write-back without requiring extra runtime installation.
- Replace the formal shell-script hook path with direct `CodePal` executable invocation.
- Preserve all existing Phase 1 semantics for:
  - status ingress
  - `approval`
  - `single_choice`
  - `multi_choice`
  - per-action `responseTarget`
  - first-win response handling
  - bounded stale-pending cleanup
- Create a reusable bridge/protocol foundation for a future Swift bridge without implementing Swift in this round.

## Non-Goals

- Implementing the Swift bridge in this round.
- Implementing Dynamic Island or any native floating UI in this round.
- Redesigning the main session UI beyond what is required for updated diagnostics.
- Supporting the old shell-script product path as a long-term compatibility layer.
- Adding new interaction primitives such as `text_input`.
- Replacing the existing local IPC/session model with ACP or another external protocol.

## Round Structure

This design only specifies **round 1** of the approved three-round roadmap.

Planned roadmap:

1. **Round 1**
   - self-contained hook bridge
   - no external runtime dependency
   - stable executable-based hook entrypoints
2. **Round 2**
   - minimum Swift bridge skeleton
   - reuse the round-1 local protocol and session model
3. **Round 3**
   - native Dynamic Island style presentation and interaction

This spec intentionally excludes round 2 and round 3 implementation details.

## Recommended Approach

Use the `CodePal` executable itself as the formal hook bridge entrypoint.

Instead of writing user hook configuration to shell scripts such as:

- `scripts/hooks/cursor-hook.sh`
- `scripts/hooks/cursor-agent-hook.sh`
- `scripts/hooks/codebuddy-hook.sh`

CodePal should write commands that invoke the application executable directly, for example:

- `CodePal --codepal-hook codebuddy`
- `CodePal --codepal-hook cursor-lifecycle sessionStart`
- `CodePal --codepal-hook cursor-lifecycle stop`

High-level behavior:

1. CodePal gains a **hook subcommand mode** alongside normal GUI startup.
2. The hook subcommand runs with **no window creation**.
3. It reads stdin / argv, normalizes payloads, and sends events into the existing IPC hub.
4. For blocking pending-action flows, it also creates a response collector, injects `responseTarget`, waits for the first `action_response`, prints it to stdout, and exits.
5. Integration settings stop managing shell-wrapper paths and instead manage executable-based commands.
6. Old script-based product hooks are treated as a legacy state that should be migrated away from, not preserved as the normal path.

## Runtime Modes

CodePal should support two startup modes:

### 1. GUI Mode

Normal behavior:

- start Electron app
- create main window
- create settings window on demand
- create tray
- start IPC hub
- run session and pending-action flows as today

### 2. Hook Subcommand Mode

New behavior:

- parse `--codepal-hook ...` arguments before GUI bootstrap
- do not create any BrowserWindow
- do not create tray
- do not start renderer/UI work
- execute one hook request synchronously
- exit with success/failure status

This keeps the executable path stable while separating headless bridge behavior from GUI startup.

## Command Shape

Round 1 should standardize around explicit hook modes.

Recommended command families:

- `--codepal-hook codebuddy`
- `--codepal-hook cursor-lifecycle sessionStart`
- `--codepal-hook cursor-lifecycle stop`

Design rules:

- hook mode names should describe behavior, not internal implementation
- the same logical command shape should be used in development and packaged builds
- differences between dev and packaged execution should be hidden inside command generation logic, not spread across multiple files

## Internal Architecture

Round 1 should extract the bridge logic into focused units instead of leaving it spread across scripts.

### 1. `hookCli`

Responsibility:

- parse hook mode arguments
- validate argument shape
- dispatch to the correct internal handler
- return process exit code / stdout / stderr behavior

### 2. `hookBridgeCore`

Responsibility:

- read stdin or argv payload
- parse JSON
- send normalized event into CodePal IPC
- if needed, create a collector socket
- attach `responseTarget`
- wait for first response line
- print line to stdout and exit

This replaces the behavior currently split across `send-event.mjs` and `run-blocking-hook.mjs`.

### 3. `hookNormalizers`

Responsibility:

- convert Cursor lifecycle hook payloads into CodePal upstream events
- convert CodeBuddy raw payloads into the same unified event shape
- keep normalization logic in TypeScript, not in shell + Python snippets

### 4. `hookCommandBuilder`

Responsibility:

- produce the exact command string that should be written into `Cursor` and `CodeBuddy` config
- hide dev-vs-packaged differences
- centralize quoting and argument layout
- ensure settings UI, diagnostics, and tests all use the same generated command source

### 5. Existing Main-Process Units That Stay

These should remain the source of truth:

- `hookIngress`
- `sessionStore`
- `dispatchActionResponse`
- `createActionResponseTransport`
- integration diagnostics service

Round 1 changes the execution shell around them, not the product contract they already implement.

## Data Flow

### A. Non-Blocking Ingress

1. External tool invokes `CodePal --codepal-hook ...`
2. Hook subcommand reads stdin JSON
3. Subcommand normalizes the payload into the existing upstream event shape
4. Subcommand sends one line into the CodePal IPC hub
5. Main-process ingress/session flow proceeds exactly as today
6. Subcommand exits successfully

### B. Blocking Pending-Action Path

1. External tool invokes `CodePal --codepal-hook codebuddy` (or another blocking-capable mode)
2. Hook subcommand detects a valid `pendingAction`
3. Subcommand creates a short-lived collector socket
4. Subcommand injects:

```json
{
  "responseTarget": {
    "mode": "socket",
    "socketPath": "/tmp/codepal-response-xxxx.sock",
    "timeoutMs": 10000
  }
}
```

5. Subcommand forwards the event into CodePal IPC
6. User responds in CodePal UI
7. Main process routes the existing `action_response` payload to the stored `responseTarget`
8. Hook subcommand receives the first response line, prints it to stdout, and exits

This preserves the current blocking semantics while removing external runtime dependencies.

## Pending-Action Semantics

Round 1 must preserve existing semantics rather than redesign them.

Required preserved behavior:

- per-action `responseTarget`
- same-session multiple `actionId` support
- first-win local consumption
- duplicate response rejection / no-op behavior
- pending timeout expiry behavior
- explicit per-action close behavior when available

Round 1 should be treated as a bridge-shell migration, not a pending-action protocol redesign.

## Migration Strategy

This round uses a **one-way migration to the new formal path**.

### Formal policy

- old `scripts/hooks/*.sh` product path is retired
- settings UI should no longer present old scripts as the intended hook path
- all new writes should target executable-based commands

### Integration states

For diagnostics, CodePal should distinguish:

- `not_configured`
  - no CodePal-managed hook is present
- `legacy_path`
  - a CodePal-managed hook still points at old scripts or old `node ...mjs` entrypoints
- `active`
  - hook config points at the new executable-based command and the chain is healthy
- `repair_needed`
  - new path is intended, but the command or health state is broken

UI action language should become:

- `启用`
- `迁移`
- `修复`

instead of exposing legacy/internal implementation names to the user.

### Safe rewrite rules

Migration must follow these rules:

- only rewrite CodePal-managed entries
- do not erase unrelated user hooks
- back up the config file before rewriting
- refuse destructive overwrite when config structure is incompatible

## Development vs Packaged Behavior

The user explicitly wants development and shipped builds to behave consistently.

That does **not** mean the literal command string must be identical in every environment.
It means the architecture and behavior must be the same.

Therefore:

- both dev and packaged environments should use executable-based hook invocation
- command generation may differ internally depending on how the current app is launched
- that difference must live in `hookCommandBuilder` only

Unacceptable pattern:

- packaged builds use executable hook mode
- development builds keep using shell scripts and external `node`

Acceptable pattern:

- both environments use hook subcommand mode
- the exact launch command is resolved centrally for the current environment

## Diagnostics and Settings Impact

Round 1 changes what “health” means.

Current settings page still surfaces external runtime availability. After this migration, that should no longer be a primary health requirement for the hook path.

Settings/diagnostics should instead focus on:

- whether CodePal hook commands are written correctly
- whether the current CodePal executable command is valid
- whether recent events have been received
- whether the response/write-back path is healthy
- whether the config is still on the legacy path and needs migration

`node` / `python3` should stop being blocker-level health requirements for the formal product flow.

## Testing Strategy

Round 1 should add verification at four levels.

### 1. Unit Tests

Add focused tests for:

- hook CLI argument parsing
- command generation for dev and packaged modes
- Cursor lifecycle normalization from stdin
- CodeBuddy normalization and route injection
- collector lifecycle and response wait
- response target injection and timeout behavior

### 2. Integration Tests

Verify:

- hook subcommand sends newline-terminated events into the IPC hub
- hook subcommand can run headlessly without opening windows
- hook subcommand prints the first `action_response` line on blocking flows
- invalid arguments fail fast and visibly

### 3. End-to-End Regression

Preserve existing functional guarantees:

- `approval`
- `single_choice`
- `multi_choice`
- first-win behavior
- bounded stale-pending cleanup
- multiple concurrent pending requests

The E2E entrypoint should be switched to the new executable path so tests cover the future formal product path instead of the retired script path.

### 4. Packaging Verification

Round 1 is not complete unless packaged verification proves:

- a generated macOS build can be configured as the hook target
- no external `node` / `python3` installation is required for the formal hook path
- ingress and blocking write-back work through the packaged executable

## Documentation Changes

When round 1 lands, update:

- `README.md`
- `docs/context/current-status.md`
- integration settings copy

Documentation changes should:

- stop presenting `scripts/hooks/*.sh` as the formal path
- stop documenting external runtime requirements for normal product use
- explain that CodePal now manages hooks through its own executable

## Legacy Script Handling

Because the approved strategy is to retire the old path, round 1 should end with:

- no product-facing documentation pointing users to `scripts/hooks/*.sh`
- no settings writes generating script-based hook commands
- legacy script path treated only as a migration detection target

If temporary internal test scaffolding must remain during migration, it should be treated as internal-only and not as a supported product path.

## Risks

### 1. Command generation drift

Risk:

- multiple files hand-build slightly different executable commands

Mitigation:

- centralize all command generation in `hookCommandBuilder`
- make diagnostics and config writers consume the same source

### 2. Blocking hook regression

Risk:

- bridge-shell rewrite breaks response waiting or stdout emission

Mitigation:

- preserve current per-request collector semantics
- write regression tests before migrating implementation

### 3. Dev vs packaged divergence

Risk:

- development mode silently keeps an old path while packaged mode uses the new one

Mitigation:

- require both environments to use hook subcommand architecture
- add explicit tests for both command-generation branches

### 4. Destructive config rewrites

Risk:

- migration overwrites user-managed hooks

Mitigation:

- only rewrite CodePal-managed entries
- retain backups
- reject incompatible structures

## Acceptance Criteria

Round 1 is complete only if all of the following are true:

- external `node` and `python3` are no longer required for the formal CodePal hook path
- new hook config written by settings directly invokes the CodePal executable
- old script-based hook path is detected as legacy and can be migrated away from
- blocking pending-action write-back still works
- development and packaged builds use the same hook architecture
- settings no longer treat `node/python3` absence as a blocker for the formal product path
- packaged verification proves a newly installed build can work without extra runtime installation

## File-Level Impact

Expected touched areas for implementation planning:

- `src/main/main.ts`
  - early mode detection for GUI vs hook CLI execution
- new hook-cli / bridge-core modules under `src/main/`
  - internal replacement for script bridge behavior
- `src/main/integrations/integrationService.ts`
  - command generation, diagnostics migration states, config rewriting
- `src/shared/`
  - only if new internal/shared hook mode types are needed
- tests under `src/main/` and `tests/e2e/`
  - new executable-path verification
- docs
  - formal path and runtime requirement updates

## Out of Scope Reminder

This design does not yet specify:

- Swift bridge interfaces in detail
- native menu bar / Dynamic Island UI
- second-round native helper process structure

Round 1 should deliberately stop once the self-contained executable-based bridge foundation is complete.
