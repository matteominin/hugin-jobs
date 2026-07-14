import { jobs as jobsCol, portals as portalsCol } from './db.js';

const startedAt = new Date();

/** "3d 4h", "12m", "45s" — compact enough for a chat line. */
function humanDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

function ago(date: Date | undefined): string {
  if (!date) return 'never';
  return `${humanDuration(Date.now() - date.getTime())} ago`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * A human status snapshot, read straight from Mongo rather than from scheduler
 * memory: it stays true for whoever asks, and reports what actually got stored.
 */
export async function statusMessage(): Promise<string> {
  const all = await portalsCol().find({}).toArray();
  const enabled = all.filter((p) => p.enabled);
  const disabled = all.filter((p) => !p.enabled);
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [total, last24h, suitable, notified] = await Promise.all([
    jobsCol().countDocuments({}),
    jobsCol().countDocuments({ createdAt: { $gte: since } }),
    jobsCol().countDocuments({ 'match.suitable': true }),
    jobsCol().countDocuments({ notified: true }),
  ]);

  const lines = [
    `🟢 <b>hugin-jobs</b> — up ${humanDuration(Date.now() - startedAt.getTime())}`,
    '',
    `<b>Jobs</b>: ${total} stored · ${last24h} new in 24h · ${suitable} suitable · ${notified} notified`,
    '',
    `<b>Portals</b>: ${enabled.length} enabled${disabled.length > 0 ? `, ${disabled.length} disabled` : ''}`,
  ];

  const byRecency = [...enabled].sort(
    (a, b) => (b.lastRunAt?.getTime() ?? 0) - (a.lastRunAt?.getTime() ?? 0),
  );
  for (const portal of byRecency) {
    const flags = [
      portal.status === 'install' ? 'install' : null,
      (portal.failureCount ?? 0) > 0 ? `${portal.failureCount} fail(s)` : null,
    ].filter(Boolean);
    lines.push(
      `· ${escapeHtml(portal.name)} — ${ago(portal.lastRunAt)}${flags.length > 0 ? ` [${flags.join(', ')}]` : ''}`,
    );
  }

  if (disabled.length > 0) {
    lines.push('', `<b>Disabled</b>: ${disabled.map((p) => escapeHtml(p.name)).join(', ')}`);
  }

  return lines.join('\n');
}
