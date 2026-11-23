#!/usr/bin/env node
// Two separate usage views: Figma and chattanooga.gov. Reads saved data only; never uses the network.
// node scripts/usage_v2.mjs --live <dir with index.json> --out <file>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const json = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const VOID = new Set('area base br col embed hr img input link meta source track wbr'.split(' '));
const RAW = /^(script|style|noscript|template)$/;

// Elements with their region, parent and whether they sit in a modal.
export function parse(html) {
  const els = [];
  const stack = [];
  const re = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^'">])*)>/g;
  let m;
  while ((m = re.exec(html))) {
    if (!m[2]) continue;
    const tag = m[2].toLowerCase();
    if (m[1]) {
      for (let i = stack.length - 1; i >= 0; i--) if (stack[i].tag === tag) { stack.length = i; break; }
      continue;
    }
    if (RAW.test(tag)) {
      const end = new RegExp(`</${tag}\\s*>`, 'ig');
      end.lastIndex = re.lastIndex;
      re.lastIndex = end.exec(html) ? end.lastIndex : html.length;
      continue;
    }
    const a = {};
    for (const x of m[3].matchAll(/([^\s=/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g)) {
      a[x[1].toLowerCase()] = x[2] ?? x[3] ?? x[4] ?? '';
    }
    const parent = stack.at(-1);
    const cls = new Set((a.class || '').split(/\s+/).filter(Boolean));
    const inherited = parent?.region ?? 'other';
    const region = inherited === 'other' && /^(header|footer|main)$/.test(tag) ? tag : inherited;
    const el = { tag, a, cls, region, parent, inModal: !!parent?.inModal || cls.has('modal') };
    els.push(el);
    if (!VOID.has(tag)) stack.push(el);
  }
  return els;
}

export const matches = (el, r) =>
  (!r.id || el.a['data-component-id'] === r.id) &&
  (!r.anyClass || r.anyClass.some((c) => el.cls.has(c))) &&
  (!r.tags || r.tags.includes(el.tag)) &&
  !(r.exceptClass || []).some((c) => el.cls.has(c)) &&
  (!r.types || r.types.includes((el.a.type || 'text').toLowerCase()));

// A match inside another match of the same component counts once.
export function countPage(els, rule) {
  const hit = new Set(els.filter((e) => matches(e, rule)));
  const out = { content: 0, chrome: 0, modal: 0 };
  for (const e of hit) {
    let p = e.parent;
    while (p && !hit.has(p)) p = p.parent;
    if (!p) out[e.inModal ? 'modal' : e.region === 'main' ? 'content' : 'chrome']++;
  }
  return out;
}

// Tier comes from reach (share of pages or screens), not instance totals.
export const tier = (n, of) => (!n ? 'None seen' : n / of >= 0.25 ? 'Widespread' : n / of >= 0.05 ? 'Common' : 'Rare');

export function openIssues(text) {
  const open = new Map();
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const r = JSON.parse(line);
    if (r.event === 'opened') open.set(r.id, { ...r, closed: false });
    const item = open.get(r.id);
    if (item && r.event === 'resolved') item.closed = true;
    if (item && r.event === 'reviewed') item.closed = r.decision === 'approved';
  }
  return [...open.values()].filter((i) => !i.closed);
}

// Visible instances by published set key. Instances inside instances or definitions don't count.
export function countFigma(doc) {
  const n = {};
  const walk = (x, screen, inside) => {
    if (x.visible === false || x.type === 'COMPONENT' || x.type === 'COMPONENT_SET') return;
    const s = screen ?? (x.type === 'FRAME' ? x.id : null);
    let within = inside;
    if (x.type === 'INSTANCE' && !inside) {
      const c = doc.components?.[x.componentId];
      const key = doc.componentSets?.[c?.componentSetId]?.key ?? c?.key ?? 'unknown';
      n[key] ??= { instances: 0, screens: new Set() };
      n[key].instances++;
      if (s) n[key].screens.add(s);
      within = true;
    }
    for (const c of x.children || []) walk(c, s, within);
  };
  walk(doc.document, null, false);
  return n;
}

function main() {
  const arg = (k) => { const i = process.argv.indexOf(k); return i < 0 ? null : process.argv[i + 1]; };
  const map = json(path.join(ROOT, 'design-system/usage-map.json'));
  const manifest = json(path.join(ROOT, 'design-system/manifest.json'));
  const dir = arg('--live');
  const teamFile = path.join(ROOT, 'design-system/team-files-manifest.json');
  const pages = new Map();
  const skipped = [];
  for (const x of json(path.join(dir, 'index.json'))) {
    const [code, url] = x.status.split(' ');
    if (code !== '200' || pages.has(url)) { skipped.push([x.path, 'duplicate or error']); continue; }
    if (/(^|\/)(test|[\w-]+-test|test-[\w-]+)(\/|$)/.test(new URL(url).pathname)) { skipped.push([x.path, 'test page']); continue; }
    pages.set(url, parse(fs.readFileSync(path.join(dir, x.file), 'utf8')));
  }
  const issues = openIssues(fs.readFileSync(path.join(ROOT, 'design-system/reports/harness-log.jsonl'), 'utf8'));
  const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const claimed = new Set();
  const components = manifest.components.filter((c) => c.status !== 'superseded').map((c) => {
    const rule = map.live[c.name];
    let live = { status: 'unmapped' };
    if (rule) {
      const total = { content: 0, chrome: 0, modal: 0 };
      let contentPages = 0;
      for (const els of pages.values()) {
        const n = countPage(els, rule);
        for (const k in total) total[k] += n[k];
        if (n.content) contentPages++;
      }
      const siteWide = total.chrome > 0 && !total.content;
      live = { status: 'measured', mapping: 'proposed', pages: contentPages, instances: total, tier: siteWide ? 'Site-wide' : tier(contentPages, pages.size) };
    }
    const mine = issues.filter((i) => norm(i.component) === norm(c.name));
    mine.forEach((i) => claimed.add(i.id));
    return {
      name: c.name, figmaNodeId: c.figmaNodeId, buildStatus: c.status,
      figma: { status: 'not measured' }, live,
      openIssues: mine.map(({ id, type, severity, message }) => ({ id, type, severity, message })),
    };
  });
  const ids = {};
  for (const els of pages.values()) for (const e of els) {
    const k = e.a['data-component-id'];
    if (k) ids[k] = (ids[k] || 0) + 1;
  }
  const mapped = new Set(Object.values(map.live).map((r) => r.id).filter(Boolean));
  const liveOnly = Object.fromEntries(Object.entries(ids).filter(([k]) => !mapped.has(k)));
  const out = {
    live: { site: 'chattanooga.gov', coverage: 'sample', pagesMeasured: pages.size, skipped, unmappedLiveComponents: liveOnly },
    figma: {
      status: 'paused',
      files: (fs.existsSync(teamFile) ? json(teamFile).teamFiles : [])
        .map((f) => ({ name: f.name, role: map.figmaRoles[f.category] ?? 'unassigned', lastScanned: f.lastScanned })),
    },
    issues: { open: issues.length, notTiedToOneComponent: issues.filter((i) => !claimed.has(i.id)).length },
    components,
  };
  fs.writeFileSync(arg('--out'), JSON.stringify(out, null, 1));
  console.log('pages', pages.size, 'skipped', JSON.stringify(skipped), JSON.stringify(out.issues));
  for (const c of components.filter((x) => x.live.status === 'measured').sort((a, b) => b.live.pages - a.live.pages)) {
    console.log(c.name.padEnd(27), c.live.tier.padEnd(11), c.live.pages, JSON.stringify(c.live.instances));
  }
  console.log('active', components.length, 'unmapped', components.filter((c) => c.live.status === 'unmapped').length, JSON.stringify(liveOnly));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
