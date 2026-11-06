---
name: figma-storybook
description: Turn a Figma design system into a Storybook that documents every component and token and doubles as a visual regression test suite, keeps it in sync with Figma changes, and audits Figma for values not bound to variables. Use this whenever the user shares a Figma file or URL for a design system, UI kit or component library and wants Storybook, component docs, stories, a living style guide, design-to-code parity checks, or visual regression / screenshot testing, even if they only say "document our components", "set up VR tests from Figma", "check what changed in Figma", "sync Storybook with the design" or "find hard-coded values in our Figma file".
---

# Figma → Storybook

Build a Storybook from a Figma design system so that it serves two jobs at once:

1. **Documentation** — every token and component, with its variants, props, usage notes and a link back to its Figma source.
2. **Visual regression testing** — every visual state is a story, and every story is a screenshot baseline that fails CI when the rendering drifts.

The two jobs pull in the same direction: a story that documents a variant well is also a good screenshot. Keep that in mind and you rarely have to write anything twice.

Large design systems have hundreds of components, so this skill is built around a **manifest** that tracks what has been extracted, built and verified. Work in batches and keep the manifest current; it is what lets the work survive across sessions and lets the user see progress.

Figma is the source of truth, and it keeps changing. Two checks run on every session so Storybook never quietly drifts from it:

- **Sync check** (step 0, before anything else): find what changed in Figma since the last run, and rebuild what it affects.
- **Token audit** (whenever design code is read): list every Figma value that isn't bound to a variable or text style, with the exact layer, so the design team can fix it at the source. The target is zero.

Both are described in `references/sync-and-audit.md`, with scripts in `scripts/`.

## Before starting

Settle these, from the conversation or by looking at the project, and ask only about what you can't find:

- **Figma file URL** (and the page or section, if the system spans several files). Confirm the Figma tools can read it (`whoami`, then `get_metadata` on the file).
- **Where the code lives.** A connected folder or a repo. If a `package.json` exists, read it.
- **Framework.** Use what the project already uses. With no existing project, default to React + TypeScript + Vite: it has the best Storybook and Figma Code Connect support. See `references/frameworks.md` for Vue, Web Components and HTML.
- **Components: existing or generated?** Search the project for an existing component library. If components exist, write stories for them and only flag where they diverge from Figma. If not, generate components from Figma. Mixed is common; record which per component in the manifest.
- **Visual regression tool.** Default to Playwright screenshots (free, baselines in the repo). Offer Chromatic when the team wants hosted review and approval UI. Details in `references/visual-regression.md`.

State the choices you made in one short block before building, so the user can redirect.

## Workflow

### 0. Sync check — every run

If the project already has `design-system/figma-snapshot.json`, start here, even when the user asked for something else (a new batch, a fix). Building on a stale picture of Figma wastes the work.

1. `create_session`, then re-read Figma into `design-system/figma/`: `get_metadata` for each component page, `get_variable_defs` for the variables, and `get_variable_defs` plus `get_screenshot` for each component that's already built. Page metadata alone misses changes inside a variant (a new colour, different padding), which is why built components also get a screenshot and their variables.
2. Run `figma_sync.py snapshot`, then `figma_sync.py diff ... --apply` (exact commands in `references/sync-and-audit.md`). The report lands in `design-system/reports/figma-changes.md`; the manifest marks affected built components `stale`.
3. Tell the user what changed, in plain words, before doing anything else: "Since Oct 30: ADA blue changed to #0656C8 (affects 14 components), Button gained a Text type, Back to Top was removed."
4. Bring Storybook up to date: regenerate tokens if variables changed, then rebuild `stale` components (re-read design context, update code and stories, audit, verify, re-baseline). Ask before deleting code for components removed from Figma.
5. Replace the snapshot with the new one.

On the first run there's no snapshot yet: create the baseline at the end of step 2 below, once tokens are saved.

If call limits are tight, check component pages and built components first; pass `--partial` when only some pages were re-read.

### 1. Inventory the Figma file

Goal: a complete list of what exists before writing any code.

- Parse the `fileKey` from the URL (`figma.com/design/<fileKey>/...`; for a branch URL use the branch key) and call `create_session` with it before any other Figma file tool. Reuse the session ID for the rest of the run.
- `get_metadata` on the file root to see pages and top-level frames. Design systems usually have pages like Foundations / Tokens, Components, Patterns, Templates.
- `search_design_system` and `get_libraries` to list published components and component sets.
- For each component set, record its **component properties**: variant properties (with every value), booleans, text properties and instance-swap slots. These become props.

Save each page's `get_metadata` output to `design-system/figma/metadata/<page>.xml`; the sync check compares against it next time.

Write `design-system/manifest.json` (see `references/manifest.md` for the schema). One entry per component, with Figma node ID, URL, properties, category, and status `extracted`. Show the user a short summary: counts per category, and anything odd (detached instances, components with no variants, duplicates).

### 2. Tokens and foundations

Tokens come first because every component depends on them.

- `get_variable_defs` on the token / foundations frames. Collect colors, typography, spacing, radius, shadow, breakpoints, and any modes (light / dark, brand themes).
- Save the raw result as `design-system/tokens.figma.json`, then run:
  ```bash
  python <skill-dir>/scripts/tokens_to_css.py design-system/tokens.figma.json --out src/tokens
  ```
  This writes `tokens.css` (CSS custom properties, one block per mode) and `tokens.ts` (typed token object). Components use the CSS variables, never raw hex values, so a token change shows up everywhere and in every screenshot.
- Take the first snapshot so later runs can see changes: `figma_sync.py snapshot ... --out design-system/figma-snapshot.json`.
- Write Foundations docs pages (MDX): Colors (swatch grid with name, value and variable), Typography (each text style rendered), Spacing, Radius, Elevation, Iconography. These pages are also screenshot-tested, so a token change produces a visible, reviewable diff.

Patterns for these pages are in `references/story-patterns.md`.

### 3. Scaffold Storybook

In the project folder:

```bash
npm create storybook@latest
```

Then add what the workflow needs:

- `@storybook/addon-docs` (autodocs from component types)
- `@storybook/addon-a11y` (accessibility checks per story; cheap to add and catches real issues)
- `@storybook/addon-designs` (embeds the Figma frame in a panel next to each story)
- `@storybook/addon-vitest` if using Storybook Test for interaction tests

Don't pin versions from memory; let the installer choose current ones. Import `tokens.css` and the design system's fonts in `.storybook/preview.ts`, and register any theme modes as a toolbar global so both light and dark can be rendered.

If package installs fail because the session has no network, write all the files anyway, list the exact install command for the user to run, and say so plainly.

### 4. Build each component (in batches)

Work category by category, around 5–10 components per batch, simplest and most-depended-on first (Icon, Button, Input before Card, Modal, DataTable). For each component:

1. Load Figma's `figma-design-to-code` skill once per run (the Figma connector requires it before `get_design_context`). Then `get_design_context` on the component set node for structure, layout, and the styles it uses; `get_screenshot` for the visual reference. Save all three outputs (design context to `figma/context/<Component>.tsx` with a first line `// figma-node: <id>`, the screenshot to `figma/screens/<node-id>.png`, the set's `get_variable_defs` to `figma/variables/<node-id>.json`): they are the baseline for the next sync check.
2. **Run the token audit** on the saved design context (`token_audit.py`, see `references/sync-and-audit.md`). It reports every raw value (a typed `#18546E` or `16px` instead of a variable), every binding to a variable that isn't in the file, and every text that matches no text style, each with variant, layer and a link to the node. Use it while building: where Figma uses a raw value that equals a token, use the token in code; where no token exists, keep the literal with a `/* token audit: no variable */` comment. Never quietly substitute a different value. The findings go to the design team; they aren't something to fix in code.
3. **Map Figma properties to props** — this mapping is the contract between design and code, so keep it literal and predictable:
   | Figma property | Prop |
   |---|---|
   | Variant (e.g. `Size = sm, md, lg`) | union type `size: 'sm' \| 'md' \| 'lg'` |
   | Variant `State = default, hover, focus, disabled` | interaction states are not props; `disabled` becomes a boolean, hover / focus become pseudo-state stories |
   | Boolean (`Show icon`) | `boolean` prop, or an optional slot if it toggles content |
   | Text (`Label`) | `string` prop or `children` |
   | Instance swap (`Icon`) | slot prop (`ReactNode` / named slot) |
   Use Figma's names, converted to camelCase, so a designer can read the code. Note any rename in the component's docs.
4. **Generate or check the component.** Generating: build it from tokens only, with semantic HTML and correct ARIA. Existing: read it, compare its props and rendering with the Figma mapping, and record mismatches in the manifest rather than silently "fixing" someone's component.
5. **Write the stories** (CSF3; full template in `references/story-patterns.md`):
   - `Default` with controls for every prop.
   - One story per meaningful variant value.
   - State stories: hover, focus, active, disabled, error, loading, empty, long-text overflow.
   - An `AllVariants` matrix story that renders the full variant grid on one canvas. This is the most valuable VR story: one screenshot covers the whole component, and it mirrors the Figma component set, so design review is a side-by-side glance.
   - `parameters.design` with the Figma node URL, and a short description (what it is for, when not to use it) from the Figma component description.
6. **Verify fidelity.** Render the `AllVariants` story, screenshot it, and compare with the Figma screenshot. Fix clear mismatches in spacing, color, type or radius. Record remaining differences in the manifest's `notes`.
7. Update the manifest status (`built` → `verified`).

After each batch, tell the user what was built, the token-audit count per component, and anything else that needs a design decision (missing states, inconsistent variants).

### 5. Visual regression

Set up the chosen tool following `references/visual-regression.md`. Whatever the tool, screenshots are only useful if they are deterministic, so always:

- Disable animations and transitions in the test environment.
- Wait for fonts to load before capturing.
- Use fixed viewports (at least mobile and desktop for layout components).
- Avoid dates, random data and live network calls in stories; use fixed fixtures.
- Capture each theme mode as its own snapshot.

Generate the first baselines, then add a CI workflow so pull requests fail on unreviewed visual changes. Exclude purely documentational stories from VR with a tag (`!vr`) rather than deleting them.

### 6. Optional: Figma Code Connect

If the user wants code snippets to appear in Figma's Dev Mode, use `get_code_connect_suggestions` and `add_code_connect_map` to link each Figma component to its coded component, using the same prop mapping as step 4. Ask before writing anything back to Figma.

## Practical limits (learned on real files)

- **Access.** The Figma connector needs edit access even to read. If a file refuses, the quickest fix is for the user to "Duplicate to your drafts" and share that link; record in the manifest that you're working from a copy.
- **Rate limits.** Figma's Starter plan caps MCP tool calls, and `get_design_context` on a large component set is expensive. Budget the calls: inventory with `get_metadata` (parse large results from the saved file with a script rather than reading them), collect variables with `get_variable_defs` on component sets rather than pages, and stop a batch cleanly when the limit hits, marking unread components `blocked` in the manifest. A file in a Pro or Organization team gets more calls.
- **Variables come from nodes.** `get_variable_defs` needs a node, not a page, and only returns variables that node uses. A "Colors" page is often typed text, not variables, and can disagree with the real variables; trust the variables and flag the difference.
- **Duplicate component sets** are common (an old "Components" page plus newer dedicated pages). Prefer the dedicated page, or the one the user linked, and mark the other `superseded`.
- **Asset URLs** from `get_design_context` are temporary and the sandbox may not be able to download them. Write a small fetch script into the project for the user to run, and make icons degrade to empty space so the build doesn't break.
- **Units.** In Figma's `Font(...)` strings, `letterSpacing` is a percent of font size (→ `em`), and `lineHeight: 100` means 100% (→ `normal`); other line heights are px. `tokens_to_css.py` handles this.
- **Verifying without Storybook.** If Storybook can't be installed in the session, bundle the stories' `AllVariants` render functions with esbuild into a plain page, rewrite `:hover` / `:focus-visible` / `:active` in the CSS to `.pseudo-*` classes, and screenshot it with Playwright. This checks the real story code.

## Design harness

Every component change goes through `scripts/harness.mjs`, configured in `design-system/harness.config.json`:

- **Before:** `npm run harness -- context <Component>` prints the Figma link, properties, saved context, tokens, notes and open log items. A PreToolUse hook checks the same thing on each edit in `src/components/`, and in `block` mode refuses the edit until the context is saved.
- **Context is complete** when all three outputs from step 4 exist: `figma/context/<Component>.tsx` (with its `// figma-node:` line), `figma/screens/<node-id>.png` and `figma/variables/<node-id>.json`.
- **After:** `npm run harness:check` logs failures to `design-system/reports/harness-log.jsonl` and rewrites `harness-log.md`, which the Design QA page in Storybook shows.
- **People's decisions:** `npm run harness -- review <id|Component> approved|rejected --by <name> --note <text>`. Approving a finding records an accepted exception. Rejecting keeps it open.
- **Other tools:** `npm run harness -- record <a11y|visual|manual> <Component> <message>`.

If `figmaSync` is `paused`, skip step 0, make no Figma calls, and say so once.

## Finishing a run

Make sure `design-system/figma-snapshot.json` reflects what was just read, and the reports are current.

Report briefly, in this order:
1. **Figma changes** found by the sync check and what was rebuilt (or "no changes since <date>").
2. **Progress**: components verified out of total, foundations done, VR status (baselines, CI).
3. **Token audit**: total unmatched values, and the components with the most, pointing to `design-system/reports/token-audit.md`. Say whether the count went up or down since last run.
4. Open design questions from the manifest.

Offer the next batch as the next step. If the user hasn't set one up, offer once to schedule the sync check (weekly, read-only) so Figma changes surface even between sessions.

## Reference files

- `references/manifest.md` — manifest schema and status values. Read at step 1.
- `references/story-patterns.md` — CSF3 story template, AllVariants matrix, pseudo-states, Foundations MDX pages. Read at steps 2 and 4.
- `references/visual-regression.md` — Playwright and Chromatic setup, determinism checklist, CI workflow. Read at step 5.
- `references/frameworks.md` — differences for Vue, Web Components and plain HTML. Read only when not using React.
- `references/sync-and-audit.md` — the sync check and token audit: what to save, commands, how to act on the reports. Read at step 0 and step 4.
- `scripts/tokens_to_css.py` — converts Figma variable definitions to CSS custom properties and a typed TS object.
- `scripts/figma_sync.py` — `snapshot` fingerprints the Figma file from saved tool output; `diff` reports changes and updates the manifest.
- `scripts/token_audit.py` — finds Figma values not bound to variables or text styles, per layer, and writes the report and manifest notes.
