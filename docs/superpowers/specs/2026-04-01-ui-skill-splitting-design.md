# UI Skill Splitting Design

## Context

The current personal skill:

- `~/.cursor/skills/codepal-ui-settings-verification/SKILL.md`

works well for CodePal, but its content is heavily project-specific. It references CodePal files, CodePal terminology, and CodePal-specific verification rules even though it lives in the personal skill directory.

This creates two problems:

- the skill is not reusable across other projects
- the repository does not yet have a project-local `.cursor/skills/` home for CodePal-specific behavior

The goal of this design is to split the current skill into:

1. a reusable personal UI verification skill
2. a CodePal-specific project skill shared through the repository

without spending unnecessary time on over-engineering the split.

## Goals

- Extract the reusable UI change verification workflow into a personal skill.
- Move CodePal-specific UI and settings rules into a project-local skill.
- Keep the final structure simple and easy to reason about.
- Avoid long-term duplication between personal and project-local CodePal skills.
- Minimize disruption so work can quickly return to core CodePal product development.

## Non-Goals

- Building a public multi-project skill distribution system in this iteration.
- Creating a large library of UI skills for every project type.
- Preserving the current personal `codepal-ui-settings-verification` forever.
- Designing a complicated dependency chain where one skill only works if another also triggers.

## Recommended Structure

Final target state:

- Personal reusable skill:
  - `~/.cursor/skills/ui-change-verification/`
- Project-local CodePal skill:
  - `.cursor/skills/codepal-ui-settings-verification/`

The current personal `codepal-ui-settings-verification` should be treated as a temporary migration source, not as a permanent final artifact.

## Skill Responsibilities

### 1. Personal Skill: `ui-change-verification`

This skill should contain only reusable UI workflow rules that make sense across projects.

Include:

- read the project's relevant context before editing UI
- finish context reading before task-directed repository search or implementation-file inspection
- classify the change boundary:
  - presentation only
  - presentation + styles
  - presentation + data/state semantics
  - presentation + routing/window/main/shared wiring
- do not treat copy-only or CSS-only work as verification-free
- require the smallest meaningful verification before claiming completion:
  - related tests
  - lint when appropriate
  - minimal UI inspection when the change affects visible behavior
- generic red flags around:
  - "it's only copy"
  - "it's only styles"
  - "I haven't verified yet but it should be fine"

Do not include:

- CodePal-specific filenames
- CodePal-specific UI concepts like integration health or settings diagnostics
- CodePal-only context files
- a CodePal-only verification matrix

### 2. Project Skill: `codepal-ui-settings-verification`

This skill should become a focused CodePal specialization for settings, integration health, and related renderer/main/shared boundaries.

Include:

- required CodePal context reads:
  - `AGENTS.md`
  - `README.md`
  - `docs/context/current-status.md`
- CodePal-specific file and boundary guidance:
  - `src/renderer/App.tsx`
  - `src/renderer/components/IntegrationPanel.tsx`
  - `src/renderer/styles.css`
  - `src/main/window/createSettingsWindow.ts`
  - `src/shared/`
  - preload and main-process wiring when relevant
- CodePal-specific UI principles:
  - Phase 1 is unified monitoring first
  - settings is a low-frequency diagnostics/repair surface
  - health labels and actions should guide the next step clearly
- CodePal-specific verification matrix for:
  - `App`
  - `IntegrationPanel`
  - settings view / settings wiring
  - cross `renderer + shared/main` changes
- CodePal-specific red flags such as:
  - changed health/badge wording without checking diagnostics semantics
  - changed settings UI without checking dedicated settings behavior
  - changed project UI wording without checking nearby renderer tests

## Relationship Between the Two Skills

The personal skill should provide the general method.

The project skill should provide the CodePal-specific landing points.

Important design rule:

- the project skill must still be usable on its own
- it should not depend on the personal skill always triggering first

This means the project skill may repeat a small amount of workflow guidance, but it should stay shorter and more concrete than the personal skill.

## Naming Decision

Recommended names:

- personal: `ui-change-verification`
- project: `codepal-ui-settings-verification`

Rationale:

- the personal name stays generic and reusable
- the project name stays familiar and clearly tied to CodePal
- future projects can follow the same pattern without colliding with the generic skill

## Migration Plan

Recommended order:

1. Extract the reusable rules from the current personal CodePal skill.
2. Create `~/.cursor/skills/ui-change-verification/`.
3. Create `.cursor/skills/codepal-ui-settings-verification/`.
4. Verify both skills with a small set of pressure prompts.
5. Remove the old personal `~/.cursor/skills/codepal-ui-settings-verification/` once the two new skills are validated.

## Why the Old Personal CodePal Skill Should Not Stay

Long-term duplication between:

- `~/.cursor/skills/codepal-ui-settings-verification/`
- `.cursor/skills/codepal-ui-settings-verification/`

would create avoidable confusion:

- unclear trigger source
- drift between two nearly identical skills
- uncertainty about which skill is being tested or applied

The old personal CodePal skill may exist temporarily during migration, but it should not remain part of the final steady-state design.

## Verification Strategy

The split is successful if:

- the personal skill triggers for generic UI change tasks in other projects
- the personal skill does not mention CodePal-specific files or concepts
- the project skill triggers for CodePal settings / integration-health UI tasks
- the project skill does not need the personal skill to be useful
- the old personal CodePal skill can be retired without losing capability

## Recommended Next Step

Implement the split quickly as a focused migration:

1. create the new personal generic skill
2. add the new project-local CodePal skill
3. pressure-test both
4. remove the temporary old personal CodePal skill

This keeps the skill system clean while returning attention to CodePal product work as soon as possible.
