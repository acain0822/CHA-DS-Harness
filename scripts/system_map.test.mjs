import assert from 'node:assert';
import { test } from 'node:test';
import { buildMap, cascade, parseCss, readSelector } from './system_map.mjs';

const map = buildMap();
const comp = (n) => map.components.find((c) => c.name === n);
const row = (name, variant, state, part, prop) => comp(name).views
  .find((v) => v.state === state && Object.entries(variant).every(([k, x]) => v.variant[k] === x)).rows.find((r) => r.part === part && r.prop === prop);

test('variant props come from the component types', () => {
  assert.deepEqual(comp('Button').dims.map((d) => [d.prop, d.values.length]), [['variant', 4], ['size', 2]]);
  assert.equal(comp('Button').views.length, 4 * 2 * 5);
});

test('a variant value is traced through private variables to its token', () => {
  const r = row('Button', { variant: 'primary', size: 'large' }, 'default', 'cha-button', 'background');
  assert.equal(r.origin, 'variant');
  assert.equal(r.rule, '.cha-button--primary');
  assert.equal(r.chain[0].token, '--border-button-button-primary');
  assert.equal(r.chain[0].figma, 'Border/Button/button-primary');
  assert.equal(r.chain[0].value, '#ffb949');
});

test('base values stay base in every variant', () => {
  for (const v of ['primary', 'ghost']) {
    const r = row('Button', { variant: v, size: 'small' }, 'default', 'cha-button', 'border-radius');
    assert.equal(r.origin, 'base');
  }
});

test('states win over variants', () => {
  const r = row('Button', { variant: 'primary', size: 'large' }, 'hover', 'cha-button', 'background');
  assert.equal(r.origin, 'state');
  assert.equal(r.chain[0].token, '--white');
  assert.match(r.replaces, /button-primary/);
});

test('ghost padding wins over both sizes, as in the browser', () => {
  for (const size of ['large', 'small']) {
    assert.equal(row('Button', { variant: 'ghost', size }, 'default', 'cha-button', 'padding').rule, '.cha-button--ghost');
  }
});

test('responsive tokens show both values', () => {
  const r = row('Checkbox', {}, 'default', 'cha-checkbox__label', 'font-size');
  assert.deepEqual(r.chain.map((c) => [c.when, c.value]), [[null, '16px'], ['(min-width: 768px)', '18px']]);
});

test('raw values are marked and zero is not', () => {
  assert.equal(row('InputField', { error: 'off' }, 'default', 'cha-input__control', 'border-radius').raw, true);
  assert.equal(row('Button', { variant: 'primary', size: 'large' }, 'default', 'cha-button', 'border').raw, false);
});

test('a modifier on the parent reaches its part', () => {
  const r = row('InputField', { error: 'error' }, 'default', 'cha-input__control', 'border-color');
  assert.equal(r.origin, 'variant');
  assert.equal(r.chain[0].token, '--colors-secondary-colors-error');
});

test('no token reference is unresolved', () => {
  const bad = map.components.flatMap((c) => c.views.flatMap((v) => v.rows.flatMap((r) => r.chain.filter((x) => x.missing).map((x) => `${c.name} ${x.token}`))));
  assert.deepEqual([...new Set(bad)], []);
});

test('unmeasured usage is null, never zero', () => {
  for (const c of map.components) { assert.equal(c.usage.figma, null); if (!map.products.length) assert.equal(c.usage.code, null); }
});

test('selectors: :not excludes, and equal weight goes to the later rule', () => {
  assert.deepEqual(readSelector('.a:hover:not(:disabled)').not, ['disabled']);
  const rules = parseCss('.a{color:red}\n.a--x{color:blue}\n.a:hover:not(:disabled){color:green}').map((r) => ({ ...readSelector(r.head), decls: r.decls }));
  assert.equal(cascade(rules, ['x'], 'default').get('a|color').value, 'blue');
  assert.equal(cascade(rules, [], 'hover+disabled').get('a|color').value, 'red');
});
