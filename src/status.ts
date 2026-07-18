import { jobs as jobsCol, portals as portalsCol } from './db.js';
import type { Portal } from './types.js';

const startedAt = new Date();

/** How many portal lines fit in one /ping page. Small enough to scan at a glance and page through with buttons. */
const PAGE_SIZE = 12;

/** An inline keyboard row of {text, callback_data} buttons Telegram renders under the message. */
export interface InlineKeyboard {
  inline_keyboard: Array<Array<{ text: string; callback_data: string }>>;
}

/** A message plus the optional navigation keyboard that belongs with it. */
export interface StatusView {
  text: string;
  keyboard?: InlineKeyboard;
}

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

function portalFlags(portal: Portal): string {
  const flags = [
    portal.status === 'install' ? 'install' : null,
    (portal.failureCount ?? 0) > 0 ? `${portal.failureCount} fail(s)` : null,
  ].filter(Boolean);
  return flags.length > 0 ? ` [${flags.join(', ')}]` : '';
}

/**
 * A human status snapshot, read straight from Mongo rather than from scheduler
 * memory: it stays true for whoever asks, and reports what actually got stored.
 *
 * `/ping`            → summary + first page of portals
 * `/ping 2`          → a later page of the portal list
 * `/ping <company>`  → detail for the portals whose name matches
 */
export async function statusMessage(arg?: string): Promise<StatusView> {
  const query = arg?.trim();
  if (query && !/^\d+$/.test(query)) return { text: await companyStatus(query) };
  const page = query ? Math.max(1, parseInt(query, 10)) : 1;
  return overviewStatus(page);
}

/** Prev/Next buttons for the overview, or nothing when it all fits on one page. */
function navKeyboard(current: number, pageCount: number): InlineKeyboard | undefined {
  if (pageCount <= 1) return undefined;
  const row: InlineKeyboard['inline_keyboard'][number] = [];
  if (current > 1) row.push({ text: '⬅️ Prev', callback_data: `ping:${current - 1}` });
  if (current < pageCount) row.push({ text: 'Next ➡️', callback_data: `ping:${current + 1}` });
  return { inline_keyboard: [row] };
}

/** Summary header plus one page of the enabled-portal list. */
async function overviewStatus(page: number): Promise<StatusView> {
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

  const byRecency = [...enabled].sort(
    (a, b) => (b.lastRunAt?.getTime() ?? 0) - (a.lastRunAt?.getTime() ?? 0),
  );
  const pageCount = Math.max(1, Math.ceil(byRecency.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const slice = byRecency.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  const lines = [
    `🟢 <b>hugin-jobs</b> — up ${humanDuration(Date.now() - startedAt.getTime())}`,
    '',
    `<b>Jobs</b>: ${total} stored · ${last24h} new in 24h · ${suitable} suitable · ${notified} notified`,
    '',
    `<b>Portals</b>: ${enabled.length} enabled${disabled.length > 0 ? `, ${disabled.length} disabled` : ''}`,
  ];

  for (const portal of slice) {
    lines.push(`· ${escapeHtml(portal.name)} — ${ago(portal.lastRunAt)}${portalFlags(portal)}`);
  }

  if (pageCount > 1) {
    lines.push('', `Page ${current}/${pageCount}`);
  }

  if (current === pageCount && disabled.length > 0) {
    lines.push('', `<b>Disabled</b>: ${disabled.map((p) => escapeHtml(p.name)).join(', ')}`);
  }

  return { text: lines.join('\n'), keyboard: navKeyboard(current, pageCount) };
}

/** Detail for the portal(s) whose name contains `query` (case-insensitive). */
async function companyStatus(query: string): Promise<string> {
  const all = await portalsCol().find({}).toArray();
  const needle = query.toLowerCase();
  const matches = all.filter((p) => p.name.toLowerCase().includes(needle));

  if (matches.length === 0) {
    return `No portal matches “${escapeHtml(query)}”. Try /ping for the full list.`;
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const lines: string[] = [];

  for (const portal of matches) {
    const [total, last24h, suitable, notified] = await Promise.all([
      jobsCol().countDocuments({ portalId: portal._id }),
      jobsCol().countDocuments({ portalId: portal._id, createdAt: { $gte: since } }),
      jobsCol().countDocuments({ portalId: portal._id, 'match.suitable': true }),
      jobsCol().countDocuments({ portalId: portal._id, notified: true }),
    ]);

    lines.push(
      `${portal.enabled ? '🟢' : '⚪️'} <b>${escapeHtml(portal.name)}</b>${portalFlags(portal)}`,
      `Last run: ${ago(portal.lastRunAt)} · every ${humanDuration(portal.intervalSeconds * 1000)}`,
      `Jobs: ${total} stored · ${last24h} new in 24h · ${suitable} suitable · ${notified} notified`,
      '',
    );
  }

  return lines.join('\n').trimEnd();
}
