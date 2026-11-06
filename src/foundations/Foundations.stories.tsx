import type { Meta, StoryObj } from '@storybook/react-vite';
import figmaVars from '../../design-system/tokens.figma.json';

/*
 * Foundations render straight from design-system/tokens.figma.json (the raw
 * Figma variables), so these pages and their screenshots change whenever a
 * token does.
 */
const vars = figmaVars as Record<string, string>;
const cssVar = (path: string) =>
  '--' +
  path
    .split('/')
    .map((p) =>
      p
        .trim()
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .replace(/[^a-zA-Z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .toLowerCase(),
    )
    .join('-');

function describeFont(v: string) {
  const f = Object.fromEntries([...v.matchAll(/(\w+):\s*("[^"]*"|[^,)]+)/g)].map((m) => [m[1], m[2].replace(/"/g, '').trim()]));
  const lh = Number(f.lineHeight) === 100 ? 'auto' : `${f.lineHeight}px`;
  const ls = Number(f.letterSpacing) ? ` · ${f.letterSpacing}% tracking` : '';
  return `${f.family} ${f.style} · ${f.size}px / ${lh}${ls}`;
}

const isColor = (v: string) => /^#[0-9a-f]{6,8}$/i.test(v);
const isFont = (v: string) => v.startsWith('Font(');

const meta = {
  title: 'Foundations',
  parameters: { layout: 'padded', controls: { disable: true } },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const label: React.CSSProperties = { fontFamily: 'var(--font-body)', fontSize: 13, lineHeight: '18px' };
const mono: React.CSSProperties = { fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12, color: 'var(--text-text-tertiary)' };

function group(filter: (v: string) => boolean) {
  const groups: Record<string, [string, string][]> = {};
  for (const [k, v] of Object.entries(vars)) {
    if (!filter(v)) continue;
    const parts = k.split('/');
    const g = parts.length > 1 ? parts.slice(0, -1).join(' / ') : 'Ungrouped';
    (groups[g] ??= []).push([k, v]);
  }
  return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
}

export const Colors: Story = {
  render: () => (
    <div style={{ display: 'grid', gap: 32 }}>
      {group(isColor).map(([g, items]) => (
        <section key={g}>
          <h3 style={{ ...label, fontSize: 16, fontWeight: 600, margin: '0 0 12px' }}>{g}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
            {items.map(([k, v]) => (
              <div key={k} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <div style={{ width: 48, height: 48, borderRadius: 4, background: `var(${cssVar(k)})`, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.12)', flexShrink: 0 }} />
                <div>
                  <div style={label}>{k.split('/').pop()}</div>
                  <div style={mono}>{v.toUpperCase()}</div>
                  <div style={mono}>{cssVar(k)}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  ),
};

export const Typography: Story = {
  render: () => (
    <div style={{ display: 'grid', gap: 24 }}>
      {Object.entries(vars)
        .filter(([, v]) => isFont(v))
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => {
          const n = cssVar(k);
          return (
            <div key={k} style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 24px', alignItems: 'baseline' }}>
              <div style={{ flex: '0 0 260px', maxWidth: '100%' }}>
                <div style={label}>{k}</div>
                <div style={mono}>{describeFont(v)}</div>
              </div>
              <div
                style={{
                  flex: '1 1 300px',
                  minWidth: 0,
                  fontFamily: `var(${n}-font-family)`,
                  fontSize: `var(${n}-font-size)`,
                  fontWeight: `var(${n}-font-weight)` as never,
                  lineHeight: `var(${n}-line-height)`,
                  letterSpacing: `var(${n}-letter-spacing)`,
                }}
              >
                Pay your water bill online
              </div>
            </div>
          );
        })}
    </div>
  ),
};

export const SpacingAndRadius: Story = {
  name: 'Spacing & Radius',
  render: () => {
    const rows = Object.entries(vars)
      .filter(([k, v]) => /spacing|padding|radius/i.test(k) && /^\d+$/.test(v))
      .sort(([a, x], [b, y]) => a.split('/')[0].localeCompare(b.split('/')[0]) || Number(x) - Number(y));
    return (
      <div style={{ display: 'grid', gap: 12 }}>
        {rows.map(([k, v]) => {
          const radius = /radius/i.test(k);
          return (
            <div key={k} style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px', alignItems: 'center' }}>
              <span style={{ ...label, flex: '0 0 240px', maxWidth: '100%', overflowWrap: 'anywhere' }}>{k}</span>
              <span style={{ ...mono, flex: '0 0 60px' }}>{v}px</span>
              <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                {radius ? (
                  <div style={{ width: 96, height: 48, background: 'var(--colors-chattanooga-blues-sky-20)', borderRadius: `var(${cssVar(k)})` }} />
                ) : (
                  <div style={{ width: `var(${cssVar(k)})`, minWidth: 1, height: 16, background: 'var(--border-button-button-primary)' }} />
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  },
};

export const Elevation: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 32, padding: 16 }}>
      <div style={{ width: 200, height: 120, borderRadius: 4, background: 'var(--white)', boxShadow: 'var(--regular-shadow)', display: 'grid', placeItems: 'center', ...label }}>
        Regular Shadow
      </div>
    </div>
  ),
};
