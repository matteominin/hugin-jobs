import { config } from './config.js';
import type { Job } from './types.js';

/** Notify every seeded chat about a matched job. */
export async function notify(job: Job): Promise<void> {
  const company = job.enrichment?.company ?? job.company;
  const location = job.enrichment?.location ?? job.location;

  const title = `<b>${escapeHtml(job.title)}</b>`;
  const text = [
    company ? `${escapeHtml(company)} · ${title}` : title,
    location && `📍 ${escapeHtml(location)}`,
    job.url,
  ]
    .filter(Boolean)
    .join('\n');

  await sendMessage(text);
}

/** Alert every seeded chat that a portal was auto-disabled after repeated failures. */
export async function notifyPortalDisabled(portalName: string, reason: string): Promise<void> {
  await sendMessage(
    `⚠️ Portal <b>${escapeHtml(portalName)}</b> auto-disabled after repeated fetch failures.\n` +
      `Last error: ${escapeHtml(reason)}`,
  );
}

/** Send one HTML message to every seeded chat id. No-op (with warning) if unconfigured. */
async function sendMessage(text: string): Promise<void> {
  if (!config.telegramBotToken || config.telegramChatIds.length === 0) {
    console.warn('[telegram] skipped — bot token or chat ids not configured');
    return;
  }

  const url = `https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`;
  for (const chatId of config.telegramChatIds) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
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
