import type { StorybookConfig } from '@storybook/react-vite';
import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

/* Builds the documentation data from the code each time, so it can't go out of date. */
const ID = '\0virtual:system-map';
const SOURCES = ['src/components', 'src/tokens', 'src/styles', 'design-system/manifest.json', 'design-system/tokens.figma.json', 'design-system/reports/usage-live.json', 'design-system/reports/usage-code.json', 'design-system/package.config.json'];
function systemMap(): Plugin {
  const under = (p: string): string[] =>
    !fs.existsSync(p) ? [] : fs.statSync(p).isDirectory() ? fs.readdirSync(p).flatMap((f) => under(path.join(p, f))) : [path.resolve(p)];
  return {
    name: 'cha-system-map',
    resolveId: (id) => (id === 'virtual:system-map' ? ID : undefined),
    async load(id) {
      if (id !== ID) return;
      for (const f of SOURCES.flatMap(under)) this.addWatchFile(f);
      // @ts-expect-error plain JavaScript module
      const { buildMap } = await import('../scripts/system_map.mjs');
      return `export default ${JSON.stringify(buildMap(process.cwd()))}`;
    },
  };
}

const config: StorybookConfig = {
  stories: ['../src/**/*.mdx', '../src/**/*.stories.@(ts|tsx)'],
  addons: [
    '@storybook/addon-docs',
    '@storybook/addon-a11y',
    '@storybook/addon-designs',
    'storybook-addon-pseudo-states',
  ],
  viteFinal: (config) => ({ ...config, plugins: [...(config.plugins ?? []), systemMap()] }),
  framework: { name: '@storybook/react-vite', options: {} },
};

export default config;
