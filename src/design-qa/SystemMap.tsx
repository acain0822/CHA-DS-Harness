import { useState, type ReactNode } from 'react';
import map from 'virtual:system-map';
import type { ChainLink, ComponentMap, Row } from 'virtual:system-map';
import './SystemMap.css';

/* Documentation pages generated from the code by scripts/system_map.mjs. */

const link = (c: ChainLink) => (c.via ? [...c.via, c.token] : [c.token]);

function Source({ row }: { row: Row }) {
  if (!row.chain.length) return <span>{row.raw ? <strong className="sm-raw">Raw value</strong> : 'No token needed'}</span>;
  return (
    <>
      {row.chain.map((c, i) => (
        <div key={i} className="sm-chain">
          {link(c).map((t) => <code key={t}>{t}</code>)}
          {c.runtime ? <span>set by the component</span> : (
            <>
              {c.value?.startsWith('#') && <span className="sm-swatch" style={{ background: c.value }} />}
              <span>{c.value}</span>
              {c.when && <span className="sm-muted">{c.when}</span>}
              {c.figma && <span className="sm-muted">Figma: {c.figma}</span>}
            </>
          )}
        </div>
      ))}
      {row.raw && <strong className="sm-raw">Also has a raw value</strong>}
    </>
  );
}

const codeSummary = (c: ComponentMap) => (!c.usage.code ? 'Not measured'
  : `${c.usage.code.reduce((n, p) => n + p.uses, 0)} uses in ${c.usage.code.filter((p) => p.uses).length} of ${c.usage.code.length} products scanned`);

function ProductUse({ component: c }: { component: ComponentMap }) {
  if (!c.usage.code) return <p>No product code has been scanned.</p>;
  return (
    <div className="sm-scroll" tabIndex={0} role="region" aria-label="Product use">
      <table className="sm-table">
        <thead><tr><th scope="col">Product</th><th scope="col">Version</th><th scope="col">Uses</th><th scope="col">Variants</th><th scope="col">Changed locally</th></tr></thead>
        <tbody>
          {c.usage.code.map((p) => (
            <tr key={p.product}>
              <th scope="row">{p.product}<div className="sm-muted">Scanned {p.scanned}</div></th>
              <td>{p.version ?? 'Unknown'}{p.version && p.version !== map.newest && <div className="sm-muted">Newest here: {map.newest}</div>}</td>
              <td>{p.uses} in {p.files} files{p.byClass > 0 && <div className="sm-muted">{p.byClass} by class name</div>}</td>
              <td>{Object.entries(p.props).map(([k, v]) => <div key={k}>{k}: {Object.entries(v).map(([x, n]) => `${x} ${n}`).join(', ')}</div>)}</td>
              <td>{[p.restyled && `${p.restyled} restyled`, p.cssRules && `${p.cssRules} CSS rules`, p.wrapped && `${p.wrapped} passed to a function`].filter(Boolean).join(', ') || 'None found'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const ORIGIN = { base: 'Base', variant: 'Variant', state: 'State' } as const;

export function Usage({ component: c }: { component: ComponentMap }) {
  const l = c.usage.live;
  return (
    <dl className="sm-facts">
      <div><dt>Live site</dt><dd>{l ? `${l.pages} of ${l.of} pages, ${l.content} in content, ${l.chrome} in header and footer (unconfirmed match)` : 'Not measured'}</dd></div>
      <div><dt>Figma</dt><dd>{c.usage.figma ?? 'Not measured'}</dd></div>
      <div><dt>Product code</dt><dd>{codeSummary(c)}</dd></div>
      <div><dt>Uses</dt><dd>{c.uses.join(', ') || 'No other components'}</dd></div>
      <div><dt>Used by</dt><dd>{c.usedBy.join(', ') || 'No other components'}</dd></div>
      <div><dt>Code</dt><dd><code>{c.codePath}</code></dd></div>
      <div><dt>Design</dt><dd>{c.figmaUrl ? <a href={c.figmaUrl} target="_blank" rel="noreferrer">Open in Figma</a> : 'No Figma link'}</dd></div>
      <div><dt>Open issues</dt><dd>{c.issues.length}</dd></div>
    </dl>
  );
}

export function Inheritance({ component: c }: { component: ComponentMap }) {
  const [pick, setPick] = useState<Record<string, string>>(() => Object.fromEntries(c.dims.map((d) => [d.prop, d.values[0]])));
  const [state, setState] = useState('default');
  const [only, setOnly] = useState(false);
  const view = c.views.find((v) => v.state === state && c.dims.every((d) => v.variant[d.prop] === pick[d.prop]));
  const rows = (view?.rows ?? []).filter((r) => !only || r.origin !== 'base');
  const parts = [...new Set(rows.map((r) => r.part))];
  return (
    <section>
      <div className="sm-controls">
        {c.dims.map((d) => (
          <label key={d.prop}>{d.prop}
            <select value={pick[d.prop]} onChange={(e) => setPick({ ...pick, [d.prop]: e.target.value })}>
              {d.values.map((v) => <option key={v}>{v}</option>)}
            </select>
          </label>
        ))}
        <label>state
          <select value={state} onChange={(e) => setState(e.target.value)}>{c.states.map((s) => <option key={s}>{s}</option>)}</select>
        </label>
        <label className="sm-check"><input type="checkbox" checked={only} onChange={(e) => setOnly(e.target.checked)} /> Only what differs from base</label>
      </div>
      {!rows.length && <p>Nothing differs from base here.</p>}
      {parts.map((p) => (
        <div key={p} className="sm-scroll" tabIndex={0} role="region" aria-label={`Properties of ${p}`}>
          <table className="sm-table">
            <caption><code>.{p}</code></caption>
            <thead><tr><th scope="col">Property</th><th scope="col">Comes from</th><th scope="col">Token and value</th><th scope="col">Replaces</th></tr></thead>
            <tbody>
              {rows.filter((r) => r.part === p).map((r) => (
                <tr key={r.prop}>
                  <th scope="row">{r.prop}<div className="sm-muted">{r.value}</div></th>
                  <td><span className={`sm-origin sm-origin--${r.origin}`}>{ORIGIN[r.origin]}</span><div className="sm-muted"><code>{r.rule}</code></div><div className="sm-muted">{r.where}</div></td>
                  <td><Source row={r} /></td>
                  <td className="sm-muted">{r.replaces ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </section>
  );
}

export const Gallery = ({ children }: { children: ReactNode }) => <div className="sm-gallery">{children}</div>;

export function ComponentPage({ name }: { name: string }) {
  const c = map.components.find((x) => x.name === name);
  if (!c) return <p>{name} isn't in the code.</p>;
  return (
    <div className="sm">
      <h2>Usage</h2>
      <Usage component={c} />
      <h2>Use in products</h2>
      <ProductUse component={c} />
      <details className="sm-details">
      <summary>Inheritance (for developers)</summary>
      <p>Base is shared by every variant. Variant and State replace it. Figma links between tokens {map.figmaLinksRecorded ? 'are recorded.' : "aren't recorded yet, so the chain ends at the token's value."}</p>
      <Inheritance component={c} />
      </details>
      {c.notes.length > 0 && <><h2>Design notes</h2><ul>{c.notes.map((n) => <li key={n}>{n}</li>)}</ul></>}
    </div>
  );
}

export function Overview() {
  return (
    <div className="sm">
      <p>{map.components.filter((c) => !c.internal).length} built, {map.notBuilt.length} listed in Figma but not built. This list is provisional. Live use covers {map.livePages} pages of the current site, with unconfirmed matches.</p>
      <div className="sm-scroll" tabIndex={0} role="region" aria-label="Components">
        <table className="sm-table">
          <thead><tr><th scope="col">Component</th><th scope="col">In code</th><th scope="col">Variants</th><th scope="col">Live pages</th><th scope="col">Figma</th><th scope="col">Product code</th></tr></thead>
          <tbody>
            {map.components.map((c) => (
              <tr key={c.name}>
                <th scope="row">{c.label}</th><td>{c.internal ? 'Internal' : 'Built'}</td>
                <td>{c.dims.map((d) => `${d.prop}: ${d.values.length}`).join(', ') || 'None'}</td>
                <td>{c.usage.live ? `${c.usage.live.pages} of ${c.usage.live.of}` : 'Not measured'}</td><td>{c.usage.figma ?? 'Not measured'}</td><td>{codeSummary(c)}</td>
              </tr>
            ))}
            {map.notBuilt.map((c, i) => (
              <tr key={`${c.name}${i}`}>
                <th scope="row">{c.name}</th><td>Not built</td><td /><td>{c.live?.status === 'measured' ? `${c.live.pages} of ${map.livePages}` : 'Not measured'}</td><td>Not measured</td><td>Not measured</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function Products() {
  if (!map.products.length) return <div className="sm"><p>No products scanned yet. Newest package version: {map.newest}.</p></div>;
  return (
    <div className="sm">
      <p>Newest package version: {map.newest}. Products choose when to update.</p>
      <div className="sm-scroll" tabIndex={0} role="region" aria-label="Products">
        <table className="sm-table">
          <thead><tr><th scope="col">Product</th><th scope="col">Version</th><th scope="col">Components used</th><th scope="col">Tokens</th><th scope="col">Notes</th></tr></thead>
          <tbody>
            {map.products.map((p) => (
              <tr key={p.name}>
                <th scope="row">{p.name}<div className="sm-muted">Scanned {p.scanned}</div></th>
                <td>{p.version ?? 'Unknown'}</td>
                <td>{map.components.filter((c) => c.usage.code?.some((u) => u.product === p.name && u.uses)).map((c) => c.label).join(', ') || 'None'}</td>
                <td>{p.tokensUsed} used{p.overridden.length > 0 && <div>Overrides: {p.overridden.join(', ')}</div>}</td>
                <td>{p.notes.join(' ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function Tokens() {
  const [q, setQ] = useState('');
  const list = map.tokens.filter((t) => `${t.name} ${t.figma ?? ''} ${t.usedBy.join(' ')}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="sm">
      <p>Change a token and everything in its last column changes with it.</p>
      <div className="sm-controls"><label>Find a token or component <input value={q} onChange={(e) => setQ(e.target.value)} /></label></div>
      <div className="sm-scroll" tabIndex={0} role="region" aria-label="Tokens">
        <table className="sm-table">
          <thead><tr><th scope="col">Token</th><th scope="col">Value</th><th scope="col">Used by</th></tr></thead>
          <tbody>
            {list.map((t) => (
              <tr key={t.name}>
                <th scope="row"><code>{t.name}</code>{t.figma && <div className="sm-muted">Figma: {t.figma}</div>}</th>
                <td>{t.values.map((v, i) => <div key={i}>{v.value.startsWith('#') && <span className="sm-swatch" style={{ background: v.value }} />} {v.value} <span className="sm-muted">{v.when}</span></div>)}</td>
                <td>{t.usedBy.join('; ') || <span className="sm-muted">No built component</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2>Tokens with the same color</h2>
      <p>Matching values, not proof that one inherits from another.</p>
      <ul>{map.sameValue.map((s) => <li key={s.value}><span className="sm-swatch" style={{ background: s.value }} /> {s.value}: {s.names.join(', ')}</li>)}</ul>
    </div>
  );
}
