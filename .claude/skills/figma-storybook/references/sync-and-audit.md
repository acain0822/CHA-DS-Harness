# Sync check and token audit

Two checks keep Storybook honest against Figma:

- **Sync check** — runs at the start of every session. It finds what changed in Figma since the last run, so Storybook always reflects the latest design.
- **Token audit** — runs every time design code is read from Figma. It lists every value in Figma that isn't bound to a variable or text style, with the layer it's on.

Both work from tool output saved in the repo, so each run can be compared with the last.

## Saved Figma data

```
design-system/
  figma-snapshot.json         fingerprint of the file at the last sync check
  tokens.figma.json           all Figma variables (also the token source)
  figma/
    metadata/<page>.xml       get_metadata, one file per component page
    variables/<node-id>.json  get_variable_defs per built component set (1:234 → 1-234.json)
    screens/<node-id>.png     get_screenshot per built component set
    context/<Component>.tsx   get_design_context, first line `// figma-node: 1:234`
  reports/
    figma-changes.md / .json  latest sync check
    token-audit.md / .json    latest token audit
```

Saving tips:
- `get_metadata` results too large for the conversation are saved by the harness to a tool-results file as JSON (`[{type, text}]`). Both scripts accept that format directly; copy the file into `figma/metadata/`.
- For `get_screenshot`, download the returned URL with `curl -L`. If the sandbox blocks figma.com, call again with `enableBase64Response: true`; the harness saves the image to a local file named in the result — copy that file to `figma/screens/<node-id>.png`.
- Always add the `// figma-node: <id>` first line when saving design context. The audit uses it for links, and the sync check uses it to match the file to its component set.

## Sync check (every run, before anything else)

Figma has no change feed, so the check compares fingerprints. Each source sees different changes, and together they cover everything Storybook depends on:

| Source | Calls | Catches |
|---|---|---|
| `get_metadata` per component page | 1 per page | new, removed and renamed component sets and variants; new or removed property values; variant size changes |
| `get_variable_defs` on the variables frame or a few large sets | a few | new, removed and changed variable values (tokens) |
| `get_variable_defs` per **built** set | 1 per built set | which variables a component uses, and their values |
| `get_screenshot` per **built** set | 1 per built set | anything visual: raw colours, padding, text, effects |

Page metadata does **not** include layers inside a variant, so on its own it misses a colour or spacing change. That's why built components also get a screenshot and variable read. Unbuilt components only need the metadata: they'll be read in full when they're built.

Steps:

1. Re-read the sources above into `design-system/figma/`. If the call budget is tight, prioritise: component pages, then built sets, then the rest. If you re-read only some pages, pass `--partial` to the diff so unchecked pages aren't reported as removed.
2. Snapshot and diff:
   ```bash
   python <skill-dir>/scripts/figma_sync.py snapshot \
     --metadata design-system/figma/metadata --variables design-system/tokens.figma.json \
     --set-variables design-system/figma/variables --screens design-system/figma/screens \
     --context design-system/figma/context --carry design-system/figma-snapshot.json \
     --out design-system/figma-snapshot.new.json
   python <skill-dir>/scripts/figma_sync.py diff design-system/figma-snapshot.json \
     design-system/figma-snapshot.new.json --manifest design-system/manifest.json \
     --out design-system/reports/figma-changes --apply
   ```
   Exit code 0 means nothing changed; 2 means changes, listed in `reports/figma-changes.md`. `--apply` marks built components `stale` (with a dated note of what changed), adds new sets as `extracted`, marks deleted ones `removed-in-figma`, and flags tokens for regeneration.
3. Act on it:
   - Variable changes → refresh `tokens.figma.json`, run `tokens_to_css.py`, then the visual tests. Token changes flow to every component automatically; the visual diffs show exactly where.
   - `stale` components → re-read their design context (`get_design_context`), update the component and stories, run the token audit, re-verify, and set the status back to `verified`. Re-baseline their visual tests only after verifying, so the baseline is the new design.
   - New sets → add to the backlog. Removed sets → ask before deleting code; mark the stories deprecated meanwhile.
4. Replace the old snapshot: `mv design-system/figma-snapshot.new.json design-system/figma-snapshot.json`.
5. Tell the user what changed in Figma, in plain terms, before starting other work.

On the very first run there's no previous snapshot: write one and report "baseline created".

If the user wants this to happen without asking, offer a scheduled task that runs the sync check weekly and reports back. It only reads Figma and writes reports, so it's safe to run unattended; rebuilding stale components still happens in a normal session.

## Token audit (every time design context is read)

```bash
python <skill-dir>/scripts/token_audit.py \
  --context design-system/figma/context --variables design-system/tokens.figma.json \
  --metadata design-system/figma/metadata --file-url "<figma file URL>" \
  --manifest design-system/manifest.json --out design-system/reports/token-audit
```

It reads Figma's reference code, where a bound value looks like `var(--spacing/spacing-xs, 16px)` and an unbound one looks like `16px`, and reports four kinds of finding:

| Kind | Meaning | Usual fix (in Figma) |
|---|---|---|
| Raw value, variable exists | The value equals a variable but isn't bound to it | Select the layer and pick the suggested variable |
| Raw value, no variable | No variable has this value (often a tint, an odd spacing such as 9px, or a one-off radius) | Add a variable, or change to an existing value |
| Unknown variable | Bound to a variable that isn't in this file (deleted, renamed, or from another library) | Rebind to a current variable |
| Text style | Size / line height / tracking match no text style | Apply the nearest text style |

Each finding gives the component, the variant (from the set's variant names, or from the conditions in the code), the layer name, the node id with a link, the CSS property and the value. Widths, heights and positions are not audited: those are layout, not tokens.

The audit writes a per-component count into the manifest (`tokenAudit`) and a note pointing at the report section. The aim is zero; expect many findings on a first run.

In the run summary, give the total and the top three components by count. Share `reports/token-audit.md` with the design team as a to-do list; it's written for designers, with direct links to each layer.

Code is still built from the design as it is: an unbound value is matched in CSS with the nearest token where they're equal, or kept as a literal with a comment pointing at the audit. Don't silently "fix" a design value in code; the audit is how the discrepancy gets resolved at the source.

## Optional: show both reports in Storybook

A `Design QA` docs page keeps the reports visible to everyone using Storybook:

```mdx
{/* src/design-qa/DesignQA.mdx */}
import { Meta, Markdown } from '@storybook/addon-docs/blocks';
import changes from '../../design-system/reports/figma-changes.md?raw';
import audit from '../../design-system/reports/token-audit.md?raw';

<Meta title="Design QA" />

<Markdown>{changes}</Markdown>
<Markdown>{audit}</Markdown>
```

Docs pages aren't screenshotted by the visual tests, so changing reports don't cause visual diffs.
