#!/usr/bin/env node
/*
 * Where every component property comes from: base, variant or state rule, then
 * token, then value. Read straight from the code, so it can't drift from it.
 * Storybook builds this live; `npm run system:map` prints it as JSON.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '').replace(/s$/, '');
const VAR = /var\(\s*(--[\w-]+)\s*\)/g;
const STATES = { hover: 'hover', active: 'active', focus: 'focus', 'focus-visible': 'focus', 'focus-within': 'focus', disabled: 'disabled', checked: 'checked' };

/* Rules in order, with any media query. Comments are blanked so line numbers hold. */
export function parseCss(text) {
  const src = text.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));
  const rules = [];
  const walk = (from, to, media) => {
    let i = from;
    while (i < to) {
      const open = src.indexOf('{', i);
      if (open < 0 || open >= to) return;
      let depth = 1;
      let j = open + 1;
      for (; j < to && depth; j++) depth += src[j] === '{' ? 1 : src[j] === '}' ? -1 : 0;
      const head = src.slice(i, open).trim();
      const start = i + src.slice(i, open).search(/\S/);
      if (/^@media/.test(head)) walk(open + 1, j - 1, head.replace(/^@media\s*/, ''));
      else if (!head.startsWith('@')) {
        const decls = src.slice(open + 1, j - 1).split(';').map((d) => d.match(/^\s*(--[\w-]+|[a-z-]+)\s*:\s*([\s\S]+)$/i))
          .filter(Boolean).map((m) => [m[1], m[2].trim().replace(/\s+/g, ' ')]);
        rules.push({ head, media, decls, line: src.slice(0, start).split('\n').length });
      }
      i = j;
    }
  };
  walk(0, src.length, null);
  return rules;
}

function splitSelectors(s) {
  const out = [''];
  let depth = 0;
  for (const c of s) {
    if (c === '(') depth++;
    if (c === ')') depth--;
    if (c === ',' && !depth) out.push(''); else out[out.length - 1] += c;
  }
  return out.map((x) => x.trim());
}

export function readSelector(sel) {
  const not = [...sel.matchAll(/:not\(([^()]*)\)/g)].map((m) => m[1]);
  const positive = sel.replace(/:not\([^()]*\)/g, '');
  const states = (s) => [...new Set([
    ...[...s.matchAll(/(?<!:):([a-z-]+)/g)].map((m) => STATES[m[1]]).filter(Boolean),
    ...(/\[aria-disabled/.test(s) ? ['disabled'] : []),
  ])];
  const classes = [...positive.replace(/:has\([^()]*\)/g, '').matchAll(/\.([\w-]+)/g)].map((m) => m[1]);
  const pseudo = positive.match(/::([\w-]+)/)?.[0] ?? '';
  const parts = classes.filter((c) => !c.replace(/^cha-/, '').includes('--'));
  const last = positive.trim().split(/[\s>+~]+/).at(-1);
  const subject = [...last.matchAll(/\.([\w-]+)/g)].map((m) => m[1].replace(/--[\w-]+$/, ''))[0] ?? parts.at(-1);
  return {
    subject: subject ? subject + pseudo : null,
    mods: classes.filter((c) => c.replace(/^cha-/, '').includes('--')).map((c) => c.slice(c.indexOf('--') + 2)),
    states: states(positive), not: not.flatMap(states),
    spec: (sel.match(/\.[\w-]+|\[[^\]]+\]|(?<!:):(?!not|has)[a-z-]+/g) ?? []).length,
  };
}

/* Variant props from the component: `cha-x--${prop}` with a union type, plus on/off modifiers in the CSS. */
export function dimensions(tsx, mods) {
  const dims = [];
  for (const [, prop] of tsx.matchAll(/--\$\{(\w+)\}/g)) {
    const type = tsx.match(new RegExp(`\\b${prop}\\??:\\s*(\\w+)`))?.[1];
    const union = tsx.match(new RegExp(`type ${type}\\s*=([^;]+);`))?.[1] ?? '';
    const values = [...union.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    if (values.length) dims.push({ prop, values });
  }
  const known = new Set(dims.flatMap((d) => d.values));
  for (const m of mods) if (!known.has(m)) dims.push({ prop: m, values: ['off', m] });
  return dims;
}

const combos = (dims) => dims.reduce((acc, d) => acc.flatMap((c) => d.values.map((v) => ({ ...c, [d.prop]: v }))), [{}]);

export function cascade(rules, mods, state) {
  const on = new Set(state === 'default' ? [] : state.split('+'));
  const win = new Map();
  for (const r of rules) {
    if (!r.mods.every((m) => mods.includes(m)) || !r.states.every((s) => on.has(s)) || r.not.some((s) => on.has(s))) continue;
    for (const [prop, value] of r.decls) {
      const k = `${r.subject}|${prop}`;
      const prev = win.get(k);
      if (!prev || r.spec >= prev.spec) win.set(k, { part: r.subject, prop, value, spec: r.spec, rule: r, over: prev });
    }
  }
  return win;
}

const origin = (r) => (r.states.length ? 'state' : r.mods.length ? 'variant' : 'base');
const bareValue = (v) => {
  let s = v;
  while (VAR.test(s)) s = s.replace(VAR, '');
  VAR.lastIndex = 0;
  return s;
};
const rawIn = (v) => /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|(^|[\s(,])-?(?!0(px|rem|em)?\b)[\d.]+(px|rem|em)\b/i.test(bareValue(v));

export function buildMap(root = HERE) {
  const at = (...p) => path.join(root, ...p);
  const read = (p) => fs.readFileSync(at(p), 'utf8');
  const json = (p) => JSON.parse(read(p));
  const manifest = json('design-system/manifest.json');
  const figma = new Map(Object.keys(json('design-system/tokens.figma.json')).map((k) => [
    '--' + k.split('/').map((p) => p.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')).join('-'), k]));

  const tokens = new Map();
  for (const file of ['src/tokens/tokens.css', 'src/styles/responsive.css']) {
    for (const r of parseCss(read(file))) for (const [k, value] of r.decls) {
      if (!k.startsWith('--')) continue;
      if (!tokens.has(k)) tokens.set(k, { name: k, figma: figma.get(k) ?? null, file, values: [], usedBy: [] });
      tokens.get(k).values.push({ value, when: r.media });
    }
  }
  const chain = (name, seen = []) => {
    const t = tokens.get(name);
    if (!t || seen.includes(name)) return [{ token: name, missing: true }];
    return t.values.flatMap((v) => {
      const next = v.value.match(/^var\((--[\w-]+)\)$/)?.[1];
      const me = { token: name, figma: t.figma, when: v.when, value: next ? null : v.value };
      return next ? chain(next, [...seen, name]).map((c) => ({ ...c, when: v.when ?? c.when, via: [name, ...(c.via ?? [])] })) : [me];
    });
  };

  const usageFile = at('design-system/reports/usage-live.json');
  const usage = fs.existsSync(usageFile) ? JSON.parse(fs.readFileSync(usageFile, 'utf8')) : null;

  const codeFile = at('design-system/reports/usage-code.json');
  const products = fs.existsSync(codeFile) ? JSON.parse(fs.readFileSync(codeFile, 'utf8')).products : [];
  const newest = json('design-system/package.config.json').version;

  const components = fs.readdirSync(at('src/components')).filter((d) => fs.existsSync(at(`src/components/${d}/${d}.css`))).map((dir) => {
    const cssPath = `src/components/${dir}/${dir}.css`;
    const tsx = read(`src/components/${dir}/${dir}.tsx`);
    const rules = parseCss(read(cssPath)).flatMap((r) => splitSelectors(r.head).map((sel) => ({ ...readSelector(sel), sel, media: r.media, decls: r.decls, line: r.line })))
      .filter((r) => r.subject && !r.subject.includes('visually-hidden'));
    const dims = dimensions(tsx, [...new Set(rules.flatMap((r) => r.mods))]);
    const states = ['default', ...['hover', 'focus', 'active', 'disabled', 'checked'].filter((s) => rules.some((r) => r.states.includes(s)))];
    if (rules.some((r) => r.states.includes('checked') && r.states.includes('disabled'))) states.push('disabled+checked');
    const views = combos(dims).flatMap((c) => states.map((state) => {
      const win = cascade(rules, Object.values(c).filter((v) => v !== 'off'), state);
      const rows = [...win.values()].filter((w) => !w.prop.startsWith('--_')).map((w) => {
        const trail = [w];
        const expand = (value, depth = 0) => value.replace(/var\(\s*(--_[\w-]+)\s*\)/g, (m, k) => {
          const p = win.get(`${w.part}|${k}`) ?? win.get(`cha-${norm(dir)}|${k}`);
          if (!p || depth > 5) return m;
          trail.push(p);
          return expand(p.value, depth + 1);
        });
        const value = expand(w.value);
        // The rule that most specifically decided the value, following private variables.
        const decided = trail.reduce((a, b) => (b.rule.spec >= a.rule.spec ? b : a));
        const names = [...new Set([...value.matchAll(VAR)].map((m) => m[1]))];
        return {
          part: w.part, prop: w.prop, value, origin: origin(decided.rule), rule: decided.rule.sel, where: `${cssPath}:${decided.rule.line}`,
          replaces: decided.over ? decided.over.value : null,
          chain: names.flatMap((n) => (!tokens.has(n) && tsx.includes(`'${n}'`) ? [{ token: n, runtime: true }] : chain(n))), raw: rawIn(value),
        };
      });
      return { variant: c, state, rows };
    }));
    for (const v of views) for (const r of v.rows) for (const name of new Set(r.chain.flatMap((c) => [c.token, ...(c.via ?? [])]))) {
      const label = `${dir}${Object.values(v.variant).filter((x) => x !== 'off').length ? ` / ${Object.values(v.variant).filter((x) => x !== 'off').join(', ')}` : ''}`;
      const t = tokens.get(name);
      if (t && !t.usedBy.includes(label)) t.usedBy.push(label);
    }
    const m = manifest.components.find((c) => c.codePath === `src/components/${dir}` && c.status !== 'superseded');
    const u = usage?.components.find((c) => c.name === m?.name);
    const uses = [...new Set([...tsx.matchAll(/from '\.\.\/(\w+)\//g)].map((x) => x[1]))];
    return {
      name: dir, label: m?.name ?? dir, internal: !m, figmaUrl: m?.figmaUrl ?? null, figmaNodeId: m?.figmaNodeId ?? null,
      codePath: `src/components/${dir}`, status: m?.status ?? 'internal', notes: m?.notes ?? [], dims, states, uses, views,
      usage: {
        live: u?.live?.status === 'measured' ? { pages: u.live.pages, of: usage.live.pagesMeasured, ...u.live.instances } : null,
        figma: null,
        // Null until a product is scanned, and for components not in the package.
        code: products.some((p) => p.components[dir]) ? products.filter((p) => p.components[dir]).map((p) => ({ product: p.name, scanned: p.scanned, version: p.version, ...p.components[dir] })) : null,
      },
      issues: u?.openIssues ?? [],
    };
  });
  for (const c of components) c.usedBy = components.filter((x) => x.uses.includes(c.name)).map((x) => x.name);

  const byValue = new Map();
  for (const t of tokens.values()) if (t.values.length === 1 && /^#/.test(t.values[0].value)) {
    const v = t.values[0].value.toLowerCase();
    byValue.set(v, [...(byValue.get(v) ?? []), t.name]);
  }
  return {
    components,
    tokens: [...tokens.values()],
    sameValue: [...byValue].filter(([, n]) => n.length > 1).map(([value, names]) => ({ value, names })),
    figmaLinksRecorded: [...tokens.values()].some((t) => t.file === 'src/tokens/tokens.css' && t.values.some((v) => v.value.includes('var('))),
    notBuilt: manifest.components.filter((c) => c.status !== 'superseded' && !components.some((x) => x.label === c.name))
      .map((c) => ({ name: c.name, category: c.category, live: usage?.components.find((u) => u.name === c.name)?.live ?? null })),
    newest,
    products: products.map((p) => ({ name: p.name, scanned: p.scanned, version: p.version, notes: p.notes, tokensUsed: Object.keys(p.tokens.used).length, overridden: Object.keys(p.tokens.overridden) })),
    livePages: usage?.live.pagesMeasured ?? 0,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  console.log(JSON.stringify(buildMap(), null, 1));
}
