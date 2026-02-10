---
name: ui-component-extraction
description: Build composable React/TSX components and split overloaded TSX files into smaller components. Use when a file mixes orchestration and view markup, has multiple UI sections, repeated JSX, too many responsibilities, or difficult readability/reviewability.
---

# Composable TSX Components

Refactor UI toward small composable components when applicable.

## Goals

- Keep TSX files readable and reviewable.
- Separate orchestration logic from presentational rendering.
- Preserve behavior while improving structure.

## Heuristics For Splitting A TSX File

Split a TSX file into components when one or more are true:

- The file renders multiple distinct sections (header, sidebar, main panel, footer, modal, welcome state).
- The file has repeated JSX patterns that should be parameterized.
- The file combines data fetching/state orchestration and complex markup in the same block.
- The main component becomes hard to scan quickly (many state hooks, handlers, and large return tree).
- A JSX subsection has a clear nameable responsibility.

## Componentization Rules

- Keep parent/container component focused on state, effects, and callbacks.
- Move cohesive view sections to `components/` with explicit props.
- Use narrow, typed props interfaces and existing shared domain types.
- Prefer action-style callback names (`onOpenRepo`, `onSelectRecent`, `onTogglePanel`).
- Keep styling and rendered structure unchanged unless redesign is explicitly requested.

## Extraction Workflow

1. Identify split candidates in the return tree by responsibility.
2. Define typed props for each extracted component.
3. Move JSX with minimal behavior changes.
4. Replace inline section with component usage in parent.
5. Remove unused imports/types from parent.
6. Verify with lint/typecheck.

## Naming and Placement

- Use specific noun names (`WelcomePage`, `BranchPanel`, `RepositoryHeader`).
- Place files near related feature UI under `src/**/components/`.
- Avoid generic names like `Section` or `Part`.

## Guardrails

- Do not over-fragment tiny components without reuse or clarity benefit.
- Do not move cross-cutting business logic into presentational components.
- Do not change interaction behavior unless requested.
