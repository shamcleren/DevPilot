# Git Directive Message Rendering Design

## Goal

Fix the expanded session message styling where Codex git directives such as `::git-stage{...}` are currently rendered as raw assistant body text. Keep those directives visible, but demote them into lightweight status chips so the message remains readable.

## Scope

In scope:

- renderer-only handling for assistant message bodies in the expanded session timeline
- extraction of known git directives from assistant markdown text
- rendering extracted directives as lightweight status chips under the assistant message body
- regression tests for parsing and rendering behavior

Out of scope:

- changes to shared session data structures
- ingress / adapter normalization changes
- support for every Codex directive
- exposing internal `cwd` details in the UI

## Product Decision

Known git directives should remain visible, but no longer appear as raw protocol text inside the assistant prose block.

Supported directives in this change:

- `::git-stage{...}` -> `已暂存`
- `::git-commit{...}` -> `已提交`
- `::git-push{branch="..."}` -> `已推送 <branch>`
- `::git-push{...}` without branch -> `已推送`

Unknown directives remain unchanged and continue rendering as plain assistant text until there is a deliberate design for them.

## Rendering Design

For each assistant message body:

1. Parse the raw text for known git directives.
2. Remove recognized directive substrings from the markdown body before markdown rendering.
3. Preserve the remaining natural-language markdown content as the main message body.
4. Render extracted directives as a compact chip row beneath the body.
5. Preserve source order when multiple directives are present in one message.

The chip row should be visually low-priority:

- smaller than the main message text
- subtle border and background
- wraps cleanly when multiple chips exist
- clearly separated from the prose block

This keeps the assistant message readable while still exposing that git-side effects happened.

## Implementation Plan

### Parsing

Add a small parser in the renderer component layer that:

- scans a string for directive patterns of the form `::name{...}`
- recognizes only `git-stage`, `git-commit`, and `git-push`
- extracts the `branch` attribute for `git-push` when present
- returns:
  - cleaned markdown body
  - ordered list of extracted directive chips

The parser should be intentionally narrow and forgiving. If a directive is malformed or unsupported, leave it in the markdown text instead of guessing.

### Component Changes

Update the assistant message rendering path in `HoverDetails.tsx`:

- keep existing markdown rendering for cleaned assistant text
- append a compact directive chip row when extracted directives exist
- do not change tool artifact rendering or note rendering

No shared type changes are required because this is a presentational transform on already-normalized message text.

### Styling

Add a dedicated chip container and chip styles in `styles.css`:

- horizontal flex row with wrap
- compact pill shape
- muted accent colors aligned with assistant-message styling
- no heavy shadows or large card treatment

The chips should feel closer to metadata than content.

## Error Handling

- If parsing fails, fall back to rendering the original markdown text unchanged.
- If no recognized directives are found, keep current behavior.
- If a message contains only directives, render the chip row without forcing an empty prose paragraph.

## Testing

Add renderer tests to cover:

- assistant message with prose plus multiple git directives
- assistant message containing `git-push` with branch
- assistant message containing only known directives
- assistant message containing an unknown directive that should remain plain text
- assistant message markdown still rendering inline code / links after directive removal

## Risks

- Over-eager matching could strip legitimate prose. Mitigation: support only exact known directive names and leave malformed cases untouched.
- Rendering gaps for directive-only messages could create empty spacing. Mitigation: only render the prose block when cleaned text remains non-empty after trimming.

## Acceptance Criteria

- Raw `::git-stage`, `::git-commit`, and `::git-push` text no longer appears as large assistant prose blocks in the expanded timeline.
- Assistant prose remains readable and retains markdown formatting.
- Recognized git directives render as lightweight chips in original order.
- Unknown directives are not hidden or rewritten.
- Existing tool artifact and note rendering behavior remains unchanged.
