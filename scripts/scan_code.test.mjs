import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import { catalog, compareVersions, scan } from './scan_code.mjs';

const cat = await catalog();
let dir;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scan-')); });
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));
const put = (p, s) => { const f = path.join(dir, p); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
const run = () => scan(dir, cat);
const uses = (n) => run().components[n].uses;
const imp = `import { Button } from '${cat.pkg}';\n`;

test('counts each use, not each import', () => {
  put('a.tsx', `${imp}export const A = () => <><Button /><Button>x</Button></>;`);
  put('b.tsx', `${imp}export const B = 1;`);
  const r = run().components.Button;
  assert.deepEqual([r.uses, r.files], [2, 1]);
});

test("a product's own Button is not ours", () => {
  put('a.tsx', "import { Button } from './mine'; export const A = () => <Button />;");
  put('mine.tsx', 'export const Button = () => <button />;');
  assert.equal(uses('Button'), 0);
});

test('names in comments and text do not count', () => {
  put('a.tsx', `${imp}// <Button />\nexport const a = '<Button />';`);
  assert.equal(uses('Button'), 0);
});

test('follows renames, namespaces, require and createElement', () => {
  put('a.tsx', `import { Button as B } from '${cat.pkg}'; export const A = () => <B />;`);
  put('b.tsx', `import * as CHA from '${cat.pkg}'; export const A = () => <CHA.Button />;`);
  put('c.js', `const { Button: R } = require('${cat.pkg}'); module.exports = () => <R />;`);
  put('d.ts', `import { createElement } from 'react'; ${imp} export const d = createElement(Button, { variant: 'ghost' });`);
  put('types.d.ts', imp);
  const r = run().components.Button;
  assert.equal(r.uses, 4);
  assert.equal(r.props.variant.ghost, 1);
});

test('follows barrel files and path aliases', () => {
  put('tsconfig.json', '{"compilerOptions":{"baseUrl":".","paths":{"@/*":["./src/*"]}}}');
  put('src/ui/index.ts', `export { Button as CtaButton } from '${cat.pkg}'; export * from './more';`);
  put('src/ui/more.ts', `import { TextLink } from '${cat.pkg}'; export { TextLink };`);
  put('src/a.tsx', "import { CtaButton, TextLink } from '@/ui'; export const A = () => <><CtaButton /><TextLink href='#' /></>;");
  const r = run();
  assert.equal(r.components.Button.uses, 1);
  assert.equal(r.components.TextLink.uses, 1);
});

test('circular barrels do not hang', () => {
  put('a.ts', "export * from './b';");
  put('b.ts', "export * from './a';");
  put('c.tsx', "import { Button } from './a'; export const C = () => <Button />;");
  assert.equal(uses('Button'), 0);
});

test('separates set, default and unknown variants', () => {
  put('a.tsx', `${imp}export const A = (p: any) => <><Button variant="outline" /><Button variant={'ghost'} /><Button variant={p.v} /><Button /><Button {...p} /></>;`);
  assert.deepEqual(run().components.Button.props.variant, { outline: 1, ghost: 1, '(set in code)': 2, '(default)': 1 });
});

test('text written by the product is never saved', () => {
  put('a.tsx', `import { Button, InputField } from '${cat.pkg}'; export const A = () => <><InputField error="SSN is wrong" /><Button variant="made-up" /></>;`);
  const r = run();
  assert.deepEqual(r.components.InputField.props.error, { on: 1 });
  assert.deepEqual(r.components.Button.props.variant, { '(unknown value)': 1 });
  assert.ok(!/SSN|made-up/.test(JSON.stringify({ ...r, details: [] })));
});

test('tests, stories, dependencies and builds are not product use', () => {
  put('a.test.tsx', `${imp}export const A = () => <Button />;`);
  put('a.stories.tsx', `${imp}export const A = () => <Button />;`);
  put('node_modules/x/a.tsx', `${imp}export const A = () => <Button />;`);
  put('.next/a.js', `${imp}export const A = () => <Button />;`);
  const r = run().components.Button;
  assert.deepEqual([r.uses, r.tests], [0, 2]);
});

test('reports restyling, class names, CSS rules and token overrides', () => {
  put('a.tsx', `${imp}export const A = () => <><Button className="big" /><a className="cha-button cha-button--primary">x</a></>;`);
  put('p.html', '<button class="cha-button">x</button>');
  put('s.css', ':root { --white: #fefefe; }\n.mine { color: var(--ada); }\n.page .cha-button:hover { color: red; }\n.cha-buttonish { color: red; }');
  const r = run();
  const b = r.components.Button;
  assert.deepEqual([b.uses, b.restyled, b.byClass, b.cssRules], [1, 1, 2, 1]);
  assert.deepEqual(r.tokens, { used: { '--ada': 1 }, overridden: { '--white': 1 } });
});

test('a copied stylesheet is called out, not counted as overrides', () => {
  put('copy.css', `:root {${[...cat.tokens].map((t) => `${t}: 1px;`).join('')}}`);
  const r = run();
  assert.deepEqual(r.tokens.overridden, {});
  assert.match(r.notes.join(), /copy of the package/);
});

test('says what it could not see', () => {
  put('a.ts', `export const a = () => import('${cat.pkg}');`);
  put('a.vue', `<script>import { Button } from '${cat.pkg}'</script>`);
  put('package.json', JSON.stringify({ dependencies: { [cat.pkg]: '^0.1.0' } }));
  const n = run().notes.join(' ');
  for (const m of [/dynamic import/, /\.vue files/, /version is unknown/]) assert.match(n, m);
});

test('reads the installed version, not the requested range', () => {
  put('package.json', JSON.stringify({ dependencies: { [cat.pkg]: '^0.1.0' } }));
  put(`node_modules/${cat.pkg}/package.json`, '{"version":"0.1.7"}');
  assert.equal(run().version, '0.1.7');
  assert.ok(compareVersions('0.9.0', '0.10.0') < 0);
});

test('broken files do not stop the scan', () => {
  put('bad.tsx', 'export const = <<<');
  put('a.tsx', `${imp}export const A = () => <Button />;`);
  assert.equal(uses('Button'), 1);
});

test('saved results hold no file names', () => {
  put('secret-project/a.tsx', `${imp}export const A = () => <Button />;`);
  const { details, ...saved } = run();
  assert.ok(details[0].includes('secret-project'));
  assert.ok(!JSON.stringify(saved).includes('secret-project'));
});
