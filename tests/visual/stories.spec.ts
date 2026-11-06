import { test, expect } from '@playwright/test';
import fs from 'node:fs';

/*
 * One screenshot per story per viewport, enumerated from Storybook's index.json,
 * so new stories are covered automatically. Tag a story '!vr' to skip it.
 */
type Entry = { id: string; type: 'story' | 'docs'; tags?: string[] };

const index = JSON.parse(fs.readFileSync('storybook-static/index.json', 'utf8'));
const stories = (Object.values(index.entries) as Entry[]).filter(
  (e) => e.type === 'story' && !e.tags?.includes('!vr'),
);

for (const story of stories) {
  test(story.id, async ({ page }) => {
    await page.goto(`/iframe.html?id=${story.id}&viewMode=story`);
    await page.waitForSelector('#storybook-root > *');
    await page.evaluate(() => document.fonts.ready);
    await page.addStyleTag({
      content: '*,*::before,*::after{transition:none!important;animation:none!important}',
    });
    // Wide matrices can exceed the viewport; grow the root so nothing is clipped.
    await page.evaluate(() => {
      const root = document.querySelector<HTMLElement>('#storybook-root')!;
      if (root.scrollWidth > root.clientWidth) root.style.width = 'max-content';
    });
    await expect(page.locator('#storybook-root')).toHaveScreenshot(`${story.id}.png`);
  });
}
