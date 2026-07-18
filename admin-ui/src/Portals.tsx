import { Fragment, useEffect, useMemo, useState } from 'react';
import { api, type Portal, type TestResult } from './api.ts';

function fmtAgo(iso: string | null): string {
  if (!iso) return 'never';
  const secs = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.round(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.round(secs / 3600)}h ago`;
  return `${Math.round(secs / 86400)}d ago`;
}

// A portal's health, derived from its flags — this is what the operator actually
// reasons about, so it drives the pill colour, the filter, and status sorting.
type State = 'active' | 'install' | 'failing' | 'disabled';

function portalState(p: Portal): State {
  if (!p.enabled) return 'disabled';
  if (p.status === 'install') return 'install';
  if (p.failureCount > 0) return 'failing';
  return 'active';
}

const STATE_LABEL: Record<State, string> = {
  active: 'Active',
  install: 'Installing',
  failing: 'Failing',
  disabled: 'Disabled',
};
// rank so "healthy → broken" is the natural ascending order
const STATE_RANK: Record<State, number> = { active: 0, install: 1, failing: 2, disabled: 3 };

type SortKey = 'name' | 'state' | 'lastRunAt' | 'failureCount';
const FILTERS: Array<State | 'all'> = ['all', 'active', 'install', 'failing', 'disabled'];

const PAGE_SIZES = [10, 12, 25, 50, 100];
const PAGE_SIZE_KEY = 'hugin_portals_pagesize';
function readPageSize(): number {
  const v = Number(localStorage.getItem(PAGE_SIZE_KEY));
  return PAGE_SIZES.includes(v) ? v : 12;
}

export function Portals() {
  const [portals, setPortals] = useState<Portal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState<Record<string, boolean>>({});
  const [results, setResults] = useState<Record<string, TestResult>>({});
  const [open, setOpen] = useState<string | null>(null);

  // view controls
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<State | 'all'>('all');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(readPageSize);

  const load = () => {
    setLoading(true);
    api
      .portals()
      .then((r) => setPortals(r.portals))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  // any change to the view resets to the first page
  useEffect(() => setPage(1), [q, filter, sortKey, sortDir, pageSize]);

  const changePageSize = (n: number) => {
    localStorage.setItem(PAGE_SIZE_KEY, String(n));
    setPageSize(n);
  };

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

  // count per state for the filter chips (from the search-filtered set, so the
  // numbers reflect what a chip would actually show)
  const counts = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const searched = needle
      ? portals.filter((p) =>
          [p.name, p.source, p.company].filter(Boolean).join(' ').toLowerCase().includes(needle),
        )
      : portals;
    const c: Record<string, number> = { all: searched.length, active: 0, install: 0, failing: 0, disabled: 0 };
    for (const p of searched) c[portalState(p)]++;
    return c;
  }, [portals, q]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rows = portals.filter((p) => {
      if (needle && ![p.name, p.source, p.company].filter(Boolean).join(' ').toLowerCase().includes(needle))
        return false;
      if (filter !== 'all' && portalState(p) !== filter) return false;
      return true;
    });
    const dir = sortDir === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
      let d = 0;
      switch (sortKey) {
        case 'name':
          d = a.name.localeCompare(b.name);
          break;
        case 'state':
          d = STATE_RANK[portalState(a)] - STATE_RANK[portalState(b)];
          break;
        case 'failureCount':
          d = a.failureCount - b.failureCount;
          break;
        case 'lastRunAt': {
          const ta = a.lastRunAt ? new Date(a.lastRunAt).getTime() : 0;
          const tb = b.lastRunAt ? new Date(b.lastRunAt).getTime() : 0;
          d = ta - tb;
          break;
        }
      }
      // stable tiebreak by name so equal keys keep a predictable order
      return (d || a.name.localeCompare(b.name)) * dir;
    });
    return rows;
  }, [portals, q, filter, sortKey, sortDir]);

  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  const current = Math.min(page, pageCount);
  const pageRows = visible.slice((current - 1) * pageSize, current * pageSize);

  const sortOn = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      // sensible default direction per column
      setSortDir(key === 'name' ? 'asc' : 'desc');
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

      <div className="toolbar">
        <input
          className="search"
          placeholder="Search name or source…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="segmented" role="group" aria-label="Filter by status">
          {FILTERS.map((f) => (
            <button
              key={f}
              className={filter === f ? 'seg active' : 'seg'}
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? 'All' : STATE_LABEL[f]}
              <span className="seg-count">{counts[f] ?? 0}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <table className="grid">
          <thead>
            <tr>
              <SortTh label="Portal" k="name" sortKey={sortKey} sortDir={sortDir} onSort={sortOn} />
              <th>Source</th>
              <SortTh label="Status" k="state" sortKey={sortKey} sortDir={sortDir} onSort={sortOn} />
              <SortTh label="Last run" k="lastRunAt" sortKey={sortKey} sortDir={sortDir} onSort={sortOn} />
              <SortTh label="Fails" k="failureCount" sortKey={sortKey} sortDir={sortDir} onSort={sortOn} />
              <th>Enabled</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={7} className="muted pad center-cell">No portals match these filters.</td>
              </tr>
            )}
            {pageRows.map((p) => {
              const state = portalState(p);
              return (
                <Fragment key={p.id}>
                  <tr className={p.enabled ? '' : 'row-off'}>
                    <td><strong>{p.name}</strong></td>
                    <td><code>{p.source}</code></td>
                    <td><span className={`pill ${state}`}>{STATE_LABEL[state]}</span></td>
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
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="pager">
        <div className="pager-left">
          <span className="muted">
            {visible.length === 0
              ? '0 portals'
              : `${(current - 1) * pageSize + 1}–${Math.min(current * pageSize, visible.length)} of ${visible.length}`}
          </span>
          <label className="page-size muted">
            Rows
            <select value={pageSize} onChange={(e) => changePageSize(Number(e.target.value))}>
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="pager-controls">
          <button className="btn ghost small" disabled={current <= 1} onClick={() => setPage(current - 1)}>
            ← Prev
          </button>
          <span className="muted">Page {current} / {pageCount}</span>
          <button className="btn ghost small" disabled={current >= pageCount} onClick={() => setPage(current + 1)}>
            Next →
          </button>
        </div>
      </div>
    </section>
  );
}

function SortTh({
  label,
  k,
  sortKey,
  sortDir,
  onSort,
}: {
  label: string;
  k: SortKey;
  sortKey: SortKey;
  sortDir: 'asc' | 'desc';
  onSort: (k: SortKey) => void;
}) {
  const active = sortKey === k;
  return (
    <th
      className={active ? 'sortable active' : 'sortable'}
      onClick={() => onSort(k)}
      aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      {label}
      <span className="sort-arrow">{active ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}</span>
    </th>
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
