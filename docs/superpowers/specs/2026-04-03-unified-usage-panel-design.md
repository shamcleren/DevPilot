# Unified Usage Panel Design

## Goal

Add a unified multi-agent usage surface to CodePal with:

- a global usage summary as the primary entry
- expandable per-session usage details
- first-pass support for `tokens`, `context`, `cost`, and `rate limit`

Phase 1 should establish a stable shared model and UI shell without overcommitting to perfect parity across every upstream agent.

## Scope

In scope:

- shared usage types for normalized multi-agent usage snapshots
- main-process usage aggregation independent from the session activity timeline
- renderer UI for global summary plus per-session detail drill-down
- first-pass local data ingestion from session-derived and local bridge-derived sources
- explicit handling of incomplete / unavailable fields
- fixture and store tests for aggregation behavior

Out of scope:

- a requirement that every agent exposes every usage field on day one
- coupling usage to approval handling
- mandatory provider API integration for the first release
- billing-grade cost accuracy
- historical reporting beyond the current active / recent session window

## Product Decision

The first release should use a **global-summary-first** model:

- the top-level panel shows aggregate usage across visible agents and sessions
- users can expand into session-level usage rows for detail
- missing upstream fields remain explicitly unavailable instead of being guessed

This keeps the UI coherent while still allowing uneven upstream capability.

## Approaches Considered

### Recommended: Separate usage store with normalized snapshots

- each adapter or local bridge emits a normalized `UsageSnapshot`
- main process keeps a dedicated usage store
- renderer consumes a single `UsageOverview`

Pros:

- clean separation from session timeline semantics
- easy to add new agents or new usage sources later
- avoids overloading `SessionEvent` with accounting concerns

Cons:

- requires a parallel state path in main process

### Rejected: Derive usage purely from session events

- encode usage as another session event type
- reconstruct global summary from session store

Why not now:

- couples accounting data to timeline behavior
- makes aggregate logic dependent on session lifecycle quirks
- encourages renderer fallback logic when fields are partial

### Rejected: Provider API first

- fetch usage from remote APIs first, use local data only as fallback

Why not now:

- permissions and auth handling are agent-specific
- some sources are unstable or unavailable
- slower path to a working unified panel

## Data Model

Add shared usage types alongside the session model.

### Usage snapshot

Each raw observation should normalize into a `UsageSnapshot` with:

- `agent`: `codex`, `cursor`, or future agent key
- `sessionId`: optional for global-only sources, required when tied to a session
- `source`: one of:
  - `session-derived`
  - `statusline-derived`
  - `provider-derived`
- `updatedAt`
- `tokens`
  - `input`
  - `output`
  - `total`
- `context`
  - `used`
  - `max`
  - `percent`
- `cost`
  - `reported`
  - `estimated`
  - `currency`
- `rateLimit`
  - `remaining`
  - `limit`
  - `resetAt`
  - `windowLabel`
- `meta`
  - source-specific passthrough for debugging only, not renderer-owned

All usage subfields are optional. Normalization should preserve known values and omit unknown ones.

### Session usage

`SessionUsage` should represent the current best-known usage state for a session:

- `agent`
- `sessionId`
- `title`
- `updatedAt`
- merged latest-known `tokens`, `context`, `cost`, `rateLimit`
- `sources`: list of contributing source kinds for transparency
- `completeness`: coarse label such as `full`, `partial`, `minimal`

### Usage overview

`UsageOverview` is the renderer-facing root model:

- `updatedAt`
- `summary`
  - aggregate tokens
  - aggregate reported / estimated cost
  - aggregate or best-available context summary
  - rate-limit summary grouped by agent
- `sessions`: recent per-session usage rows
- `agents`: optional per-agent breakdown for future extension

## Data Sources

Usage should support three source tiers from the start, even if only the first two are populated initially.

### Session-derived

Data parsed from session logs or hook payloads.

Examples:

- token counts embedded in assistant or tool result metadata
- context window usage embedded in session payloads
- explicit usage records present in upstream session logs

### Statusline-derived

Data written by local bridge integrations outside the main session log.

Examples:

- local `rate_limits` snapshots emitted by a status line script
- agent-specific local usage sidecar files

This is the safest first-pass path for usage fields that are available locally but not embedded in the session log stream.

### Provider-derived

Future remote usage sources.

Examples:

- provider account usage APIs
- quota endpoints tied to authenticated desktop sessions

This source type is reserved in the model now but does not need to be implemented in the first pass.

## Aggregation Rules

The main process should own aggregation.

### Per-session merge

For each `agent + sessionId`:

- keep the latest snapshot timestamp per source
- merge fields by latest-known non-null value
- never overwrite a known field with `undefined`
- preserve both `reported` and `estimated` cost when both exist

### Global summary

Global summary should:

- sum tokens only when values are numeric
- sum `reported` and `estimated` cost separately
- prefer agent-grouped rate-limit summaries over a fake cross-agent single number
- show context as best-effort:
  - if a single active session is selected, use that session context directly
  - otherwise summarize as multi-session usage instead of pretending percentages are additive

### Staleness

Usage entries should be considered stale when they have not refreshed within a bounded window.

First pass:

- stale entries remain visible in session detail
- stale summary contributions should be visually marked, not silently dropped

## UI Design

The usage surface should be global-summary-first.

### Primary surface

Add a compact global usage panel near the top-level monitoring surface with:

- total tokens
- total cost
- top-level rate-limit status
- a best-available context summary
- last updated time

This should read as an operations overview, not as a billing dashboard.

### Expanded detail

Expanding the panel should show per-session usage rows:

- agent glyph and session title
- tokens
- cost
- context
- rate limit
- source / freshness hint

Rows should tolerate partial data cleanly. Unknown values should render as `Unavailable`.

### Field presentation

- `tokens`: show `input / output / total` when available; otherwise show the available subset
- `context`: prefer percentage if `used` and `max` are both present
- `cost`: show `reported` first, `estimated` second
- `rate limit`: show remaining and reset time when present

## Implementation Design

### Shared layer

Add usage types under `src/shared/` so both main and renderer consume the same contracts.

### Main process

Add a dedicated `usageStore` in `src/main/` responsible for:

- ingesting normalized `UsageSnapshot` records
- maintaining merged `SessionUsage`
- producing a renderer-facing `UsageOverview`

This store should not depend on renderer formatting.

### Adapter / integration layer

Extend agent-specific code only enough to emit normalized usage snapshots:

- Codex:
  - parse usage fields from session logs when available
  - add a local statusline / sidecar bridge path for `rate_limits`-style snapshots if present
- Cursor:
  - ingest any existing hook payload usage when available
  - otherwise remain partial in the first pass

Agent adapters should not implement aggregate math.

### Renderer

Add a dedicated usage component rather than mixing usage into each session row.

Session rows can later link into usage detail, but the first release should keep usage centered in the global panel.

## Error Handling

- Unknown or malformed usage payloads should be ignored with diagnostics, not crash the store.
- Renderer must treat every usage field as optional.
- If no usage data exists yet, render an explicit empty state instead of zero values.
- Cost values from different currencies should not be summed together. First pass should only aggregate matching currencies; mixed currencies should degrade to per-agent/session display.

## Testing

Add tests for:

- shared usage-type guards if runtime validation is introduced
- store merge behavior for partial snapshots
- separate summation of `reported` vs `estimated` cost
- stale snapshot marking
- per-session detail rows with partial fields
- empty-state rendering when no usage exists
- first-pass Codex / Cursor fixture normalization where usage fields are present

## Risks

- Upstream parity will be uneven. Mitigation: model optional fields explicitly and surface completeness.
- Cost may be misread as authoritative. Mitigation: distinguish `reported` vs `estimated` in the model and UI.
- Context percentages are not globally additive. Mitigation: do not sum them into a fake single percentage across sessions.
- Provider APIs may change or require extra auth. Mitigation: keep `provider-derived` optional and outside the critical path.

## Acceptance Criteria

- CodePal shows a global usage summary panel across supported agents.
- Expanding the panel reveals per-session usage detail rows.
- The first release can represent `tokens`, `context`, `cost`, and `rate limit`, even when some fields are unavailable.
- Missing fields display as unavailable rather than zero.
- Usage aggregation is owned by a dedicated main-process store, not renderer heuristics.
- The design remains compatible with future provider-derived usage sources.
