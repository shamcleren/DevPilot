# Message-First Expanded Layout Design

## Goal

Keep CodePal as a monitoring panel in collapsed mode, but redesign expanded session detail so it reveals the actual work progression in a message-first way closer to how Codex communicates progress.

This design exists because the current expanded panel still feels like an event inspector rather than a useful “what is this agent actually doing?” surface.

## Problem Statement

The current expanded session view has four structural problems:

- it still leads with status/event framing instead of the content itself
- it does not clearly expose what the agent just said or decided
- tool usage and file edits are not promoted into meaningful work artifacts
- system events such as `Running` / `Completed` visually compete with actual work content

As a result, CodePal feels unlike Codex even when monitoring Codex sessions, and users still cannot quickly answer:

- what did the agent just do?
- what did it just say?
- what files or tools were involved?
- what stage is the task at right now?

## Direction

Do **not** turn CodePal into a clone of Codex.

Instead:

- keep CodePal’s monitoring-card shell
- keep compact collapsed cards
- keep strong cross-session scanning
- but make the expanded panel content model message-first rather than event-first

The visual identity remains CodePal.
The content organization becomes more like a structured agent work log.

## Core Decisions

### 1. Expanded Panels Must Be Content-First

The expanded body should not start from “event type”.
It should start from “meaningful work artifacts”.

Expanded layout should be ordered as:

1. thin session header
2. current progress summary
3. message-first work stream
4. interaction area

### 2. The Main Stream Uses Three Content Classes

The expanded work stream should render items as one of:

- `message`
- `work artifact`
- `system note`

These are not equal in weight.

### 3. Agent Messages Are Primary

Agent-authored messages should become the dominant reading unit.

They should look like:

- compact conversation blocks
- readable multiline text
- visually closer to a chat/message surface than a logging event

They should answer:

- what conclusion was reached?
- what question was asked?
- what is the next step?

### 4. Tool / File / Command Activity Becomes Work Artifacts

Tool calls should not be rendered as bare status lines.

Instead, they should appear as compact work artifacts such as:

- command block
- tool invocation tile
- file edit summary row
- test/build result row

Examples of artifact labels:

- `Command`
- `File Edit`
- `Tool Call`
- `Verification`

These should be denser than messages, but richer than plain event labels.

### 5. System Events Must Recede

`Running`, `Completed`, `Waiting`, and similar system states should not occupy the same visual role as messages or work artifacts.

They should be shown as:

- thin annotations
- dividers
- side notes
- tiny timeline markers

Never as the main readable content unless there is truly no better content available.

## Expanded Layout Structure

### A. Thin Session Header

The header remains small and operational.

Fields:

- tool identity
- title
- state pill
- last updated
- duration
- session id

This is metadata only, not the content surface.

### B. Current Progress Summary

Below the header, show a single short progress statement:

- recent meaningful agent message, or
- recent meaningful work artifact, or
- fallback summary if no better content exists

This should read like:

- “已完成补丁调整，下一步等你确认是否合并”
- “刚跑完测试，出现 1 个失败用例”
- “刚修改 3 个文件并更新样式”

This is the answer to: “现在进行到什么地步了？”

### C. Message-First Work Stream

This is the main body.

Ordering remains recent-first or chronologically sensible, but visually:

- messages first in hierarchy
- artifacts second
- system notes third

#### Message

Use for:

- agent explanations
- decisions
- conclusions
- questions

Visual treatment:

- soft container
- readable body text
- small source label
- moderate spacing

#### Work Artifact

Use for:

- command execution
- file changes
- tool calls
- test/build actions

Visual treatment:

- compact structured block
- small title + concise body
- optional monospace snippets
- optional result badge

#### System Note

Use for:

- running/completed/waiting transitions
- timestamps
- lifecycle annotations

Visual treatment:

- smallest type
- muted color
- separator-like

## Content Rules

### 1. Do Not Repeat the Same Text Across Layers

If a message is already shown as the first main content block:

- do not repeat the same sentence in the overview summary
- do not repeat it as a system note

Each piece of content should have one primary place.

### 2. Prefer Meaningful Progress Over Raw Status

When choosing what to surface:

- prefer message meaning
- then work artifact meaning
- only then raw status

### 3. Show What Was Actually Worked On

When available, expanded content should reveal:

- file names touched
- commands run
- tool names used
- verification steps attempted

This is more useful than repeated status text.

## Relationship to Collapsed Cards

Collapsed cards remain monitor-oriented.

They should still provide:

- title
- tool
- state
- short progress summary

But they do not need to mimic the expanded message layout.

The message-first shift applies mainly to expanded detail.

## Future Reply Compatibility

This design still reserves a bottom interaction zone for future text input.

The order should remain:

1. metadata header
2. progress summary
3. message/work stream
4. interaction zone

That keeps future reply input naturally attached to the bottom of the work stream.

## Acceptance Criteria

This redesign is complete when:

1. Expanded session detail no longer reads like an event inspector.
2. The first thing users notice in expanded view is what the agent said or did, not a raw event label.
3. Tool/file/command activity is rendered as structured work artifacts.
4. `Running` / `Completed` / `Waiting` are demoted to supporting notes.
5. Expanded content answers “what stage is this task at right now?” more clearly than the current layout.
