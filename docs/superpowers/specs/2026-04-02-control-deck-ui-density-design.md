# Control Deck UI Density Design

## Goal

Evolve the monitoring panel from a basic session list into a denser “control deck” surface that works well in a very small floating window while still supporting full-context inspection when a session is expanded.

This design intentionally keeps implementation scope focused on layout, hierarchy, and presentation. It does **not** introduce free-form text reply in this round, but it reserves a stable interaction slot for that future Phase 2 capability.

## Scope

### In Scope

- refine the visual language toward a calm, professional control-deck aesthetic
- increase information density in the collapsed session state without turning rows into text dumps
- redesign expanded session detail into a structured full-context panel
- distinguish dialog, tool calls, and status events visually instead of rendering them as uniform text lines
- add a deterministic summary rule for long agent replies using the final meaningful sentence
- preserve room in the expanded layout for future text-input reply UI

### Out of Scope

- implementing free-form text reply
- changing pending-action protocol types
- broad adapter/protocol redesign
- introducing large media, avatars, or decorative chrome that reduces usable density

## Product Direction

The panel should feel like a compact desktop monitoring console rather than a chat app or a generic settings window.

Design stance:

- base tone: calm and professional
- secondary layer: clear tool identity and stronger source differentiation
- interaction style: compressed by default, rich on demand

This is a deliberate rejection of:

- chat-first layouts
- playful assistant styling
- indiscriminate timeline dumps

## Core Decisions

### 1. Use a Two-Line High-Density Collapsed Card

Each session row should collapse into a dense two-line card that surfaces more signal than the current layout while staying scannable.

Collapsed card structure:

- line 1:
  - tool marker
  - session title
  - compact status pill
  - recent activity time
- line 2:
  - current summary
  - pending count, if any
  - short session id
  - duration or runtime

The row must never become a raw paragraph. All text should remain clipped to a predictable visual rhythm.

### 2. Expanded State Becomes a Full Context Panel

Expansion should reveal a contained full-context region inside the owning session card.

Expanded region structure:

1. session overview strip
2. layered timeline
3. action / interaction slot

The full-context panel should show substantially more detail than the collapsed state, including conversation progress and tool usage, but it still must remain visually structured and bounded.

### 3. Layer the Timeline by Event Type

Not all timeline entries deserve the same visual treatment.

The expanded session timeline should classify entries into:

- dialog messages
- tool calls
- system/status events

Presentation rules:

- dialog messages:
  - largest text
  - widest cards
  - best readability
- tool calls:
  - tighter rows
  - explicit tool name badge
  - status/result treatment
- system/status events:
  - smallest visual weight
  - annotation-like appearance

This keeps the timeline readable even when the session becomes busy.

### 4. Collapsed Summary Uses the Last Meaningful Sentence

When the latest significant event is a long agent reply, the collapsed card should not display the whole reply.

Summary extraction rule:

1. if there is an unresolved pending action, show the action title
2. else if the latest event is agent dialog, use the last meaningful sentence
3. else if the latest event is a tool call, show `tool name + result summary`
4. else show the latest status/event summary

“Meaningful sentence” means:

- not empty
- not just acknowledgement filler such as “好的”, “继续”, or “嗯”
- preferably the final conclusion, next step, or question

Fallback behavior:

- if the final sentence is too weak, use the nearest earlier meaningful sentence
- if none is suitable, fall back to the event’s canonical summary string

### 5. Reserve a Future Reply Slot Without Implementing It Yet

The expanded panel must end with a stable bottom interaction zone.

Current round:

- render pending actions there
- leave layout room for future text input

Future round:

- add free-form reply input into the same zone without redesigning the full detail panel

This prevents the current layout from boxing the product into a monitor-only dead end.

## Visual Language

### Overall Aesthetic

The UI should resemble a refined control deck:

- dark, low-glare base
- strong hierarchy
- high information density
- restrained but deliberate motion

Avoid:

- flat generic dark themes
- purple-heavy “AI tool” styling
- excessive card padding
- over-rounding and over-softening

### Typography

Typography should separate content classes clearly:

- titles:
  - compact, confident, slightly technical
- status/time/meta:
  - smaller and more condensed
- dialog messages:
  - easier reading, slightly larger than tools/events
- system annotations:
  - smallest and quietest

The current default system-heavy feel should be replaced with a more intentional pairing while staying practical in Electron.

### Color Roles

Color usage must remain tightly scoped.

Allowed semantic roles:

- state color
- tool/source color
- neutral surface hierarchy

Do not assign random accent colors to ordinary text content.

### State Priority

State emphasis order:

1. `waiting`
2. `running`
3. `error`
4. `completed`
5. `idle`
6. `offline`

Rules:

- `waiting` should be the highest-attention visual state because it requires action
- `running` should feel active without overpowering `waiting`
- `error` should remain visible but not flood the whole card in red
- low-priority states should recede into context

### Tool Identity

Tool identity should remain obvious at both collapsed and expanded levels.

Recommended mapping:

- Codex:
  - cool teal / blue-green
  - deliberate, analytical feel
- Cursor:
  - crisp blue
  - reactive, interactive feel

Unknown tools should fall back to a neutral treatment.

## Layout Rules

### Collapsed Session Card

Collapsed cards should optimize for scan speed.

Required visible fields:

- tool identity
- session title
- state
- one-line summary
- recent update time
- duration
- short session id
- pending count when present

Optional fields should not appear if they compromise density.

### Expanded Overview Strip

The top of the expanded region should summarize the session before the user enters the timeline.

Required fields:

- tool
- title
- state
- last updated
- duration
- session id
- current summary

This strip should help the user re-orient without re-reading the collapsed card.

### Expanded Timeline

Timeline ordering should remain chronological, but type styling must dominate over raw text.

Per-event treatment:

- dialog:
  - role label such as `agent` or `user`
  - larger readable body
  - multiline allowed
- tool call:
  - tool badge
  - result/status chip
  - one-line or two-line compact body
- status event:
  - timestamp
  - compact annotation

The timeline should support scrolling within the expanded panel without pushing the whole list into instability.

### Bottom Interaction Zone

The bottom of the expanded card should always be reserved for direct interaction.

Current content:

- pending approval / choice actions

Future content:

- reply input
- structured suggestions
- quick actions

## Data and Presentation Implications

This design assumes the renderer row model will need richer derived presentation fields, potentially including:

- collapsed summary
- last meaningful sentence
- event type grouping metadata
- pending count

The underlying shared session model should remain simple where possible. Rich extraction logic should prefer renderer-side derivation unless a stronger upstream signal is clearly available.

## Error Handling

- If a long dialog message cannot be split into meaningful sentences, fall back to the event summary rather than rendering the full message in collapsed mode.
- If event typing is incomplete, unknown timeline items should degrade into neutral system events rather than inheriting dialog styling by mistake.
- If no detailed context is available, expanded panels should still show the overview strip and a concise empty-state context message.

## Testing Strategy

### Renderer Tests

- collapsed cards render the denser two-line structure
- collapsed summaries prefer pending titles, then last meaningful dialog sentence
- tool calls and status events generate different compact summaries
- expanded panels render layered sections instead of flat uniform text
- pending action zone stays in the bottom interaction region

### Style / Layout Tests

- collapsed rows remain bounded in a compact layout
- expanded context region keeps its own scroll boundary
- tool identity classes remain distinct for Codex and Cursor
- state emphasis remains visible for `waiting`, `running`, and `error`

### Future-Proofing Check

- expanded layout includes a stable interaction slot that can later accept text input without restructuring the card

## Acceptance Criteria

This refinement is complete when all of the following are true:

1. Collapsed session cards show more useful signal in a stable two-line format.
2. Long agent replies no longer flood the collapsed view; the card uses the last meaningful sentence.
3. Expanded session detail presents a full-context panel rather than a flat text block.
4. Dialog, tool calls, and system/status events are visually distinguishable by hierarchy, size, and color treatment.
5. Codex and Cursor remain clearly distinguishable in both collapsed and expanded views.
6. The expanded card layout reserves a stable bottom interaction zone for future reply input.
