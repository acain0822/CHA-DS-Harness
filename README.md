# CHA Design System — Storybook

Documentation and visual regression tests for the City of Chattanooga design system, generated from the **CHA Design System** Figma file.

- Figma (working copy): https://www.figma.com/design/nMenOGxGYRL0pyDAc0ZmFF/CHA-Design-System--Copy-
- Progress and open design questions: [`design-system/manifest.json`](design-system/manifest.json)

## First run

```bash
npm install
npm run fetch:figma-assets   # downloads the icon SVGs from Figma (links expire 2026-11-13)
npm run storybook            # http://localhost:6006
```

If `fetch:figma-assets` reports expired links, export these from the Figma Icons page into `src/assets/icons/` with the same names: `arrow-right.svg`, `arrow-left.svg`, `check.svg`. Until then, icons render as empty space.

## What's here

| Path | What it is |
|---|---|
| `design-system/tokens.figma.json` | Raw Figma variables, as Figma names them |
| `src/tokens/tokens.css`, `tokens.ts` | Generated from the above by `npm run tokens`. Don't edit by hand |
| `src/styles/responsive.css` | Large/Small Screen type styles switched at a breakpoint |
| `src/components/*` | Components, their CSS and their stories |
| `src/foundations/` | Colors, Typography, Spacing & Radius, Elevation pages |
| `tests/visual/` | Screenshot tests and their baselines |

Every component story links to its Figma node in the **Design** panel. Each component has an **All Variants** story that mirrors the Figma component set, which is the quickest way to compare code with design.

## Updating tokens

1. Replace `design-system/tokens.figma.json` with fresh values from Figma.
2. `npm run tokens`
3. `npm run test:visual` — every component and Foundations page that changed shows up as a diff.

## Visual regression tests

Screenshots are taken of every story at desktop (1280px) and mobile (375px) widths.

```bash
npm run test:visual          # compare against baselines
npm run test:visual:update   # accept current rendering as the new baseline
```

Baselines must be created in the same Linux image CI uses, because fonts render differently on macOS and Windows:

```bash
docker run --rm -v "$PWD":/work -w /work mcr.microsoft.com/playwright:v1.63.0-noble \
  sh -c "npm ci && npm run test:visual:update"
```

Commit the images in `tests/visual/__screenshots__`. On pull requests, `.github/workflows/visual.yml` fails if any story changed visually and uploads the expected, actual and diff images. If the change is intended, update the baselines and commit them, which puts the visual change in the PR for review.

To leave a story out of screenshots, add `tags: ['!vr']` to it.

## Keeping up with Figma

Figma is the source of truth. Each working session with Claude starts with a **sync check**: it re-reads Figma into `design-system/figma/`, compares it with `design-system/figma-snapshot.json`, and writes `design-system/reports/figma-changes.md`. Built components that changed are marked `stale` in the manifest and rebuilt; variable changes regenerate the tokens.

Every time design detail is read from Figma, a **token audit** writes `design-system/reports/token-audit.md`: each value in a component that isn't bound to a Figma variable or text style, with the variant, layer and a link. Expect a long list at first; the goal is zero. Share it with the design team as a fix list.

```bash
npm run figma:sync    # compare saved Figma data with the last snapshot
npm run figma:audit   # list unbound values in saved design context
```

Both scripts read the saved files; Claude refreshes those from Figma.

## Status

Batch 1 (verified against Figma): Foundations, Button, Checkbox, Input Field, Text Link.
Next up: Message, Radio Button, Textarea, Dropdown, Badge, Pagination. See the manifest for the full list of 82 component sets and the open design questions.
