#!/usr/bin/env node
/*
 * CHA design harness. Keeps design context attached to the work and logs
 * everything that didn't pass or wasn't approved.
 *
 *   context <Component>   Print the full design context for a component
 *   check [--no-write] [--skip-typecheck]
 *                         Run the checks, update the log and report
 *   review <id|Component> approved|rejected --by <name> [--note <text>]
 *                         Record a person's decision
 *   record <type> <Component> <message>
 *                         Log something found by hand or by another tool
 *   hook                  Claude Code PreToolUse hook (reads JSON on stdin)
 *
 * Settings live in design-system/harness.config.json. Design context comes from
 * the Figma MCP's get_design_context and is saved per the figma-storybook skill.
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const at = (...p) => path.join(ROOT, ...p);
const LOG = at('design-system/reports/harness-log.jsonl');
const REPORT = at('design-system/reports/harness-log.md');
const BUILT = new Set(['built', 'verified', 'baselined', 'stale']);
const MANUAL_TYPES = new Set(['review', 'manual', 'a11y', 'visual']);

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const config = () => readJson(at('design-system/harness.config.json'));
const manifest = () => readJson(at('design-system/manifest.json'));
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '').replace(/s$/, '');
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
const idFor = (s) => createHash('sha1').update(s).digest('hex').slice(0, 8);

function findComponent(name, m = manifest()) {
  const n = norm(name);
  const live = m.components.filter((c) => c.status !== 'superseded');
  return (
    live.find((c) => c.codePath && norm(path.basename(c.codePath)) === n) ??
    live.find((c) => norm(c.name) === n)
  );
}

/* A component has full context when all three saved Figma outputs exist. */
function contextFor(c) {
  const dash = (c.figmaNodeId ?? '').replace(':', '-');
  const dir = at('design-system/figma/context');
  const saved = fs.existsSync(dir)
    ? fs.readdirSync(dir).find((f) =>
        fs.readFileSync(path.join(dir, f), 'utf8').split('\n', 1)[0].includes(`figma-node: ${c.figmaNodeId}`),
      )
    : undefined;
  const parts = {
    designContext: saved ? `design-system/figma/context/${saved}` : null,
    screenshot: `design-system/figma/screens/${dash}.png`,
    variables: `design-system/figma/variables/${dash}.json`,
  };
  for (const k of ['screenshot', 'variables']) if (!fs.existsSync(at(parts[k]))) parts[k] = null;
  const have = Object.values(parts).filter(Boolean).length;
  const state = c.status === 'stale' ? 'stale' : have === 3 ? 'complete' : have ? 'partial' : 'missing';
  return { state, parts, missing: Object.keys(parts).filter((k) => !parts[k]) };
}

function tokensUsed(c) {
  if (!c.codePath || !fs.existsSync(at(c.codePath))) return [];
  const css = fs.readdirSync(at(c.codePath)).filter((f) => f.endsWith('.css'));
  const text = css.map((f) => fs.readFileSync(at(c.codePath, f), 'utf8')).join('\n');
  return [...new Set([...text.matchAll(/var\((--[a-z0-9-]+)/gi)].map((x) => x[1]))]
    .filter((t) => !t.startsWith('--_'))
    .sort();
}

/* ---------- the log: append-only events, replayed into current state ---------- */

function events() {
  if (!fs.existsSync(LOG)) return [];
  return fs.readFileSync(LOG, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

function state(evts = events()) {
  const items = new Map();
  for (const e of evts) {
    if (e.event === 'opened') items.set(e.id, { ...e, status: 'open', decisions: [] });
    const item = items.get(e.id);
    if (!item) continue;
    if (e.event === 'resolved') item.status = 'resolved';
    if (e.event === 'reviewed') {
      item.decisions.push(e);
      item.status = e.decision === 'approved' ? 'approved' : 'rejected';
    }
  }
  return items;
}

function append(newEvents) {
  if (!newEvents.length) return;
  fs.mkdirSync(path.dirname(LOG), { recursive: true });
  fs.appendFileSync(LOG, newEvents.map((e) => JSON.stringify(e)).join('\n') + '\n');
}

const openEvent = (f) => ({ ts: new Date().toISOString(), event: 'opened', ...f });

/* ---------- checks ---------- */

function contextFindings(m, cfg) {
  const severity = cfg.contextEnforcement === 'block' ? 'error' : 'warn';
  const tracked = m.components.filter((c) => BUILT.has(c.status)).flatMap((c) => {
    const ctx = contextFor(c);
    if (ctx.state === 'complete') return [];
    return [{
      id: idFor(`context|${c.name}`), type: 'context', severity, component: c.name,
      message: ctx.state === 'stale'
        ? 'Figma changed since this was built; re-read design context.'
        : `Built without full saved design context (missing: ${ctx.missing.join(', ')}).`,
    }];
  });
  const untracked = fs.readdirSync(at('src/components'))
    .filter((dir) => !cfg.internalComponents?.includes(dir) && !findComponent(dir, m))
    .map((dir) => ({
      id: idFor(`context|${dir}`), type: 'context', severity, component: dir,
      message: 'Code exists but the component is not in the manifest, so it has no link to Figma.',
    }));
  return [...tracked, ...untracked];
}

const TOKEN_PROPS = /^(padding|margin|gap|row-gap|column-gap|border-radius|font-size|line-height|letter-spacing)/;

function tokenFindings(cfg) {
  const out = new Map();
  const base = at('src/components');
  for (const dir of fs.readdirSync(base)) {
    for (const f of fs.readdirSync(path.join(base, dir)).filter((x) => x.endsWith('.css'))) {
      const file = `src/components/${dir}/${f}`;
      const raw = fs.readFileSync(at(file), 'utf8');
      const code = raw.replace(/\/\*[\s\S]*?\*\//g, (s) => s.replace(/[^\n]/g, ' ')).split('\n');
      const lines = raw.split('\n');
      code.forEach((line, i) => {
        const decl = line.match(/^\s*([a-z-]+)\s*:\s*(.+?);?\s*$/i);
        if (!decl) return;
        const [, prop, value] = decl;
        if (lines[i].includes('token audit') || lines[i - 1]?.includes('token audit')) return;
        let bare = value;
        while (/var\([^()]*\)/.test(bare)) bare = bare.replace(/var\([^()]*\)/g, '');
        const color = /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i.test(bare);
        const size = TOKEN_PROPS.test(prop) && /(^|[\s(])(?!0(px|rem)?\b)[\d.]+(px|rem)\b/.test(bare);
        if (!color && !size) return;
        const id = idFor(`token|${file}|${prop}|${value}`);
        out.set(id, {
          id, type: 'token', severity: cfg.severity?.token ?? 'warn', component: dir, file: `${file}:${i + 1}`,
          message: `Raw value in ${prop}: ${value}. Use a token, or add a "token audit: no variable" comment if Figma has none.`,
        });
      });
    }
  }
  return [...out.values()];
}

function storyFindings(cfg) {
  const base = at('src/components');
  return fs.readdirSync(base).flatMap((dir) => {
    if (cfg.internalComponents?.includes(dir)) return [];
    const stories = path.join(base, dir, `${dir}.stories.tsx`);
    const ok = fs.existsSync(stories) && /export const AllVariants\b/.test(fs.readFileSync(stories, 'utf8'));
    return ok ? [] : [{
      id: idFor(`story|${dir}`), type: 'story', severity: 'error', component: dir,
      message: 'No AllVariants story, so it has no main visual test.',
    }];
  });
}

function typeFindings() {
  const tsc = at('node_modules/typescript/bin/tsc');
  const r = spawnSync(process.execPath, [tsc, '--noEmit', '-p', ROOT], { cwd: ROOT, encoding: 'utf8' });
  return (r.stdout ?? '').split('\n').flatMap((l) => {
    const e = l.match(/^(.+?)\((\d+),\d+\): error (TS\d+): (.*)$/);
    return e ? [{
      id: idFor(`type|${e[1]}|${e[3]}|${e[4]}`), type: 'typecheck', severity: 'error', component: '-',
      file: `${e[1]}:${e[2]}`, message: `${e[3]}: ${e[4]}`,
    }] : [];
  });
}

const QUESTION = /needs|review|assumed|no .*(design|size|state)|only (one|designed|exists)|typo|placeholder|rename|outside the documented/i;

function questionFindings(m) {
  const fromComponents = m.components
    .filter((c) => BUILT.has(c.status) || c.status === 'blocked')
    .flatMap((c) => (c.notes ?? []).filter((n) => QUESTION.test(n)).map((n) => ({ component: c.name, note: n })));
  const fileWide = (m.fileWideNotes ?? []).map((n) => ({ component: 'File-wide', note: n }));
  return [...fromComponents, ...fileWide].map(({ component, note }) => ({
    id: idFor(`question|${component}|${note}`), type: 'design-question', severity: 'info', component, message: note,
  }));
}

function syncFindings(cfg) {
  return cfg.figmaSync === 'active' ? [] : [{
    id: idFor('sync|paused'), type: 'sync', severity: 'warn', component: 'File-wide',
    message: `Figma sync check is paused: ${cfg.figmaSyncNote}`,
  }];
}

function check(flags) {
  const cfg = config();
  const m = manifest();
  const found = [
    ...syncFindings(cfg),
    ...contextFindings(m, cfg),
    ...tokenFindings(cfg),
    ...storyFindings(cfg),
    ...(flags.has('--skip-typecheck') ? [] : typeFindings()),
    ...questionFindings(m),
  ];

  const current = state();
  const foundIds = new Set(found.map((f) => f.id));
  const now = new Date().toISOString();
  const updates = [];
  for (const f of found) {
    const known = current.get(f.id);
    if (!known || known.status === 'resolved') updates.push(openEvent(f));
  }
  for (const item of current.values()) {
    const live = item.status === 'open' || item.status === 'rejected';
    const skipped = item.type === 'typecheck' && flags.has('--skip-typecheck');
    if (live && !MANUAL_TYPES.has(item.type) && !foundIds.has(item.id) && !skipped) {
      updates.push({ ts: now, event: 'resolved', id: item.id });
    }
  }

  if (!flags.has('--no-write')) {
    append(updates);
    writeReport(m, cfg);
  }

  const after = state([...events(), ...(flags.has('--no-write') ? updates : [])]);
  const open = [...after.values()].filter((i) => i.status === 'open' || i.status === 'rejected');
  // The config can change after an item was logged, so today's severity wins.
  const severityNow = new Map(found.map((f) => [f.id, f.severity]));
  for (const i of open) i.severity = severityNow.get(i.id) ?? i.severity;
  const count = (s) => open.filter((i) => i.severity === s).length;
  console.log(`Harness check: ${count('error')} errors, ${count('warn')} warnings, ${count('info')} open questions.`);
  console.log(`Context enforcement: ${cfg.contextEnforcement}. New or changed since last run: ${updates.length}.`);
  for (const i of open.filter((x) => x.severity === 'error')) {
    console.log(`  x [${i.id}] ${i.type} ${i.component}: ${i.message}`);
  }
  return count('error') ? 1 : 0;
}

/* ---------- report ---------- */

function writeReport(m, cfg) {
  const items = [...state().values()];
  const open = items.filter((i) => i.status === 'open' || i.status === 'rejected');
  const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
  const built = m.components.filter((c) => BUILT.has(c.status));
  const complete = built.filter((c) => contextFor(c).state === 'complete').length;
  const titles = {
    review: 'Rejected in review', typecheck: 'Type errors', story: 'Missing stories', visual: 'Visual test failures',
    a11y: 'Accessibility failures', context: 'Missing design context', sync: 'Figma sync', token: 'Raw values in code',
    manual: 'Logged by hand', 'design-question': 'Open design questions',
  };
  const lines = [
    '# Harness log',
    '',
    'Everything that failed a check or hasn\'t been approved. Generated by `npm run harness:check`; don\'t edit by hand. The full history is in `harness-log.jsonl`.',
    '',
    `- **Context enforcement:** ${cfg.contextEnforcement}`,
    `- **Figma sync:** ${cfg.figmaSync}`,
    `- **Built components with full design context:** ${complete} of ${built.length}`,
    `- **Open items:** ${open.length}`,
    `- **Approved exceptions:** ${items.filter((i) => i.status === 'approved').length}`,
    `- **Resolved:** ${items.filter((i) => i.status === 'resolved').length}`,
    '',
  ];
  for (const [type, title] of Object.entries(titles)) {
    const group = open.filter((i) => i.type === type);
    if (!group.length) continue;
    lines.push(`## ${title} (${group.length})`, '', '| ID | Component | Issue | Where | Status |', '|---|---|---|---|---|');
    for (const i of group) {
      const last = i.decisions.at(-1);
      const status = last ? `rejected by ${last.by}${last.note ? `: ${last.note}` : ''}` : 'open';
      lines.push(`| \`${i.id}\` | ${cell(i.component)} | ${cell(i.message)} | ${cell(i.file ?? '')} | ${cell(status)} |`);
    }
    lines.push('');
  }
  fs.mkdirSync(path.dirname(REPORT), { recursive: true });
  fs.writeFileSync(REPORT, lines.join('\n'));
}

/* ---------- commands ---------- */

function printContext(name) {
  const m = manifest();
  const c = findComponent(name, m);
  if (!c) {
    console.log(`"${name}" isn't in the manifest. Inventory it from Figma before building.`);
    return 1;
  }
  const ctx = contextFor(c);
  const open = [...state().values()].filter((i) =>
    (i.status === 'open' || i.status === 'rejected') && norm(i.component) === norm(c.name));
  const out = [
    `# ${c.name}`,
    `Context: ${ctx.state}${ctx.missing.length ? ` (missing: ${ctx.missing.join(', ')})` : ''}`,
    `Status: ${c.status}   Category: ${c.category ?? '-'}   Variants: ${c.variantCount ?? '-'}`,
    `Figma: ${c.figmaUrl ?? '-'}`,
    `Node: ${c.figmaNodeId ?? '-'}`,
    `Code: ${c.codePath ?? 'not built'}`,
    `Properties: ${JSON.stringify(c.properties ?? [])}`,
    `Depends on: ${(c.dependsOn ?? []).join(', ') || '-'}`,
    '',
    'Saved Figma context:',
    ...Object.entries(ctx.parts).map(([k, v]) => `  ${k}: ${v ?? 'MISSING'}`),
    '',
    `Tokens used: ${tokensUsed(c).join(' ') || '-'}`,
    '',
    'Notes:',
    ...(c.notes?.length ? c.notes.map((n) => `  - ${n}`) : ['  -']),
    '',
    `Open log items: ${open.length}`,
    ...open.map((i) => `  - [${i.id}] ${i.type}: ${i.message}`),
  ];
  if (ctx.state !== 'complete') {
    out.push('', `To complete: run get_design_context, get_screenshot and get_variable_defs on node ${c.figmaNodeId}, then save them as the figma-storybook skill describes.`);
  }
  console.log(out.join('\n'));
  return 0;
}

function resolveTarget(target) {
  const items = [...state().values()];
  return items.filter((i) => i.id.startsWith(target) && i.status !== 'resolved');
}

function review(args) {
  const [target, decision] = args;
  const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
  const by = opt('--by');
  const note = opt('--note');
  if (!target || !['approved', 'rejected'].includes(decision) || !by) {
    console.log('Usage: harness review <id|Component> approved|rejected --by <name> [--note <text>]');
    return 1;
  }
  const now = new Date().toISOString();
  const matches = resolveTarget(target);
  const evts = [];
  if (matches.length === 1) {
    evts.push({ ts: now, event: 'reviewed', id: matches[0].id, decision, by, note });
  } else if (matches.length > 1) {
    console.log(`"${target}" matches ${matches.length} items. Use a longer ID.`);
    return 1;
  } else if (decision === 'rejected') {
    const id = idFor(`review|${target}|${now}`);
    evts.push(openEvent({ id, type: 'review', severity: 'error', component: target, message: note ?? 'Rejected in review.' }));
    evts.push({ ts: now, event: 'reviewed', id, decision, by, note });
  } else {
    console.log(`No open log item matches "${target}".`);
    return 1;
  }
  append(evts);
  writeReport(manifest(), config());
  console.log(`Recorded: ${target} ${decision} by ${by}.`);
  return 0;
}

function record([type, component, ...rest]) {
  const message = rest.join(' ');
  if (!type || !component || !message) {
    console.log('Usage: harness record <a11y|visual|manual> <Component> <message>');
    return 1;
  }
  const safe = MANUAL_TYPES.has(type) ? type : 'manual';
  const id = idFor(`${safe}|${component}|${message}`);
  const known = state().get(id);
  if (!known || known.status === 'resolved') {
    // Failed tests are errors; notes logged by hand shouldn't fail pull requests.
    const severity = safe === 'manual' ? 'warn' : 'error';
    append([openEvent({ id, type: safe, severity, component, message })]);
    writeReport(manifest(), config());
  }
  console.log(`Logged [${id}] ${safe} ${component}.`);
  return 0;
}

function hook() {
  let input = {};
  try { input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch { return 0; }
  const file = input.tool_input?.file_path;
  if (!file) return 0;
  const inside = rel(path.resolve(ROOT, file)).match(/^src\/components\/([^/]+)\//);
  if (!inside) return 0;

  const cfg = config();
  const dir = inside[1];
  if (cfg.internalComponents?.includes(dir)) return 0;
  const c = findComponent(dir);
  const ctx = c ? contextFor(c) : { state: 'missing', missing: ['manifest entry'] };
  const pointer = `Run \`npm run harness -- context ${dir}\` for the full design context.`;

  if (ctx.state === 'complete') {
    console.log(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        additionalContext: `Design context for ${c.name} is complete: ${ctx.parts.designContext}. Read it before editing. ${pointer}`,
      },
    }));
    return 0;
  }

  const name = c?.name ?? dir;
  const message = `${name} has ${ctx.state} design context (missing: ${ctx.missing.join(', ')}).`;
  const id = idFor(`context|${name}`);
  const known = state().get(id);
  if (!known || known.status === 'resolved') {
    append([openEvent({
      id, type: 'context', severity: cfg.contextEnforcement === 'block' ? 'error' : 'warn', component: name,
      message: `Edited without full saved design context (missing: ${ctx.missing.join(', ')}).`,
    })]);
  }

  if (cfg.contextEnforcement === 'block') {
    console.log(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: `${message} Blocked by the design harness. Read the design with get_design_context and save it first. ${pointer}`,
      },
    }));
    return 0;
  }
  console.log(JSON.stringify({
    systemMessage: `Design harness: ${message}`,
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      additionalContext: `${message} Don't invent design details; flag gaps and record them in the manifest notes. ${pointer}`,
    },
  }));
  return 0;
}

const [cmd, ...args] = process.argv.slice(2);
const commands = {
  context: () => printContext(args.join(' ')),
  check: () => check(new Set(args)),
  review: () => review(args),
  record: () => record(args),
  hook,
};
if (!commands[cmd]) {
  console.log('Usage: harness context|check|review|record|hook');
  process.exit(1);
}
process.exit(commands[cmd]());
