import { config } from './config.js';
import type { Job } from './types.js';

/** Send a message to every seeded chat id. No-op (with warning) if unconfigured. */
export async function notify(job: Job): Promise<void> {
  if (!config.telegramBotToken || config.telegramChatIds.length === 0) {
    console.warn('[telegram] skipped — bot token or chat ids not configured');
    return;
  }

  const e = job.enrichment;
  const company = e?.company ?? job.company;
  const location = e?.location ?? job.location;
  const meta = [
    e?.seniority,
    e?.workMode && e.workMode !== 'unknown' ? e.workMode : undefined,
    e?.salary,
  ].filter(Boolean);

  const text = [
    `🟢 <b>Job match</b> (${Math.round((job.match?.score ?? 0) * 100)}%)`,
    `<b>${escapeHtml(job.title)}</b>`,
    company && escapeHtml(company),
    location && `📍 ${escapeHtml(location)}`,
    meta.length > 0 && meta.map((m) => escapeHtml(m!)).join(' · '),
    e?.techStack?.length && `🛠 ${e.techStack.map(escapeHtml).join(', ')}`,
    e?.tags?.length && `🏷 ${e.tags.map(escapeHtml).join(', ')}`,
    job.match?.reasoning && `\n${escapeHtml(job.match.reasoning)}`,
    `\n${job.url}`,
  ]
    .filter(Boolean)
    .join('\n');

  const url = `https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`;
  for (const chatId of config.telegramChatIds) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: false,
      }),
    });
    if (!res.ok) {
      console.error(`[telegram] send to ${chatId} failed: ${res.status} ${await res.text()}`);
    }
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
