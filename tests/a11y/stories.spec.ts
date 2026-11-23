import { test, expect } from '@playwright/test';
import fs from 'node:fs';

/* Runs axe on every component and page story against WCAG 2.1 A and AA. */
type Entry = { id: string; type: string };
const index = JSON.parse(fs.readFileSync('storybook-static/index.json', 'utf8'));
const axe = fs.readFileSync('node_modules/axe-core/axe.min.js', 'utf8');

for (const story of (Object.values(index.entries) as Entry[]).filter((e) => e.type === 'story')) {
  test(story.id, async ({ page }) => {
    await page.goto(`/iframe.html?id=${story.id}&viewMode=story&globals=a11y.manual:!true`);
    await page.waitForSelector('#storybook-root > *');
    await page.evaluate(() => document.fonts.ready);
    // Storybook fades backgrounds in. Measure the final color, not one mid-fade.
    await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation:none!important}' });
    await page.evaluate(axe);
    const found = await page.evaluate(async () => {
      const r = await (window as any).axe.run('#storybook-root', {
        runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'],
      });
      return r.violations.map((v: any) => `${v.id} (${v.impact}) x${v.nodes.length}: ${v.nodes[0].html.slice(0, 110)} | ${v.nodes[0].failureSummary?.split('\n')[1]?.trim()}`);
    });
    expect(found).toEqual([]);
  });
}

// If this ever passes axe, the checks above mean nothing.
test('control: axe reports a known failure', async ({ page }) => {
  await page.setContent('<main id="storybook-root"><input><p style="color:#ccc;background:#fff">Low contrast</p></main>');
  await page.evaluate(axe);
  const ids = await page.evaluate(async () => (await (window as any).axe.run('#storybook-root')).violations.map((v: any) => v.id));
  expect(ids).toEqual(expect.arrayContaining(['label', 'color-contrast']));
});
