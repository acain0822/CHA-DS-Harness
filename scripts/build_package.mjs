#!/usr/bin/env node
/*
 * Builds the installable package into package-dist/. Never publishes: the
 * package is private until it has a home. Settings: design-system/package.config.json
 *
 *   index.js + types   React components, for Next.js or any React app
 *   styles.css         Tokens and component styles, for any project
 *   tokens.css / .json Tokens only
 *   components.json    What's in this version, for tools and usage scans
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { buildMap, parseCss } from './system_map.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const at = (...p) => path.join(ROOT, ...p);
const OUT = at('package-dist');
const read = (p) => fs.readFileSync(at(p), 'utf8').replace(/\r\n/g, '\n');
const write = (p, s) => { fs.mkdirSync(path.dirname(path.join(OUT, p)), { recursive: true }); fs.writeFileSync(path.join(OUT, p), s); };
const stop = (m) => { console.error(`Package not built: ${m}`); process.exit(1); };

const cfg = JSON.parse(read('design-system/package.config.json'));
// Empty the folder rather than delete it: Windows won't delete one a terminal is open in.
fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(OUT)) fs.rmSync(path.join(OUT, f), { recursive: true, force: true });

/* Storybook finds icons with Vite. Other tools can't, so the package carries them inside. */
const GLOB = /const files = import\.meta\.glob[\s\S]*?const byName[\s\S]*?\);\n/;
function inlineIcons(source) {
  if (!GLOB.test(source)) stop('Icon.tsx no longer loads icons the way this script expects.');
  const icons = Object.fromEntries(fs.readdirSync(at('src/assets/icons')).filter((f) => f.endsWith('.svg')).sort().map((f) => {
    const svg = read(`src/assets/icons/${f}`).replace(/\s*\n\s*/g, '');
    return [f.replace('.svg', ''), `data:image/svg+xml,${encodeURIComponent(svg).replace(/[()']/g, (c) => `%${c.charCodeAt(0).toString(16)}`)}`];
  }));
  const declared = [...(source.match(/type IconName = ([^;]+)/)?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1]);
  const missing = declared.filter((n) => !icons[n]);
  if (!declared.length || missing.length) stop(`icons missing: ${missing.join(', ') || 'no IconName type'}.`);
  return source.replace(GLOB, () => `const byName: Record<string, string> = ${JSON.stringify(icons)};\n`);
}

const result = await build({
  stdin: { contents: cfg.components.map((c) => `export * from './src/components/${c}/${c}';`).join('\n'), resolveDir: ROOT, loader: 'ts' },
  bundle: true, format: 'esm', jsx: 'automatic', target: 'es2022', external: ['react', 'react/jsx-runtime'], write: false, outfile: 'index.js',
  plugins: [{
    name: 'cha',
    setup(b) {
      b.onLoad({ filter: /\.css$/ }, () => ({ contents: '', loader: 'empty' }));
      b.onLoad({ filter: /[\\/]Icon\.tsx$/ }, (a) => ({ contents: inlineIcons(fs.readFileSync(a.path, 'utf8').replace(/\r\n/g, '\n')), loader: 'tsx' }));
    },
  }],
});
const js = result.outputFiles.find((f) => f.path.endsWith('.js')).text;
if (/import\.meta/.test(js)) stop('a component still depends on Vite.');
write('index.js', js);

const tsc = spawnSync(process.execPath, [at('node_modules/typescript/bin/tsc'), '--noEmit', 'false', '--emitDeclarationOnly', '--declaration', '--rootDir', 'src/components',
  '--outDir', path.join(OUT, 'types'), '--jsx', 'react-jsx', '--module', 'ESNext', '--moduleResolution', 'Bundler', '--target', 'ES2022', '--lib', 'ES2022,DOM,DOM.Iterable',
  '--strict', '--skipLibCheck', '--types', 'vite/client', ...cfg.components.map((c) => `src/components/${c}/${c}.tsx`)], { cwd: ROOT, encoding: 'utf8' });
if (tsc.status !== 0) stop(tsc.stdout || String(tsc.error));
for (const c of cfg.components) {
  const f = path.join(OUT, `types/${c}/${c}.d.ts`);
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace(/^import '.*\.css';\n/gm, '').replace(/(from '\.\.?\/[^']+)'/g, "$1.js'"));
}
write('index.d.ts', cfg.components.map((c) => `export * from './types/${c}/${c}.js';`).join('\n') + '\n');

/* Only :root rules from the shared file. Its body styles belong to Storybook, not to someone's page. */
const shared = parseCss(read('src/styles/responsive.css')).filter((r) => r.head === ':root').map((r) => {
  const body = `:root {\n${r.decls.map(([k, v]) => `  ${k}: ${v};`).join('\n')}\n}`;
  return r.media ? `@media ${r.media} {\n${body}\n}` : body;
}).join('\n');
const tokens = `${read('src/tokens/tokens.css').trim()}\n${shared}\n`;
const styles = `${tokens}\n${cfg.components.map((c) => read(`src/components/${c}/${c}.css`).trim()).join('\n\n')}\n`;
const noComments = styles.replace(/\/\*[\s\S]*?\*\//g, '');
const defined = new Set([...noComments.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
const unresolved = [...new Set([...noComments.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]))].filter((n) => !defined.has(n) && !js.includes(`"${n}"`));
if (unresolved.length) stop(`styles use undefined tokens: ${unresolved.join(', ')}.`);
write('tokens.css', tokens);
write('styles.css', styles);

const map = buildMap(ROOT);
write('tokens.json', JSON.stringify(Object.fromEntries(map.tokens.map((t) => [t.name.slice(2), t.values])), null, 2) + '\n');
write('components.json', JSON.stringify({
  package: cfg.name, version: cfg.version,
  components: cfg.components.map((n) => {
    const c = map.components.find((x) => x.name === n) ?? stop(`${n} isn't in the system map.`);
    return { name: n, variants: c.dims, states: c.states, uses: c.uses, figmaNodeId: c.figmaNodeId };
  }),
}, null, 2) + '\n');

write('package.json', JSON.stringify({
  name: cfg.name, version: cfg.version, private: true, license: 'UNLICENSED', type: 'module',
  description: 'City of Chattanooga design system: tokens and React components.',
  main: './index.js', types: './index.d.ts', sideEffects: ['*.css'],
  exports: {
    '.': { types: './index.d.ts', default: './index.js' },
    './styles.css': './styles.css', './tokens.css': './tokens.css', './tokens.json': './tokens.json',
    './components.json': './components.json', './package.json': './package.json',
  },
  peerDependencies: { react: '>=18' },
}, null, 2) + '\n');
write('README.md', `# ${cfg.name}

Version ${cfg.version}. Provisional until the main Figma file is ready.

## React and Next.js

Import the styles once (in Next.js, in \`app/layout.tsx\`), then use any component:

\`\`\`tsx
import '${cfg.name}/styles.css';
import { Button } from '${cfg.name}';

<Button label="Pay a bill" />
\`\`\`

Components work in server components. Passing a function such as \`onClick\` needs a client component, as usual.

## Anything else

Link \`tokens.css\` for the variables, or \`styles.css\` to also use the class names (\`cha-button cha-button--primary cha-button--large\`). \`tokens.json\` has the same values for tools.

## Fonts

Not included. Load Gabarito (400 to 700) and Inter (400, 600) in your project.
`);
console.log(`Built ${cfg.name} ${cfg.version}: ${cfg.components.length} components, ${map.tokens.length} tokens.`);
