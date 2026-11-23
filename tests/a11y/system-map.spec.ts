import { test, expect } from '@playwright/test';
import fs from 'node:fs';
// @ts-expect-error plain JavaScript module
import { buildMap } from '../../scripts/system_map.mjs';

const axe = fs.readFileSync('node_modules/axe-core/axe.min.js', 'utf8');
const map = buildMap(process.cwd());

/* The map works out the cascade itself, so check it against the browser's answer. */
for (const [name, base, tag] of [['Button', 'cha-button', 'button'], ['TextLink', 'cha-link', 'a']]) {
  test(`${name}: the map matches the browser`, async ({ page }) => {
    const c = map.components.find((x: any) => x.name === name);
    const css = ['src/tokens/tokens.css', 'src/styles/responsive.css', `src/components/${name}/${name}.css`].map((f) => fs.readFileSync(f, 'utf8')).join('\n');
    const states = name === 'Button' ? ['default', 'hover', 'disabled', 'active', 'focus'] : ['default', 'hover', 'disabled', 'active', 'focus'];
    // Turn states into classes so each can be forced without changing the weight of any rule.
    const forced = css.replace(/:(hover|active|disabled|focus-visible)\b/g, (_, s) => `.is-${s === 'focus-visible' ? 'focus' : s}`).replace(/\[aria-disabled='true'\]/g, '.is-disabled');
    await page.setContent(`<style>*{transition:none!important}</style><style>${forced}</style><div id="root"></div>`);
    const bad: string[] = [];
    let compared = 0;
    for (const v of c.views.filter((x: any) => states.includes(x.state))) {
      const cls = [base, ...Object.values(v.variant).map((x) => `${base}--${x}`), v.state === 'default' ? '' : `is-${v.state}`].join(' ');
      const rows = v.rows.filter((r: any) => r.part === base).map((r: any) => [r.prop, r.value]);
      const out = await page.evaluate(({ cls, rows, tag }) => {
        const root = document.querySelector('#root')!;
        root.innerHTML = '';
        const real = root.appendChild(document.createElement(tag));
        real.className = cls;
        const mine = root.appendChild(document.createElement(tag));
        for (const [p, val] of rows) mine.style.setProperty(p, val);
        const a = getComputedStyle(real);
        const b = getComputedStyle(mine);
        return rows.filter(([p]: string[]) => p !== 'transition' && a.getPropertyValue(p) !== b.getPropertyValue(p)).map(([p]: string[]) => `${cls} ${p}: browser ${a.getPropertyValue(p)}, map ${b.getPropertyValue(p)}`);
      }, { cls, rows, tag });
      compared += rows.length;
      bad.push(...out);
    }
    expect(compared).toBeGreaterThan(100);
    expect(bad).toEqual([]);
  });
}

const index = JSON.parse(fs.readFileSync('storybook-static/index.json', 'utf8'));
for (const e of Object.values(index.entries).filter((x: any) => x.type === 'docs' && /^(Design System|Components)\//.test(x.title)) as any[]) {
  test(`docs: ${e.title}`, async ({ page }) => {
    await page.goto(`/iframe.html?id=${e.id}&viewMode=docs`);
    await page.waitForSelector('.sm');
    await page.evaluate(() => document.querySelectorAll('details').forEach((d) => (d.open = true)));
    await page.evaluate(axe);
    const found = await page.evaluate(async () => (await (window as any).axe.run('.sm', { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }))
      .violations.map((v: any) => `${v.id} x${v.nodes.length}: ${v.nodes[0].html.slice(0, 120)} ${v.nodes[0].failureSummary}`));
    expect(found).toEqual([]);
    await page.setViewportSize({ width: 375, height: 800 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  });
}

test('component pages lead with a live component that responds to its controls', async ({ page }) => {
  await page.goto('/iframe.html?id=components-actions-button--docs&viewMode=docs');
  const live = page.locator('.cha-button').first();
  await expect(live).toBeVisible();
  expect(await page.locator('details.sm-details').evaluate((d: HTMLDetailsElement) => d.open)).toBe(false);
  const before = await live.evaluate((e) => getComputedStyle(e).backgroundColor);
  await live.hover();
  await expect.poll(() => live.evaluate((e) => getComputedStyle(e).backgroundColor)).not.toBe(before);
  await page.getByRole('radio', { name: 'ghost' }).first().check({ force: true });
  await expect(live).toHaveClass(/cha-button--ghost/);
  await expect(page.locator('.cha-button').nth(1)).toBeVisible();
});
