---
name: container-presentational-boundaries
description: Define and enforce container vs presentational component boundaries in React/TSX, including prop contract conventions. Use when components mix data orchestration with rendering, props are unclear, or refactors need stable composable interfaces.
---

# Container vs Presentational Boundaries

Design React components with clear responsibility boundaries and predictable props.

## Responsibility Model

- `Container` components own orchestration:
  - data fetching
  - state management
  - side effects
  - backend/API calls
  - action handlers
- `Presentational` components own rendering:
  - layout/markup
  - style classes
  - user interaction wiring to callbacks
  - lightweight derived display logic only

## Boundary Rules

- Never call APIs directly from presentational components.
- Never store cross-feature business state in presentational components.
- Keep container render trees shallow by composing presentational children.
- Promote reusable UI blocks into presentational components with explicit props.

## Prop Contract Conventions

- Create a named `Props` interface for every exported component.
- Keep prop surfaces minimal and explicit.
- Use domain types from shared modules for value props.
- Use action-oriented callback props:
  - `onOpenRepo`
  - `onSelectBranch`
  - `onTogglePanel`
- Prefer passing data and callbacks over passing stores or service objects.
- Avoid boolean prop explosion; group related display modes into unions/enums.

## Refactor Procedure

1. Identify mixed-responsibility components.
2. Move orchestration code to container level.
3. Extract view blocks to presentational components.
4. Define typed prop contracts for extracted components.
5. Replace inline JSX with component composition.
6. Remove dead code/imports and validate with lint/typecheck.

## Review Checklist

- Can this component be understood without reading API/store code?
- Is every side effect in a container component?
- Are callbacks named by intent and typed precisely?
- Does each component have one clear primary responsibility?
