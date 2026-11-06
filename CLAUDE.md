# CHA Design System

Storybook documentation and visual regression tests for the City of Chattanooga design system, built from Figma with the `figma-storybook` skill in `.claude/skills/figma-storybook/`.

- Figma source of truth (working copy): https://www.figma.com/design/nMenOGxGYRL0pyDAc0ZmFF/CHA-Design-System--Copy-
- Progress, component status and open design questions: `design-system/manifest.json`
- Latest reports: `design-system/reports/figma-changes.md`, `design-system/reports/token-audit.md`

## Every session

Use the `figma-storybook` skill for any work on this project. Start with its sync check (step 0), even when the request is about something else. Tell me what changed in Figma before doing other work, then rebuild anything marked `stale`.

Run the token audit whenever design context is read from Figma. Unbound values are reported for the design team to fix in Figma, never silently changed in code.

If `figmaSync` in `design-system/harness.config.json` is `paused`, skip the sync check, make no Figma calls, and say once that Storybook reflects the last snapshot.

## Design harness

This repo is the source of truth for design across our products. Code is built from Figma design context, read with the Figma MCP's `get_design_context` and saved in `design-system/figma/`.

- Before touching a component, run `npm run harness -- context <Component>`. A Claude Code hook also checks this on every edit in `src/components/`.
- Never invent design details when context is missing. Flag the gap in the manifest notes.
- After building, run `npm run harness:check`. Commit `design-system/reports/harness-log.jsonl` and `harness-log.md` with the work.
- `contextEnforcement` in `harness.config.json` is `warn` until Figma access is sorted out, then `block`. Only change it when asked.

## Test page

`src/pages/ServicePage/` is a throwaway sandbox for whatever the current user needs. It isn't part of the design system or any product, and its content is sample text. Add to it or change it freely: it needs no manifest entry, visual baseline or sign-off. Don't treat it as a pattern to copy. Anything reusable that starts there still goes through the harness and into `src/components/`.

## Conventions

- React + TypeScript + Vite, Storybook 10, plain CSS per component. Components use only the CSS variables in `src/tokens/tokens.css`, which is generated: edit `design-system/tokens.figma.json` and run `npm run tokens`.
- Figma `Screen = Desktop | Mobile` variants are a breakpoint (`src/styles/responsive.css`), not a prop. Interaction states (hover, focus, active) come from CSS, and stories show them with `storybook-addon-pseudo-states`.
- Every component has an `AllVariants` story that mirrors its Figma component set. It's the main visual test.
- Visual baselines are created in the Playwright Docker image (see README), never on Windows directly.
- Figma's Starter plan limits MCP calls. Budget them, and mark anything unread as `blocked` in the manifest.
