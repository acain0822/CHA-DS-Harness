# CHA design system: plan

Updated 2026-11-23. Figma and pull request checks are paused.

A shared component source that documents itself, shows where it's used and passes changes along. **Using a component never needs permission.** Checks apply only when the shared system changes.

| Goal | Status |
|---|---|
| Live documentation and analytics | Started: each Storybook component page leads with the live component, its controls and states; usage follows, generated from the code. Live site: 7 pages, unconfirmed matches. Product code: scanner built (`npm run scan:code`), no real product scanned yet. Figma: not measured |
| One place to pull components from | Built locally, not published: `npm run build:package` makes `package-dist/`. Tested in a Next.js app and a plain HTML page |
| Inheritance documentation | Built for code: base > variant > state > token > value. Figma token links and brands are not recorded yet |
| Design-to-code and code-to-design | Planned |

## Rules

- Not measured is not zero.
- Generated pages are never edited by hand. Fix the source.
- Matching values are not proof of inheritance.
- Figma, live site and product code counts stay separate.
- The component list is provisional until the main Figma file is ready.

## Inheritance

`scripts/system_map.mjs` reads the component CSS, types and tokens. Storybook rebuilds it when those change. A new component needs a page like `Button.mdx`. Inheritance is collapsed there for now and will matter more as brands and overrides arrive.

To add later: token links from Figma (the saved data has only final values), then base > brand > sub-brand, where each level stores only its changes and every instance is inherited, overridden, detached or forked.

## Design and code

- Figma change: compare, propose a code update, check, one review by design and dev, release.
- Code change: check, list the difference for Figma, design accepts it or asks for a change.
- Release: lists what changed and which products use it. Breaking changes get a new major version. Products choose when to update.

## Next

1. Choose a home for the package (name, registry, who can install), then publish the first version.
2. Scan the first real product.
3. "Out of sync" labels for design and code. They inform and don't block.
4. Connect Figma: active development use, trim list, token links.
5. Brand levels, tested with one sub-brand.
