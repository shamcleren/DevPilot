# ACP + Hook Complement Design

## Context

CodePal Phase 1 already has a meaningful local integration surface:

- Codex session-log monitoring via `~/.codex/sessions/**/*.jsonl`
- Cursor / CodeBuddy hook ingress
- in-app pending action loop
- external `action_response` write-back through per-request `responseTarget`
- an in-progress hook-based prompt path on a separate development line

At the same time, external ACP tooling such as `acpx` and OpenClaw already demonstrate that some code agents can be controlled through a headless control runtime rather than only through IDE-native hooks.

The important product conclusion is:

- ACPX should not replace the current hook path.
- ACPX and hooks should be treated as complementary channels.
- CodePal should prefer the stronger channel for each capability instead of forcing one transport to do everything.

## Decision Summary

### What ACPX Is For

Treat ACPX as a control-plane integration for agent sessions:

- spawn session
- inspect session status
- steer a running session
- cancel a running turn
- close a session
- later: session-scoped runtime options such as `cwd`, `model`, `permissions`, `timeout`

### What ACPX Is Not For

Do not use ACPX as a direct replacement for:

- Cursor / CodeBuddy hook ingress
- hook-based pending action write-back
- the current hook prompt channel already being developed
- Codex log-based passive monitoring

### Relationship Between ACPX and Hook

The system should model ACPX and hook as complementary linked channels for the same real-world agent work:

- hook/log channels remain strong candidates for passive monitoring and native event visibility
- ACP channels remain strong candidates for explicit session lifecycle control
- prompt injection may continue to use hook transport if that path is already ahead
- whichever channel has the better capability should be preferred for that capability

Example:

- if hook/log gives better streaming visibility, use it for read/monitor
- if ACP gives better session lifecycle control, use it for spawn/cancel/steer/close

## Recommended Architecture

### Linked Entity Model

Do not force hook sessions and ACP sessions into one raw session object too early.

Instead, introduce a higher-level linked entity that can relate multiple transport-specific sessions.

Recommended conceptual model:

```ts
type LinkedAgentRuntime = {
  id: string;
  agentFamily: "codex" | "cursor" | "codebuddy" | string;
  sessions: LinkedSession[];
  preferredCapabilities: CapabilitySelection;
};

type LinkedSession = {
  id: string;
  kind: "hook" | "log" | "acp";
  agentFamily: string;
  externalId: string;
  state: "idle" | "running" | "waiting" | "completed" | "failed" | "closed";
  capabilities: RuntimeCapabilities;
  quality: CapabilityQuality;
  metadata?: Record<string, unknown>;
};
```

This keeps source-specific transport details below the linking layer.

### Capability Routing

Introduce a capability router above individual adapters.

The routing rule is:

- choose by capability
- then choose by current availability
- then choose by quality / preference
- do not choose purely by session origin

Representative capability set:

- `monitorTimeline`
- `streamRead`
- `sendPrompt`
- `respondAction`
- `spawnSession`
- `sessionStatus`
- `steerSession`
- `cancelTurn`
- `closeSession`
- `setRuntimeOption`

The router should be explicit about missing support.

If a linked runtime has no provider for a capability, the UI should surface that clearly instead of pretending the linked entity is fully interactive.

### Correlation Instead of Forced Identity

First iteration should treat hook/log sessions and ACP sessions as related entities, not as the same canonical transport instance.

Correlation may use:

- same `agentFamily`
- same repository / cwd
- close timestamps
- matching branch / workspace hints
- optional explicit cross-channel metadata later

This is intentionally heuristic at first. The system should tolerate imperfect correlation better than incorrect forced identity.

## Product Boundary

### Near-Term Priority

Complete the hook-based product loop before starting ACP-layer refactoring.

That means finishing and stabilizing:

- hook monitoring semantics
- hook pending-action lifecycle semantics
- hook prompt ownership and response semantics
- session identity rules needed by the current product flow

### Why Not Start ACP Refactor Immediately

If ACP abstraction starts before the hook path is stable, CodePal will likely freeze temporary hook semantics into the public shared model.

That would create two predictable failures:

- over-abstraction around unstable product behavior
- concurrent workstreams fighting over session, prompt, and action semantics

The ACP common layer should be extracted from a validated hook loop, not invented ahead of it.

## First ACP Iteration Scope

When ACP work begins, the first iteration should stay narrow.

In scope:

- create an ACP control domain in main/shared layers
- define linked runtime and capability-routing model
- add ACP adapter boundary for multiple future code agents
- implement control operations only:
  - `spawn`
  - `status`
  - `steer`
  - `cancel`
  - `close`
- surface ACP-linked status in UI as a complementary source

Out of scope for the first ACP iteration:

- replacing hook ingress
- replacing hook prompt transport
- forcing every agent into one identical session interface
- solving all prompt/session unification at once
- building a fully user-configurable routing policy engine

## Preferred Rollout Order

1. Finish the hook-based loop end to end.
2. Confirm stable ownership for prompt injection.
3. Confirm stable session identity and pending-action semantics.
4. Introduce linked runtime model and capability router.
5. Add ACP control adapter for one agent family first.
6. Expand to more agents only after the first linked-control path proves useful.

## Suggested Agent Rollout

Start ACP work with one agent family first.

Recommended initial candidate:

- `codex`

Reasoning:

- Codex aligns better with CodePal's current Phase 1 focus.
- Public ACP evidence around Cursor persistent-session behavior is less reassuring than one-shot behavior.
- A Codex-first ACP control path lets the product validate the new abstraction without simultaneously solving Cursor-specific ACP edge cases.

Cursor ACP can still be a target for the shared adapter model later, but it should not define the first version of the common layer.

## Readiness Checklist Before ACP Refactor

Use this as the gate before opening the ACP architecture branch.

- hook-based prompt path has a single clear owner
- no double-write path exists for the same prompt or session
- pending-action open / consumed / cancelled / expired semantics are stable
- session identity is good enough to relate repeated work for the same real agent task
- UI semantics already distinguish monitoring vs interaction vs control
- current hook flow is valuable enough that its abstractions are worth preserving

If two or more of these are still moving targets, ACP refactor should wait.

## Open Questions For The Future ACP Spec

These questions should be answered in the implementation design later, not now:

- what exact shared type should represent linked runtimes in `src/shared/`
- how should capability quality be scored or prioritized
- where correlation should live: store layer, adapter layer, or dedicated linking service
- whether ACP session status should appear inline in current session rows or in a linked detail surface
- whether hook prompt eventually becomes one `sendPrompt` provider among several or stays product-specific longer

## Working Rule

Until ACP work starts, the project should operate under this rule:

`hook closes the current product loop; ACP arrives later as a complementary control plane.`
