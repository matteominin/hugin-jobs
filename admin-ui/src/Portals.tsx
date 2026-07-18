import { Fragment, useEffect, useState } from 'react';
import { api, type Portal, type TestResult } from './api.ts';

function fmtAgo(iso: string | null): string {
  if (!iso) return 'never';
  const secs = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.round(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.round(secs / 3600)}h ago`;
  return `${Math.round(secs / 86400)}d ago`;
}

export function Portals() {
  const [portals, setPortals] = useState<Portal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState<Record<string, boolean>>({});
  const [results, setResults] = useState<Record<string, TestResult>>({});
  const [open, setOpen] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    api
      .portals()
      .then((r) => setPortals(r.portals))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const toggle = async (p: Portal) => {
    try {
      const r = await api.togglePortal(p.id, !p.enabled);
      setPortals((prev) => prev.map((x) => (x.id === p.id ? r.portal : x)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Toggle failed');
    }
  };

  const runTest = async (p: Portal) => {
    setTesting((t) => ({ ...t, [p.id]: true }));
    setOpen(p.id);
    try {
      const r = await api.testPortal(p.id);
      setResults((res) => ({ ...res, [p.id]: r }));
    } catch (e) {
      setResults((res) => ({
        ...res,
        [p.id]: { ok: false, portal: p.name, source: p.source, durationMs: 0, error: e instanceof Error ? e.message : 'Test failed' },
      }));
    } finally {
      setTesting((t) => ({ ...t, [p.id]: false }));
    }
  };

  if (loading) return <div className="muted pad">Loading portals…</div>;

  return (
    <section>
      <div className="section-head">
        <h2>Portals <span className="count">{portals.length}</span></h2>
        <button className="btn ghost" onClick={load}>Refresh</button>
      </div>
      {error && <div className="error">{error}</div>}
      <div className="card">
        <table className="grid">
          <thead>
            <tr>
              <th>Portal</th>
              <th>Source</th>
              <th>Status</th>
              <th>Last run</th>
              <th>Fails</th>
              <th>Enabled</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {portals.map((p) => (
              <Fragment key={p.id}>
                <tr className={p.enabled ? '' : 'row-off'}>
                  <td>
                    <strong>{p.name}</strong>
                  </td>
                  <td><code>{p.source}</code></td>
                  <td>
                    <span className={`pill ${p.status}`}>{p.status}</span>
                  </td>
                  <td className="muted">{fmtAgo(p.lastRunAt)}</td>
                  <td className={p.failureCount ? 'warn' : 'muted'}>{p.failureCount}</td>
                  <td>
                    <label className="switch">
                      <input type="checkbox" checked={p.enabled} onChange={() => toggle(p)} />
                      <span className="slider" />
                    </label>
                  </td>
                  <td>
                    <button className="btn small" onClick={() => runTest(p)} disabled={testing[p.id]}>
                      {testing[p.id] ? 'Testing…' : 'Run test'}
                    </button>
                  </td>
                </tr>
                {open === p.id && (
                  <tr className="detail-row">
                    <td colSpan={7}>
                      <TestPanel result={results[p.id]} busy={testing[p.id]} onClose={() => setOpen(null)} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function TestPanel({ result, busy, onClose }: { result?: TestResult; busy: boolean; onClose: () => void }) {
  if (busy && !result) return <div className="muted pad">Fetching from source (no LLM, no writes)…</div>;
  if (!result) return null;
  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          {result.ok ? (
            <span className="ok">✓ {result.count} job(s)</span>
          ) : (
            <span className="err-text">✗ failed</span>
          )}{' '}
          <span className="muted">from {result.source} · {result.durationMs} ms · fetch-only</span>
        </div>
        <button className="btn ghost small" onClick={onClose}>Close</button>
      </div>
      {result.error && <div className="error">{result.error}</div>}
      {result.ok && result.jobs && result.jobs.length === 0 && (
        <div className="muted">No jobs matched the source prefilter (this can be normal).</div>
      )}
      {result.ok && result.jobs && result.jobs.length > 0 && (
        <ul className="joblist">
          {result.jobs.map((j, i) => (
            <li key={i}>
              <a href={j.url} target="_blank" rel="noreferrer">{j.title}</a>
              <span className="meta">
                {[j.company, j.location].filter(Boolean).join(' · ') || 'location unknown'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
