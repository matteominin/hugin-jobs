import { useEffect, useState } from 'react';
import { api, type NotifiedJob } from './api.ts';

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function Jobs() {
  const [jobs, setJobs] = useState<NotifiedJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');

  const load = () => {
    setLoading(true);
    api
      .jobs()
      .then((r) => setJobs(r.jobs))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const needle = q.trim().toLowerCase();
  const shown = needle
    ? jobs.filter((j) =>
        [j.title, j.company, j.location, j.portal, ...j.tags]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(needle),
      )
    : jobs;

  if (loading) return <div className="muted pad">Loading jobs…</div>;

  return (
    <section>
      <div className="section-head">
        <h2>Notified jobs <span className="count">{jobs.length}</span></h2>
        <div className="row-gap">
          <input className="search" placeholder="Filter…" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn ghost" onClick={load}>Refresh</button>
        </div>
      </div>
      {error && <div className="error">{error}</div>}
      {shown.length === 0 ? (
        <div className="card muted pad">No notified jobs yet.</div>
      ) : (
        <div className="joblist-cards">
          {shown.map((j) => (
            <article className="card job" key={j.id}>
              <div className="job-top">
                <a href={j.url} target="_blank" rel="noreferrer" className="job-title">
                  {j.title}
                </a>
                {j.score != null && <span className="score">{(j.score * 100).toFixed(0)}%</span>}
              </div>
              <div className="job-meta">
                {[j.company, j.location, j.portal].filter(Boolean).join(' · ')}
                <span className="muted"> · {fmtDate(j.createdAt)}</span>
              </div>
              {j.tags.length > 0 && (
                <div className="tags">
                  {j.tags.map((t) => (
                    <span className="tag" key={t}>{t}</span>
                  ))}
                </div>
              )}
              {j.reasoning && <p className="reasoning">{j.reasoning}</p>}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
