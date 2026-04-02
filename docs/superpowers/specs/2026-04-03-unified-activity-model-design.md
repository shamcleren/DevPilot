# Unified Activity Model Design

## Goal

Replace the current `string[] activities` flow with a shared `ActivityItem[]` model that is produced as early as possible by adapters/normalizers and consumed directly by the renderer.

## Scope

This change covers:

- shared activity schema
- Cursor activity normalization
- Codex activity normalization
- session store accumulation and fallback compatibility
- renderer consumption of shared activity items
- handoff documentation updates

This change does not attempt to complete:

- tool card visual redesign
- long-text density polish
- full Cursor payload calibration for every hook variant

## Current Problems

- `src/main/session/sessionStore.ts` still compresses upstream semantics into formatted strings.
- `src/renderer/sessionRows.ts` reconstructs message/tool/note meaning from those strings.
- Cursor and Codex differ in how much meaning is preserved before render.
- Future UI work on tool cards is blocked by unstable data semantics.

## Design

### Shared Model

Add `ActivityItem` to `src/shared/sessionTypes.ts`.

The schema should express event semantics rather than renderer-specific presentation:

- `kind`: `message | tool | note | system`
- `source`: `user | assistant | agent | tool | system`
- `title`: short label
- `body`: primary text
- `timestamp`
- optional `tone`
- optional `toolName`
- optional `toolPhase`
- optional `meta`

`SessionRecord` should expose `activityItems?: ActivityItem[]`.

### Adapter / Normalizer Responsibility

Adapters should emit normalized activity items whenever the payload is understood.

Cursor:

- user prompt style input -> `message/user`
- tool invocation -> `tool/call`
- notifications / waiting prompts -> `note`
- unsupported interactive actions -> `system`
- session lifecycle markers -> `system`

Codex:

- `user_message` -> `message/user`
- `task_started` -> `note/running`
- `task_complete` -> `message/assistant`
- `agent_message final_answer` -> `message/assistant`
- `turn_aborted` / `context_compacted` -> `system`

### Store Responsibility

`src/main/session/sessionStore.ts` should:

- accumulate `ActivityItem[]`
- preserve pending lifecycle behavior
- continue deduping and truncating recent activity
- generate compatibility fallback activity items only when upstream did not provide them

This keeps semantic recovery out of the renderer while avoiding breakage for not-yet-migrated producers.

### Renderer Responsibility

Renderer should consume the shared activity schema and only decide presentation.

- `sessionRows.ts` becomes a thin row mapper
- `HoverDetails.tsx` renders from `kind/source/tone/toolPhase`
- `SessionRow.tsx` derives summaries from shared activity items

The renderer should no longer infer message/tool/system meaning from free-form strings.

## Testing

Add or update tests for:

- shared session/store activity retention
- Cursor normalized activity output
- Codex normalized activity output
- renderer row mapping and summary selection from `activityItems`

## Handoff Impact

Update `docs/context/current-status.md` to record:

- unified activity schema is in place
- renderer now consumes normalized activity items
- Cursor payload coverage still needs expansion
- tool-card visual upgrade and long-text density optimization remain next priorities
