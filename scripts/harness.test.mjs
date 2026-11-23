// Run with: npm run test:harness. Works on a throwaway copy, so the real log is never touched.
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let dir;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-'));
  for (const p of ['scripts/harness.mjs', 'design-system', 'src', 'tsconfig.json']) {
    fs.cpSync(path.join(ROOT, p), path.join(dir, p), { recursive: true });
  }
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const run = (args, input = '') => spawnSync(process.execPath, ['scripts/harness.mjs', ...args], { cwd: dir, input, encoding: 'utf8' });
const at = (p) => path.join(dir, p);
const log = () => fs.readFileSync(at('design-system/reports/harness-log.jsonl'), 'utf8');
const css = 'src/components/Button/Button.css';

test('a type check that could not run is an error', () => {
  const r = run(['check', '--no-write']);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /Type check could not run/);
});

test('finds raw values on one line, named colors and inline styles', () => {
  fs.appendFileSync(at(css), '\n.y { padding: 17px; color: #f00 }\n.z { color: red; }\n');
  const tsx = at('src/components/Button/Button.tsx');
  fs.writeFileSync(tsx, fs.readFileSync(tsx, 'utf8').replace('<button', "<button style={{ color: '#ff00ff' }}"));
  run(['check', '--skip-typecheck']);
  for (const m of ['padding: 17px', 'color: #f00', 'color: red', 'inline color: #ff00ff']) assert.ok(log().includes(`Raw value in ${m}`), m);
});

test('allows tokens and documented exceptions', () => {
  // The saved log may be behind the code, so bring the copy up to date first.
  run(['check', '--skip-typecheck']);
  const before = log();
  fs.appendFileSync(at(css), '\n.a { color: var(--any-red); gap: 0 }\n/* token audit: no variable */\n.b { padding: 17px }\n');
  run(['check', '--skip-typecheck']);
  assert.equal(log(), before);
});

test('the hook understands other path names and warns when there is none', () => {
  const r = run(['hook'], JSON.stringify({ toolCall: { args: { TargetFile: at(css) } } }));
  assert.match(r.stdout, /design context/);
  assert.match(run(['hook'], '{"toolCall":{}}').stderr, /was not checked/);
});

test('resolve closes hand-logged items, names who did it, and refuses automatic ones', () => {
  const id = run(['record', 'a11y', 'Button', 'Test item']).stdout.match(/\[(\w+)\]/)[1];
  assert.equal(run(['check', '--skip-typecheck', '--no-write']).status, 1);
  assert.equal(run(['resolve', id]).status, 1);
  assert.equal(run(['resolve', id, '--by', 'Tester']).status, 0);
  assert.equal(run(['check', '--skip-typecheck', '--no-write']).status, 0);
  assert.equal(run(['resolve', '434f1a3a', '--by', 'Tester']).status, 1);
});
