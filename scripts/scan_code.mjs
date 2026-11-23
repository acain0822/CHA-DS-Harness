#!/usr/bin/env node
/*
 * Which design system components a product's code uses, and how.
 *
 *   npm run scan:code -- <folder> --name "Product name" [--details] [--dry-run]
 *   npm run scan:code -- --remove "Product name"
 *
 * Reads files only: nothing in the product runs or changes. Saves counts to
 * design-system/reports/usage-code.json. File names are printed with --details, never saved.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import { parseCss } from './system_map.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const at = (...p) => path.join(ROOT, ...p);
const REPORT = at('design-system/reports/usage-code.json');
const SKIP = new Set(['node_modules', 'dist', 'build', 'out', 'coverage', 'vendor', 'storybook-static', 'package-dist']);
const CODE = /\.(tsx|jsx|ts|js|mjs|cjs|mts|cts)$/;
const MARKUP = /\.(html?|twig|php|vue|svelte|astro|mdx)$/;
const TEST = /(^|\/)(__tests__|__mocks__|tests?|e2e|cypress)\/|\.(test|spec|stories)\.\w+$/;

function walk(dir, root = dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isSymbolicLink() || e.name.startsWith('.') || SKIP.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, root, out);
    else if (CODE.test(e.name) || MARKUP.test(e.name) || /\.(css|scss|less)$/.test(e.name)) out.push({ full, rel: path.relative(root, full).split(path.sep).join('/') });
  }
  return out;
}

const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };
const norm = (p) => path.resolve(p).toLowerCase();

export function scan(folder, { pkg, components, tokens }) {
  const root = path.resolve(folder);
  const files = walk(root).filter((f) => !f.rel.endsWith('.d.ts'));
  const names = new Set(components.map((c) => c.name));
  const classOf = new Map(components.flatMap((c) => (c.className ? [[c.className, c.name]] : [])));
  const configFile = ['tsconfig.json', 'jsconfig.json'].map((f) => path.join(root, f)).find((f) => fs.existsSync(f));
  const raw = configFile ? ts.readConfigFile(configFile, ts.sys.readFile).config ?? {} : {};
  const options = { ...ts.parseJsonConfigFileContent({ ...raw, files: [], include: [] }, ts.sys, root).options, allowJs: true };
  options.moduleResolution = ts.ModuleResolutionKind.Bundler;
  options.module = ts.ModuleKind.ESNext;

  const parsed = new Map();
  for (const f of files.filter((x) => CODE.test(x.rel))) {
    const text = fs.readFileSync(f.full, 'utf8');
    const kind = /\.(tsx|jsx|js|mjs|cjs)$/.test(f.rel) ? (/\.tsx$/.test(f.rel) ? ts.ScriptKind.TSX : ts.ScriptKind.JSX) : ts.ScriptKind.TS;
    parsed.set(norm(f.full), { ...f, sf: ts.createSourceFile(f.full, text, ts.ScriptTarget.Latest, true, kind) });
  }
  const target = (spec, from) => {
    if (spec === pkg) return 'package';
    const r = ts.resolveModuleName(spec, from, options, ts.sys).resolvedModule?.resolvedFileName;
    return r && parsed.has(norm(r)) ? norm(r) : null;
  };

  /* What name `name` exported by file `key` really is, following barrel files. */
  function exported(key, name, seen = new Set()) {
    if (key === 'package') return names.has(name) ? name : null;
    const id = `${key}|${name}`;
    const file = parsed.get(key);
    if (!file || seen.has(id)) return null;
    seen.add(id);
    const stars = [];
    for (const s of file.sf.statements) {
      if (ts.isExportAssignment(s) && name === 'default' && ts.isIdentifier(s.expression)) return locals(key, seen).get(s.expression.text) ?? null;
      if (!ts.isExportDeclaration(s) || s.isTypeOnly) continue;
      const from = s.moduleSpecifier ? target(s.moduleSpecifier.text, file.full) : null;
      if (!s.exportClause) { if (from) stars.push(from); continue; }
      if (!ts.isNamedExports(s.exportClause)) continue;
      const el = s.exportClause.elements.find((e) => e.name.text === name);
      if (!el) continue;
      const orig = (el.propertyName ?? el.name).text;
      return s.moduleSpecifier ? (from ? exported(from, orig, seen) : null) : locals(key, seen).get(orig) ?? null;
    }
    for (const t of stars) { const r = exported(t, name, seen); if (r) return r; }
    return null;
  }

  /* Local names in a file that are design system components. Namespaces map to { ns }. */
  function locals(key, seen = new Set()) {
    const file = parsed.get(key);
    const out = new Map();
    const bind = (pattern, t) => {
      for (const e of pattern.elements) {
        const c = exported(t, (e.propertyName ?? e.name).text, new Set(seen));
        if (c && ts.isIdentifier(e.name)) out.set(e.name.text, c);
      }
    };
    for (const s of file.sf.statements) {
      if (ts.isImportDeclaration(s) && s.importClause && !s.importClause.isTypeOnly) {
        const t = target(s.moduleSpecifier.text, file.full);
        if (!t) continue;
        const { name, namedBindings: nb } = s.importClause;
        if (name) { const c = exported(t, 'default', new Set(seen)); if (c) out.set(name.text, c); }
        if (nb && ts.isNamespaceImport(nb)) out.set(nb.name.text, { ns: t });
        else if (nb) for (const e of nb.elements) {
          const c = e.isTypeOnly ? null : exported(t, (e.propertyName ?? e.name).text, new Set(seen));
          if (c) out.set(e.name.text, c);
        }
      }
      if (ts.isVariableStatement(s)) for (const d of s.declarationList.declarations) {
        const call = d.initializer;
        if (call && ts.isCallExpression(call) && call.expression.getText() === 'require' && call.arguments[0] && ts.isStringLiteral(call.arguments[0])) {
          const t = target(call.arguments[0].text, file.full);
          if (t && ts.isObjectBindingPattern(d.name)) bind(d.name, t);
          else if (t && ts.isIdentifier(d.name)) out.set(d.name.text, { ns: t });
        }
      }
    }
    return out;
  }

  const result = new Map(components.map((c) => [c.name, { uses: 0, tests: 0, files: new Set(), props: {}, restyled: 0, byClass: 0, cssRules: 0, wrapped: 0 }]));
  const details = [];
  const notes = new Set();
  const propNames = new Map(components.map((c) => [c.name, new Set(c.variants.map((v) => v.prop))]));
  const allowed = new Map(components.flatMap((c) => c.variants.map((v) => [`${c.name}.${v.prop}`, v.values])));
  // Only variant names are kept. Text a product wrote, such as an error message, never is.
  const label = (name, prop, value) => {
    const values = allowed.get(`${name}.${prop}`);
    if (values[0] === 'off') return 'on';
    return value === null || value === undefined ? '(set in code)' : values.includes(value) ? value : '(unknown value)';
  };

  for (const [key, file] of parsed) {
    const local = locals(key);
    const isTest = TEST.test(file.rel);
    const find = (tag) => {
      if (ts.isIdentifier(tag)) { const x = local.get(tag.text); return typeof x === 'string' ? x : null; }
      if (ts.isPropertyAccessExpression(tag) && ts.isIdentifier(tag.expression)) {
        const x = local.get(tag.expression.text);
        return x?.ns ? exported(x.ns, tag.name.text) : null;
      }
      return null;
    };
    const count = (name, node, attrs) => {
      const r = result.get(name);
      if (isTest) { r.tests++; return; }
      r.uses++;
      r.files.add(file.rel);
      const { line } = file.sf.getLineAndCharacterOfPosition(node.getStart());
      details.push(`${name}  ${file.rel}:${line + 1}`);
      const seen = new Set();
      const tally = (p, v) => { seen.add(p); (r.props[p] ??= {})[v] = (r.props[p][v] ?? 0) + 1; };
      let spread = false;
      let touched = false;
      for (const a of attrs) {
        if (a.spread) { spread = true; continue; }
        if (a.name === 'className' || a.name === 'style') touched = true;
        if (propNames.get(name).has(a.name)) tally(a.name, label(name, a.name, a.value));
      }
      if (touched) r.restyled++;
      for (const p of propNames.get(name)) if (!seen.has(p)) tally(p, spread ? '(set in code)' : '(default)');
    };
    const literal = (e) => (e && (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) ? e.text : null);
    const visit = (n) => {
      if (ts.isJsxSelfClosingElement(n) || ts.isJsxOpeningElement(n)) {
        const name = find(n.tagName);
        if (name) count(name, n, n.attributes.properties.map((a) => ts.isJsxSpreadAttribute(a) ? { spread: true }
          : { name: a.name.getText(), value: !a.initializer ? null : ts.isJsxExpression(a.initializer) ? literal(a.initializer.expression) : literal(a.initializer) }));
      } else if (ts.isCallExpression(n)) {
        const fn = n.expression.getText();
        if (/(^|\.)createElement$/.test(fn) && n.arguments[0]) {
          const name = find(n.arguments[0]);
          const o = n.arguments[1];
          if (name) count(name, n, o && ts.isObjectLiteralExpression(o) ? o.properties.map((p) => ts.isPropertyAssignment(p) ? { name: p.name.getText(), value: literal(p.initializer) } : { spread: true }) : []);
        } else if (n.expression.kind === ts.SyntaxKind.ImportKeyword && literal(n.arguments[0]) === pkg) notes.add('Uses a dynamic import of the package, which is not counted.');
        else for (const a of n.arguments) { const name = !isTest && find(a); if (name) result.get(name).wrapped++; }
      }
      // Class names typed by hand in code, outside the package's own components.
      const str = literal(n);
      if (str && !isTest) for (const c of str.split(/\s+/)) if (classOf.has(c)) { result.get(classOf.get(c)).byClass++; details.push(`${classOf.get(c)}  ${file.rel} (class name)`); }
      ts.forEachChild(n, visit);
    };
    visit(file.sf);
  }

  const used = new Map();
  const overridden = new Map();
  const readTokens = (text) => { for (const [, t] of text.matchAll(/var\(\s*(--[\w-]+)/g)) if (tokens.has(t)) used.set(t, (used.get(t) ?? 0) + 1); };
  for (const f of files.filter((x) => !TEST.test(x.rel))) {
    const text = fs.readFileSync(f.full, 'utf8');
    if (MARKUP.test(f.rel)) {
      for (const [, , cls] of text.matchAll(/\bclass(Name)?\s*=\s*["']([^"']*)["']/g)) for (const c of cls.split(/\s+/)) if (classOf.has(c)) { result.get(classOf.get(c)).byClass++; details.push(`${classOf.get(c)}  ${f.rel} (class name)`); }
      readTokens(text);
      if (/\.mdx$|\.vue$|\.svelte$|\.astro$/.test(f.rel) && text.includes(pkg)) notes.add(`Components imported in ${path.extname(f.rel)} files are not counted.`);
    } else if (/\.css$/.test(f.rel)) {
      // A full copy of the package's stylesheet is not a product override.
      const rules = parseCss(text);
      const copy = rules.filter((r) => r.head === ':root').flatMap((r) => r.decls).filter(([k]) => tokens.has(k)).length > tokens.size / 2;
      if (copy) { notes.add("Contains a copy of the package's stylesheet, which won't get updates."); continue; }
      readTokens(text.replace(/\/\*[\s\S]*?\*\//g, ''));
      for (const r of rules) {
        for (const [k] of r.decls) if (tokens.has(k)) overridden.set(k, (overridden.get(k) ?? 0) + 1);
        for (const [cls, name] of classOf) if (new RegExp(`\\.${cls}(?![a-z0-9])`).test(r.head)) result.get(name).cssRules++;
      }
    } else readTokens(text);
  }

  const own = readJson(path.join(root, 'package.json'));
  const installed = readJson(path.join(root, 'node_modules', pkg, 'package.json'))?.version ?? null;
  const declared = own?.dependencies?.[pkg] ?? own?.devDependencies?.[pkg] ?? null;
  if (!installed && declared) notes.add('Dependencies are not installed, so the version is unknown.');
  if (!installed && !declared) notes.add('The package is not a dependency of this folder.');
  return {
    version: installed, dependency: Boolean(declared), filesRead: files.length, notes: [...notes],
    components: Object.fromEntries([...result].map(([n, r]) => [n, { ...r, files: r.files.size }])),
    tokens: { used: Object.fromEntries(used), overridden: Object.fromEntries(overridden) }, details,
  };
}

export function compareVersions(a, b) {
  const n = (v) => String(v).split('-')[0].split('.').map(Number);
  const [x, y] = [n(a), n(b)];
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0);
  return 0;
}

/* What the package contains now, from the same data as the documentation. */
export async function catalog() {
  const { buildMap } = await import('./system_map.mjs');
  const cfg = readJson(at('design-system/package.config.json'));
  const map = buildMap(ROOT);
  return {
    pkg: cfg.name, version: cfg.version, tokens: new Set(map.tokens.map((t) => t.name)),
    components: cfg.components.map((name) => {
      const c = map.components.find((x) => x.name === name);
      const tsx = fs.readFileSync(at(c.codePath, `${name}.tsx`), 'utf8');
      const props = c.dims.filter((d) => d.values[0] !== 'off' || new RegExp(`\\b${d.prop}\\?:`).test(tsx));
      return { name, variants: props, className: c.views[0].rows[0]?.part ?? null };
    }),
  };
}

async function main() {
  const argv = process.argv.slice(2);
  const take = (k) => { const i = argv.indexOf(k); return i < 0 ? null : argv.splice(i, 2)[1] ?? null; };
  const flag = (k) => { const i = argv.indexOf(k); if (i < 0) return false; argv.splice(i, 1); return true; };
  const remove = take('--remove');
  const name = take('--name');
  const showDetails = flag('--details');
  const dry = flag('--dry-run');
  const report = readJson(REPORT) ?? { products: [] };
  const save = () => fs.writeFileSync(REPORT, JSON.stringify(report, null, 1) + '\n');
  if (remove) {
    const kept = report.products.filter((p) => p.name !== remove);
    if (kept.length === report.products.length) throw new Error(`No product named "${remove}".`);
    report.products = kept;
    if (kept.length) save(); else fs.rmSync(REPORT);
    console.log(`Removed ${remove}.`);
    return;
  }
  if (argv.length !== 1 || !name) throw new Error('Usage: scan:code -- <folder> --name "Product name" [--details] [--dry-run]');
  const folder = path.resolve(process.env.INIT_CWD ?? process.cwd(), argv[0]);
  if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) throw new Error(`No folder at ${folder}.`);
  const cat = await catalog();
  const { details, ...r } = scan(folder, cat);
  console.log(`${name}: ${r.filesRead} files, package ${r.version ?? 'version unknown'} (newest here ${cat.version})`);
  for (const [n, c] of Object.entries(r.components)) console.log(`  ${n.padEnd(12)} ${c.uses} uses in ${c.files} files${c.byClass ? `, ${c.byClass} by class name` : ''}${c.restyled ? `, ${c.restyled} restyled` : ''}${c.cssRules ? `, ${c.cssRules} CSS rules` : ''}${c.wrapped ? `, passed to a function ${c.wrapped}` : ''}${c.tests ? ` (${c.tests} in tests, not counted)` : ''} ${Object.keys(c.props).length ? JSON.stringify(c.props) : ''}`);
  console.log(`  Tokens: ${Object.keys(r.tokens.used).length} used, ${Object.keys(r.tokens.overridden).length} overridden`);
  for (const n of r.notes) console.log(`  Note: ${n}`);
  if (showDetails) console.log(details.map((d) => `    ${d}`).join('\n'));
  if (dry) return;
  report.products = [...report.products.filter((p) => p.name !== name), { name, scanned: new Date().toISOString().slice(0, 10), ...r }].sort((a, b) => a.name.localeCompare(b.name));
  save();
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((e) => { console.error(e.message); process.exitCode = 1; });
}
