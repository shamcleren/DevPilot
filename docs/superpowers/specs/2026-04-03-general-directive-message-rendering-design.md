# General Directive Message Rendering Design

## Goal

Extend assistant-message directive rendering so CodePal no longer exposes raw `::directive{...}` protocol text in the expanded session timeline. Known directives should use specific human-readable labels, while unknown directives should fall back to a generic chip label.

## Scope

In scope:

- renderer-only parsing of assistant message directives
- specific labels for currently known CodePal / Codex directives
- generic fallback chips for unknown directives
- preserving directive order within a message
- hiding raw directive protocol text from assistant prose
- renderer regression tests for known and fallback behavior

Out of scope:

- executing directives
- changing shared event/session types
- ingress / adapter normalization changes
- exposing raw directive payload details such as `cwd`
- heavyweight card UIs for directives

## Product Decision

Directive rendering should follow a hybrid model:

- known directives use explicit, user-friendly labels
- unknown directives render as generic fallback chips
- assistant prose should not show raw protocol text for either case

This keeps the expanded timeline readable without requiring every future directive to be explicitly implemented before it can render cleanly.

## Rendering Model

For each assistant message body:

1. Parse all directive substrings matching `::name{...}`.
2. Convert each directive to a chip model.
3. Remove parsed directive substrings from the assistant markdown body.
4. Render remaining prose as markdown.
5. Render chips below the prose in source order.

If the message becomes empty after directive removal, render only the chip row.

## Directive Labeling

### Known directives

- `git-stage` -> `已暂存`
- `git-commit` -> `已提交`
- `git-push` -> `已推送 <branch>` or `已推送`
- `git-create-branch` -> `已创建分支 <branch>` or `已创建分支`
- `git-create-pr` -> `已创建 PR`
- `code-comment` -> `已添加评论`
- `automation-update`
  - `mode="suggested create"` -> `建议自动化`
  - `mode="suggested update"` -> `建议更新自动化`
  - `mode="view"` -> `查看自动化`
  - unknown / missing mode -> `自动化已更新`
- `archive` -> `已归档`

### Generic fallback

Unknown directives use the directive name as a normalized label:

- strip the leading `::`
- replace hyphens / underscores with spaces
- lower visual weight than prose

Examples:

- `::foo-bar{...}` -> `foo bar`
- `::sync_status{...}` -> `sync status`

Payload details remain hidden in fallback mode.

## Visual Treatment

All directives continue using the existing lightweight chip row treatment:

- compact pill shape
- subtle border and muted accent tint
- wraps cleanly for multiple directives
- grouped beneath assistant prose

Known and fallback chips share the same visual baseline so the stream remains calm and consistent.

## Implementation Design

Update the renderer helper in `HoverDetails.tsx` from a narrow git-only parser to a generic directive parser:

- parse every directive token in the assistant body
- map directive names plus selected attributes into chip labels
- use a known-directive mapper first
- fall back to normalized directive names when no explicit mapping exists

Only a small set of attributes should be read:

- `branch` for git push / branch creation
- `mode` for automation update

Any malformed directive should remain in prose rather than being half-parsed.

## Testing

Add or update renderer tests for:

- existing git directive behavior still working
- known non-git directives such as `git-create-pr`, `code-comment`, `archive`
- automation-update mode-based labels
- unknown directive fallback chip rendering
- prose + directive combinations
- directive-only messages

## Risks

- Overmatching malformed protocol strings. Mitigation: keep the parser strict and only remove substrings that parse as complete directive tokens.
- Generic fallback labels could become noisy if too many directives appear together. Mitigation: keep chips low priority and avoid rendering payload details.

## Acceptance Criteria

- Raw directive protocol text no longer appears in assistant prose for parsed directives.
- Known directives render with specific, human-readable chip labels.
- Unknown directives render with generic fallback chip labels.
- Markdown prose, code blocks, and links still render correctly.
- Directive-only messages render cleanly without empty prose blocks.
