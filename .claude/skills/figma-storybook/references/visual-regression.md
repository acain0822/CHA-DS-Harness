# Visual regression

Two supported setups. Pick one per project and record it in `manifest.settings.vrTool`.

| | Playwright screenshots | Chromatic |
|---|---|---|
| Cost | Free | Free tier, then paid per snapshot |
| Baselines | PNGs committed to the repo | Hosted by Chromatic |
| Review | Diff images in CI artifacts / PR | Web UI with approve / reject per story |
| Browsers | Chromium, Firefox, WebKit locally | Hosted cloud browsers |
| Best for | Teams that want everything in git, no vendor | Teams with designers who will review diffs |

Default to Playwright. Suggest Chromatic when non-developers (designers, product owners) are expected to approve visual changes, since its review UI is much friendlier than PNG diffs.

## Determinism checklist

Flaky screenshots destroy trust in the suite faster than anything else. Before capturing baselines:

- [ ] Animations and transitions off (global CSS in the test, or `prefers-reduced-motion` honored by components)
- [ ] Web fonts loaded: `await document.fonts.ready` before capturing
- [ ] Fixed viewports
- [ ] No `Date.now()`, random IDs or live API calls in stories; use fixtures
- [ ] Caret hidden in inputs (`caret-color: transparent`)
- [ ] Baselines generated in the same environment CI uses (a Docker image), because font rendering differs between macOS, Windows and Linux

## Playwright setup

Screenshots run against the built static Storybook. Storybook writes `index.json` listing every story, so the test enumerates stories instead of hard-coding them.

```bash
npm i -D @playwright/test http-server
npx playwright install chromium
```

`playwright.config.ts`:

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/visual',
  snapshotPathTemplate: '{testDir}/__screenshots__/{arg}{ext}',
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.001, animations: 'disabled' } },
  use: { baseURL: 'http://127.0.0.1:6007' },
  webServer: {
    command: 'npx http-server storybook-static -p 6007 -s',
    port: 6007,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1280, height: 800 } } },
    { name: 'mobile', use: { viewport: { width: 375, height: 812 } } },
  ],
});
```

`tests/visual/stories.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import fs from 'node:fs';

type Entry = { id: string; type: 'story' | 'docs'; tags?: string[] };
const index = JSON.parse(fs.readFileSync('storybook-static/index.json', 'utf8'));
const stories = (Object.values(index.entries) as Entry[]).filter(
  (e) => e.type === 'story' && !e.tags?.includes('!vr'),
);
const themes = ['light', 'dark'];

for (const story of stories) {
  for (const theme of themes) {
    test(`${story.id} [${theme}]`, async ({ page }) => {
      await page.goto(`/iframe.html?id=${story.id}&viewMode=story&globals=theme:${theme}`);
      await page.waitForSelector('#storybook-root > *');
      await page.evaluate(() => document.fonts.ready);
      await page.addStyleTag({ content: '*{caret-color:transparent!important}' });
      await expect(page.locator('#storybook-root')).toHaveScreenshot(
        `${story.id}--${theme}.png`,
      );
    });
  }
}
```

`package.json` scripts:

```json
{
  "build-storybook": "storybook build",
  "test:visual": "npm run build-storybook && playwright test",
  "test:visual:update": "npm run build-storybook && playwright test --update-snapshots"
}
```

Run `test:visual:update` once to create baselines, inside the CI Docker image (`mcr.microsoft.com/playwright:<version>-jammy`) so they match CI.

### CI (GitHub Actions)

```yaml
name: Visual regression
on: [pull_request]
jobs:
  visual:
    runs-on: ubuntu-latest
    container: mcr.microsoft.com/playwright:v1-jammy # match the installed @playwright/test version
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm run test:visual
      - if: failure()
        uses: actions/upload-artifact@v4
        with: { name: visual-diffs, path: test-results }
```

A failing run uploads the expected / actual / diff images. If the change is intended, the author reruns `test:visual:update` and commits the new baselines, which shows the visual change in the PR.

## Chromatic setup

```bash
npm i -D chromatic @chromatic-com/storybook
```

Add `@chromatic-com/storybook` to `addons` in `.storybook/main.ts` (it adds the Visual Tests panel). The user creates a Chromatic project, linked to their repo, and stores the project token as a CI secret named `CHROMATIC_PROJECT_TOKEN`. Never write the token into a file.

Themes and viewports use Chromatic modes:

```ts
// .storybook/modes.ts
export const allModes = {
  'light desktop': { theme: 'light', viewport: 1280 },
  'dark desktop': { theme: 'dark', viewport: 1280 },
  'light mobile': { theme: 'light', viewport: 375 },
};
```

```ts
// preview.ts
parameters: { chromatic: { modes: allModes } }
```

Exclude a story with `parameters: { chromatic: { disableSnapshot: true } }`.

CI:

```yaml
name: Chromatic
on: [pull_request, push]
jobs:
  chromatic:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - uses: chromaui/action@latest
        with:
          projectToken: ${{ secrets.CHROMATIC_PROJECT_TOKEN }}
          onlyChanged: true
```

`onlyChanged` uses TurboSnap to snapshot only stories affected by the change, which keeps a large design system within the snapshot budget.

## Accessibility alongside VR

`@storybook/addon-a11y` runs axe on each story in the UI. To fail CI on violations as well, run the Storybook Test (Vitest addon) suite in CI with `a11y: { test: 'error' }` in `preview.ts` parameters. Start with `'todo'` on a large existing system so violations are listed without blocking, then tighten.
