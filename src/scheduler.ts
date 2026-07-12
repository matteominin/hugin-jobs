import { portals as portalsCol } from './db.js';
import { JobRunner } from './runner.js';
import { getSource } from './sources/index.js';
import type { Portal } from './types.js';

let stopped = false;
const timers = new Set<NodeJS.Timeout>();

/**
 * Self-rescheduling loop per portal: run, then schedule the next run only after
 * the current one finishes, so cycles never overlap. Errors are caught so one
 * portal failing never stops the others.
 */
function schedulePortal(portal: Portal): void {
  const runner = new JobRunner(portal, getSource(portal));
  const loop = async () => {
    if (stopped) return;
    try {
      await runner.run();
    } catch (err) {
      console.error(`[${portal.name}] run failed:`, err instanceof Error ? err.message : err);
    }
    if (stopped) return;
    const timer = setTimeout(loop, portal.intervalSeconds * 1000);
    timers.add(timer);
  };
  void loop();
}

export async function startScheduler(): Promise<void> {
  const enabled = await portalsCol().find({ enabled: true }).toArray();
  if (enabled.length === 0) {
    console.warn('[scheduler] no enabled portals — run `npm run seed`');
    return;
  }
  console.log(`[scheduler] starting ${enabled.length} portal(s)`);
  for (const portal of enabled) schedulePortal(portal);
}

export function stopScheduler(): void {
  stopped = true;
  for (const t of timers) clearTimeout(t);
  timers.clear();
}
