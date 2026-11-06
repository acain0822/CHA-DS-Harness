#!/usr/bin/env node
/*
 * Downloads the icon SVGs that Figma's design context pointed at into
 * src/assets/icons. Run once after cloning: npm run fetch:figma-assets
 *
 * These URLs are temporary (Figma expires them after 7 days; these were issued
 * 2026-11-06). If they've expired, ask Claude to re-run the Figma extraction,
 * or export the icons from Figma by hand (Icons page) with the same file names.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'src/assets/icons');

const assets = {
  // Figma: Icons / Arrow Right (from Button, node 150:10511)
  'arrow-right.svg': 'https://www.figma.com/api/mcp/asset/aec6207d-6398-4bd9-a516-793fa2a95ed7.svg',
  // Figma: Icons / Arrow Left (from Button, node 150:10509)
  'arrow-left.svg': 'https://www.figma.com/api/mcp/asset/1416db62-e38c-486a-9468-432b8ddbc365.svg',
  // Figma: checkbox_icons/checked › check (from Checkbox, node 168:11276)
  'check.svg': 'https://www.figma.com/api/mcp/asset/2e0f5d94-fade-4ad0-aca0-bef03749c49b.svg',
};

await mkdir(out, { recursive: true });
let failed = 0;
for (const [name, url] of Object.entries(assets)) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.text();
    if (!body.includes('<svg')) throw new Error('response is not an SVG');
    await writeFile(join(out, name), body);
    console.log(`✓ ${name}`);
  } catch (err) {
    failed++;
    console.error(`✗ ${name}: ${err.message}`);
  }
}
if (failed) {
  console.error(`\n${failed} asset(s) failed. The links may have expired; see the note at the top of this file.`);
  process.exit(1);
}
