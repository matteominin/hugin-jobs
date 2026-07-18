import { config } from './config.js';
import { statusMessage, type InlineKeyboard } from './status.js';
import type { Job } from './types.js';

interface TelegramUpdate {
  update_id: number;
  message?: { text?: string; chat?: { id: number | string } };
  callback_query?: {
    id: string;
    data?: string;
    message?: { message_id: number; chat?: { id: number | string } };
  };
}

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
  if (config.dryRun) {
    console.warn(`[telegram] dry-run skipped:\n${text}`);
    return;
  }

  if (!config.telegramBotToken || config.telegramChatIds.length === 0) {
    console.warn('[telegram] skipped — bot token or chat ids not configured');
    return;
  }

  for (const chatId of config.telegramChatIds) await sendTo(chatId, text);
}

/** Send one HTML message to a single chat, optionally with an inline keyboard. */
async function sendTo(chatId: string, text: string, keyboard?: InlineKeyboard): Promise<void> {
  const res = await api('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    reply_markup: keyboard,
  });
  if (!res.ok) {
    console.error(`[telegram] send to ${chatId} failed: ${res.status} ${await res.text()}`);
  }
}

/** Replace an existing message in place — used when a nav button flips the page. */
async function editMessage(
  chatId: string,
  messageId: number,
  text: string,
  keyboard?: InlineKeyboard,
): Promise<void> {
  const res = await api('editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    reply_markup: keyboard,
  });
  if (!res.ok) {
    const body = await res.text();
    // Tapping the same page again is a harmless no-op, not an error worth logging.
    if (!body.includes('message is not modified')) {
      console.error(`[telegram] edit ${chatId} failed: ${res.status} ${body}`);
    }
  }
}

/** Acknowledge a button tap so Telegram stops showing the loading spinner. */
async function answerCallback(callbackId: string): Promise<void> {
  const res = await api('answerCallbackQuery', { callback_query_id: callbackId });
  if (!res.ok) console.error(`[telegram] answerCallbackQuery failed: ${res.status}`);
}

function api(method: string, body: unknown, signal?: AbortSignal): Promise<Response> {
  return fetch(`https://api.telegram.org/bot${config.telegramBotToken}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
}

async function call<T>(method: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await api(method, body, signal);
  const json = (await res.json()) as { ok: boolean; result?: T; description?: string };
  if (!res.ok || !json.ok) throw new Error(`${method}: ${res.status} ${json.description ?? ''}`);
  return json.result as T;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ------------------------------------------------------------------ commands */

const HELP =
  'Commands:\n' +
  '/ping — service + portal health\n' +
  '/ping <n> — page n of the portal list\n' +
  '/ping <company> — status for one company';

let polling = false;
/** in-flight long poll, so shutdown doesn't wait out the 30s timeout */
let inFlight: AbortController | null = null;

/**
 * Listen for commands via getUpdates long-polling. Polling (rather than a
 * webhook) keeps this working wherever the service runs: it needs no public URL
 * and no inbound port, only the bot token we already have.
 *
 * Long-polling and a webhook are mutually exclusive per bot — if a webhook was
 * ever set on this token, getUpdates 409s until it is deleted.
 */
export function startTelegramCommands(): void {
  if (config.dryRun || config.runOnce) return;
  if (!config.telegramBotToken) {
    console.warn('[telegram] command listener off — no bot token configured');
    return;
  }
  polling = true;
  void pollLoop();
}

export function stopTelegramCommands(): void {
  polling = false;
  inFlight?.abort();
}

async function pollLoop(): Promise<void> {
  let offset: number;
  try {
    offset = await skipBacklog();
    await call('setMyCommands', {
      commands: [{ command: 'ping', description: 'Service + portal health' }],
    });
  } catch (err) {
    console.error('[telegram] command listener failed to start:', message(err));
    polling = false;
    return;
  }
  console.log('[telegram] command listener polling for /ping');

  while (polling) {
    try {
      inFlight = new AbortController();
      const updates = await call<TelegramUpdate[]>(
        'getUpdates',
        { offset, timeout: 30, allowed_updates: ['message', 'callback_query'] },
        inFlight.signal,
      );
      for (const update of updates) {
        // advance first: a command we can't answer must not be retried forever
        offset = update.update_id + 1;
        try {
          await handleUpdate(update);
        } catch (err) {
          console.error('[telegram] handling update failed:', message(err));
        }
      }
    } catch (err) {
      if (!polling) return;
      console.error('[telegram] poll failed, retrying in 5s:', message(err));
      await new Promise((r) => setTimeout(r, 5000));
    } finally {
      inFlight = null;
    }
  }
}

/**
 * Telegram queues updates for ~24h, so a restart would otherwise replay every
 * ping sent while we were down. Acknowledge the backlog and start after it.
 */
async function skipBacklog(): Promise<number> {
  const [last] = await call<TelegramUpdate[]>('getUpdates', { offset: -1, timeout: 0 });
  return last ? last.update_id + 1 : 0;
}

async function handleUpdate(update: TelegramUpdate): Promise<void> {
  if (update.callback_query) return handleCallback(update.callback_query);

  const text = update.message?.text?.trim();
  const chatId = update.message?.chat?.id;
  if (!text || chatId === undefined) return;

  const chat = String(chatId);
  // Same allow-list we notify: the bot's id is public, so anyone can message it.
  if (!config.telegramChatIds.includes(chat)) {
    console.warn(`[telegram] ignored "${text.slice(0, 32)}" from unknown chat ${chat}`);
    return;
  }

  // "/ping@hugin_bot Acme" → command "/ping", arg "Acme"
  const [head, ...rest] = text.split(/\s+/);
  const command = head.split('@')[0].toLowerCase();
  const arg = rest.join(' ').trim() || undefined;
  switch (command) {
    case '/ping': {
      const view = await statusMessage(arg);
      await sendTo(chat, view.text, view.keyboard);
      break;
    }
    case '/start':
    case '/help':
      await sendTo(chat, HELP);
      break;
    default:
      console.log(`[telegram] unknown command ${command} from ${chat}`);
  }
}

/** A Prev/Next tap on the /ping overview: edit the message in place to the new page. */
async function handleCallback(cb: NonNullable<TelegramUpdate['callback_query']>): Promise<void> {
  const chatId = cb.message?.chat?.id;
  const messageId = cb.message?.message_id;
  try {
    if (chatId === undefined || messageId === undefined) return;
    const chat = String(chatId);
    if (!config.telegramChatIds.includes(chat)) {
      console.warn(`[telegram] ignored callback from unknown chat ${chat}`);
      return;
    }
    const match = /^ping:(\d+)$/.exec(cb.data ?? '');
    if (!match) return;
    const view = await statusMessage(match[1]);
    await editMessage(chat, messageId, view.text, view.keyboard);
  } finally {
    // Always answer, even on ignored taps, so the client's spinner clears.
    await answerCallback(cb.id);
  }
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
