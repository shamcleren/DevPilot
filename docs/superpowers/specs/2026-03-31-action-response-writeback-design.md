# Action Response Write-Back Design

## Context

DevPilot Phase 1 already supports the in-app pending action loop:

`hook / bridge -> IPC hub -> ingress -> session store -> renderer -> preload -> main -> action_response payload`

What is still missing is the external write-back leg. The current hook wrapper scripts only forward upstream events into DevPilot. They do not wait for a user choice and do not return an `action_response` payload back to the blocked external tool hook.

This design closes that gap without introducing `text_input` or a larger callback/session orchestration layer.

Current product expectation for this iteration:

- DevPilot remains an additive capability and must not become a prerequisite for the native agent path.
- The current hook/socket model may still produce `stale pending` UI if the native agent consumes a request and DevPilot does not receive an explicit close signal.
- The first fix is to add pending lifecycle cleanup semantics on top of the existing model, not to switch protocols.

## Goals

- Finish the Phase 1 external `action_response` write-back loop.
- Keep the change set small and aligned with the current architecture.
- Preserve the existing renderer interaction model.
- Reuse the existing `action_response` payload format.
- Support `approval`, `single_choice`, and `multi_choice`.
- Support concurrent waiting and reply routing across multiple agents as long as they are represented by distinct pending requests.
- Support multiple concurrent pending requests under the same `sessionId`.
- Minimize misleading `stale pending` UI by adding timeout, close broadcast, and duplicate-response protections.

## Non-Goals

- Adding `text_input` or any Phase 2 interaction type.
- Reworking the renderer pending action UX.
- Introducing a main-process callback registry or token-based rendezvous system.
- Solving reconnect, retry queueing, or offline delivery.
- Replacing the current hook/socket transport with ACP or another protocol as the first remedy for stale pending.

## Recommended Approach

Use a minimal per-request response target carried with the incoming hook event.

When a hook wrapper receives an upstream payload with `pendingAction`, it should:

1. Create a short-lived local response collector.
2. Attach a `responseTarget` object to the event before forwarding it to DevPilot.
3. Send the event to DevPilot through the existing bridge.
4. Block waiting for a single `action_response`.
5. Print the response line to stdout and exit.

When DevPilot receives a user selection, the main process should:

1. Resolve the matching pending action from `sessionStore`.
2. Prefer the pending action's stored `responseTarget`.
3. Send the existing JSON `action_response` payload to that target.
4. Clear the pending action from session state after a successful one-shot send.

If no per-request `responseTarget` is present, DevPilot should keep the current transport behavior and use the process-level fallback configured by environment variables. This preserves the current E2E test path and gives us a safe compatibility fallback.

## Pending Lifecycle and Consistency Model

This iteration should not promise strict cross-surface consistency. It should promise bounded inconsistency with explicit cleanup.

Pending request lifecycle:

- `open`
  - request is visible and actionable in DevPilot
- `consumed`
  - one side has already won the request; the pending card must be removed immediately
- `expired`
  - no close signal arrived before timeout; the request should no longer look actionable

Consistency rules:

- First successful consumer wins for a given `(sessionId, actionId)`.
- Any later response for the same `(sessionId, actionId)` must be rejected as a duplicate or ignored as a no-op.
- DevPilot-originated success must immediately transition that request to `consumed` locally before the next full refresh.
- Native-agent-originated success should be reflected back through a close signal so DevPilot can transition the matching request to `consumed`.
- If no close signal ever arrives, timeout must eventually transition the request out of the actionable pending state so the UI does not imply the agent is still blocked forever.

Close signal strategy:

- Minimum compatibility path for this iteration:
  - reuse existing upstream semantics where possible, including `pendingAction: null` as a coarse session-level clear
- Recommended addition for correctness:
  - add a per-action consumed/closed event so DevPilot can remove only the matching `actionId`

This means the short-term product promise becomes:

- the current version may briefly show stale pending
- the system should aggressively shrink that stale window
- the stale window should not remain unbounded

## Data Model

Add a bridge-only response target type:

```ts
type ResponseTarget = {
  mode: "socket";
  socketPath: string;
  timeoutMs?: number;
};
```

Design rules:

- `responseTarget` is optional.
- `responseTarget` is stored per pending request, not per session.
- The existing `ActionResponsePayload` shape stays unchanged.

Recommended type placement:

- Add `ResponseTarget` to `src/shared/sessionTypes.ts` so ingress, session, and main transport code share a single definition.
- Extend `SessionEvent` in `src/main/session/sessionStore.ts` with optional `responseTarget`.
- Replace the shared renderer-facing `SessionRecord.pendingAction` field with `pendingActions?: PendingAction[]`.
- Extend the internal main-process session record shape to store pending requests keyed by `actionId`, with each entry carrying both `PendingAction` and optional `responseTarget`.

Recommended internal shape:

```ts
type PendingActionRuntimeState = {
  action: PendingAction;
  responseTarget?: ResponseTarget;
  updatedAt: number;
  expiresAt?: number;
};
```

Renderer-facing rule:

- The renderer receives only `pendingActions`.
- The renderer does not receive `responseTarget`.
- The renderer renders all active pending requests for the session.
- The renderer should remove a pending request immediately once it becomes `consumed` or `expired`.

## Concurrency Model

The routing unit for write-back is a single pending request, identified by:

- `sessionId`
- `actionId`

Design rules:

- Each hook invocation with `pendingAction` creates its own short-lived response collector.
- Each pending request carries its own `responseTarget`.
- `dispatchActionResponse()` must resolve the destination by `(sessionId, actionId)`, not by any process-global "current waiter".
- Multiple agents can block concurrently as long as they produce distinct pending requests.
- Multiple hook processes can wait concurrently because each one owns a separate collector socket.
- Responses may arrive in any order; each response must be routed only to its matching pending request.
- The same `sessionId` may hold multiple active pending requests at once.
- A pending request is upserted by `actionId`; reusing the same `actionId` replaces the previous runtime state for that action.

This means the design explicitly supports:

- agent A waiting for request `(session-a, action-1)`
- agent B waiting for request `(session-b, action-9)`
- the user replying to B first and A later

with both hook processes continuing to wait independently until their own response arrives or times out.

This is mainly a safety and protocol-correctness guarantee. In many normal flows a single session will still behave linearly, but the store and routing model should not break if one session emits a second blocked request before the first one is answered.

## Pending Action Event Semantics

Because the current upstream event shape carries only one `pendingAction` field per event, this iteration defines the following semantics:

- `pendingAction: { ... }`
  - upsert this action by `actionId` into the session's pending request set
- `pendingAction: null`
  - clear all pending requests for that session
- missing `pendingAction`
  - do not modify the session's pending request set

This keeps the upstream protocol compatible while allowing the session to accumulate multiple active pending requests over time.

Recommended close semantics to reduce stale pending:

- `pendingClosed: { actionId, reason }`
  - clear only the matching action by `actionId`
- `pendingAction: null`
  - retain the current coarse "clear all pending requests for the session" behavior as a fallback

Recommended close reasons:

- `consumed_local`
- `consumed_remote`
- `expired`
- `cancelled`

## End-to-End Flow

### Upstream Hook Path

1. External tool triggers a blocking hook with a payload containing `pendingAction`.
2. `scripts/hooks/cursor-hook.sh` or `scripts/hooks/codebuddy-hook.sh` normalizes the incoming JSON.
3. The hook starts a response collector and adds:

```json
{
  "responseTarget": {
    "mode": "socket",
    "socketPath": "/tmp/devpilot-response-xxxx.sock",
    "timeoutMs": 25000
  }
}
```

4. The hook forwards the event through `scripts/bridge/send-event.mjs`.
5. `hookIngress` parses the event and carries `pendingAction` plus optional `responseTarget` into `SessionEvent`.
6. `sessionStore.applyEvent()` upserts the pending request by `actionId` and stores its response target alongside it.

### Downstream Response Path

1. The renderer submits a pending action selection as it does today.
2. `dispatchActionResponse()` asks the store to resolve the pending request by `(sessionId, actionId)` and the matching response destination.
3. The main process serializes the existing `action_response` payload.
4. The transport sends the line to the pending action's `responseTarget`.
5. After a successful send, the store marks only that pending request as `consumed`, rejects later duplicates for the same key, and removes it from the renderer-facing state immediately.
6. The hook collector receives the line, writes it to stdout, and exits.

### Native-Agent Close Path

1. The native agent path consumes the blocked request outside DevPilot.
2. The integration should emit a consumed/closed signal back into DevPilot.
3. `hookIngress` converts that close signal into a per-action close operation when available, or falls back to the current session-level clear semantics.
4. The store marks the matching request as closed and the renderer removes it immediately.
5. If no signal is emitted, timeout eventually expires the request so it no longer appears actionable forever.

## Main-Process Changes

### Ingress

`src/main/ingress/hookIngress.ts`

- Parse an optional `responseTarget` field from raw hook payloads.
- Only accept well-formed socket targets.
- Ignore malformed `responseTarget` values rather than failing the whole event.
- Parse an optional pending-close signal when present.
- Preserve compatibility with payloads that do not yet emit explicit close signals.

### Session Store

`src/main/session/sessionStore.ts`

- Replace the current single `pendingAction` state with a per-session collection keyed by `actionId`.
- Store an internal response target together with each pending request.
- When a new pending action arrives with an existing `actionId`, replace that action's runtime state.
- When `pendingAction` becomes `null`, clear all pending requests and their response targets for that session.
- Resolve responses against both `sessionId` and `actionId` so concurrent multi-agent waits do not cross-deliver.
- Track timeout metadata for each pending request so old requests can expire out of the actionable UI.
- Keep a short-lived consumed/closed ledger keyed by `(sessionId, actionId)` so late duplicate responses are rejected deterministically.
- When a response is submitted, return both:
  - the serialized `action_response` line
  - the effective transport target for this action, if present

### Shared Types and Renderer

`src/shared/sessionTypes.ts`, `src/renderer/*`

- Replace renderer-facing `pendingAction?: PendingAction` with `pendingActions?: PendingAction[]`.
- Keep session status and other fields unchanged.
- Render multiple pending action cards for the same session row.
- Each card responds independently using its own `actionId`.
- Existing single-pending UI behavior becomes the one-item case of the list rendering.
- When a consumed/closed signal arrives, remove the matching card immediately rather than waiting for a later status refresh.
- When a request expires, stop presenting it as actionable and remove it from the default waiting UI.

### Action Response Dispatch

`src/main/actionResponse/dispatchActionResponse.ts`

- Use the per-session response target when available.
- Fall back to the process-level default transport when unavailable.
- Clear pending state only after a successful send.
- Treat a second response for an already consumed or expired request as a duplicate reject/no-op and surface that outcome in logs.

### Transport

`src/main/actionResponse/createActionResponseTransport.ts`

- Keep the current default transport factory.
- Add support for creating a one-off socket transport from a per-request `ResponseTarget`.
- Reuse the same socket send behavior and timeout handling already used by the default socket transport.

## Hook Script Changes

`scripts/hooks/cursor-hook.sh`

- Preserve current JSON normalization.
- Detect whether the payload contains `pendingAction`.
- For non-pending payloads, keep current fire-and-forget behavior.
- For pending payloads:
  - start a short-lived response collector dedicated to this hook invocation
  - inject `responseTarget`
  - forward the payload
  - block waiting for one response line
  - print the line to stdout

`scripts/hooks/codebuddy-hook.sh`

- Keep the current `source=codebuddy` injection.
- Apply the same blocking response flow as the Cursor hook.

To keep shell logic small and testable, the response collector can be implemented in a small Node helper under `scripts/bridge/` rather than embedding socket server logic in bash.

## Error Handling

### Hook Side

- If the hook cannot start a collector, exit non-zero.
- If sending the event to DevPilot fails, exit non-zero.
- If no response arrives before timeout, exit non-zero and log a clear stderr message.
- If the payload has no `pendingAction`, do not block.
- If multiple pending hook invocations share the same `sessionId`, each invocation still waits on its own collector and must only complete on its own matching response.
- If the native side already consumed the request and a duplicate response arrives from DevPilot, the hook/integration should reject or ignore it rather than re-consuming the same request.

### DevPilot Side

- If a pending action has no `responseTarget`, use the existing fallback transport.
- If the dynamic socket send fails, log the error and keep the pending action visible so the failure is observable and retriable after a fresh event.
- Ignore malformed `responseTarget` values in ingress.
- If one response succeeds for a session with multiple pending requests, remove only that action and keep the rest visible and routable.
- If DevPilot does not receive a close signal from the native path, timeout the request so it does not remain indefinitely actionable.
- If a close signal arrives for a request that is already closed, treat it as idempotent and ignore it.
- If a duplicate response is attempted after a request is already closed, reject it as a no-op and log enough context to debug race conditions.

## Testing Plan

### Unit Tests

- `hookIngress` parses valid `responseTarget` and ignores invalid ones.
- `sessionStore` stores, upserts, removes, and clears response targets in sync with per-action pending requests.
- `dispatchActionResponse` prefers the session-level target and only clears pending state after a successful send.
- transport factory can build a one-off socket sender from `ResponseTarget`.
- renderer session mapping renders multiple pending actions for one session.
- `sessionStore` expires old pending requests based on timeout metadata.
- `sessionStore` rejects duplicate responses after a request is already consumed or expired.
- ingress/store can process a consumed/closed signal and remove only the matching `actionId`.
- renderer removes a pending card immediately when it receives a consumed/closed update.

### Integration / E2E

- Keep the existing `tests/e2e/devpilot-action-response.e2e.ts`.
- Add a hook-level E2E that:
  - launches DevPilot
  - invokes the real hook script with a pending-action payload
  - clicks an option in the renderer
  - asserts the hook process prints the expected `action_response` JSON to stdout
- Add a concurrent multi-agent E2E that:
  - launches two hook processes with different `sessionId` and `actionId`
  - keeps both processes blocked at the same time
  - replies in reverse order
  - asserts each process receives only its own `action_response`
- Add a same-session concurrent E2E that:
  - launches two hook processes with the same `sessionId` and different `actionId`
  - verifies both pending cards render under one session
  - replies in either order
  - asserts each waiting hook process receives only its own response
- Add an E2E where the native path consumes a request first and DevPilot receives a consumed/closed signal, then assert the pending card disappears without waiting for another unrelated refresh.
- Add an E2E where no close signal arrives and the pending request expires out of the actionable UI after timeout.
- Add an E2E where a duplicate second response is attempted after first-win and assert it is rejected/no-op.

## Trade-Offs

### Why this approach

- Smallest change that finishes the missing Phase 1 loop.
- Keeps shared types aligned across `src/shared/`, `src/main/`, and hook/bridge code.
- Avoids introducing a heavier registry or callback protocol before we have proven the simpler path.
- Avoids hidden correctness traps where same-session concurrent waits would otherwise silently overwrite one another.
- Addresses the highest-risk product confusion first: "the agent already continued but DevPilot still looks blocked".

### What we are explicitly not solving yet

- Per-action external clear messages beyond the current `pendingAction: null => clear all for session` rule.
- Recovery after hook process death.
- Cross-machine or networked response delivery.
- Richer action payload kinds.
- Strict protocol-level consistency across all native and DevPilot surfaces without any stale window at all.

## Implementation Notes

- Prefer an internal session-store record shape that can hold bridge metadata without leaking it into renderer state.
- Reuse the existing `stringifyActionResponsePayload()` helper so downstream payload format stays stable.
- Keep the bridge metadata optional and isolated so non-blocking events continue to work unchanged.
- Prefer per-action close semantics when available, but keep coarse session-level clear as a compatibility fallback.
- Timeout is a cleanup mechanism, not a correctness proof; explicit consumed/closed signals remain preferable whenever the integration can emit them.

## Open Questions Resolved For This Iteration

- Should DevPilot always use a global action response transport?
  - No. Use a per-request target first, then fall back to the existing global transport.

- Should the renderer know about response routing?
  - No. Routing is a main-process concern.

- Should this iteration add `text_input`?
  - No. That remains Phase 2.

- Does this design support multiple agents waiting at the same time?
  - Yes, provided they map to distinct pending requests with separate `(sessionId, actionId, responseTarget)` tuples.

- Why support multiple pending requests under one `sessionId` at all?
  - Because otherwise a later blocked request from the same session would overwrite an earlier one, creating silent misrouting or lost waits. Even if normal product flows are usually linear, the protocol should remain correct under reentry, retries, duplicate hook delivery, or nested tool-driven prompts.

- Should we switch to ACP first to solve stale pending?
  - No. The first remedy is to add lifecycle cleanup and close semantics on top of the current hook/socket path. Protocol migration can be evaluated later if broader integration benefits justify it.
