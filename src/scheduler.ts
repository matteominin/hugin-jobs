import { ObjectId } from 'mongodb';
import { config } from './config.js';
import { portals as portalsCol, settings as settingsCol } from './db.js';
import { JobRunner } from './runner.js';
import { portalsSeed } from './seed.js';
import { getSource } from './sources/index.js';
import type { ActiveHours, Portal } from './types.js';
import {
  describeActiveHours,
  isWithinActiveHours,
  msUntilActive,
  resolveActiveHours,
} from './util/activeHours.js';
import { Semaphore } from './util/semaphore.js';

let stopped = false;
const timers = new Set<NodeJS.Timeout>();

/**
 * Every portal run in the process goes through here, so at most
 * `config.portalConcurrency` cycles are ever in flight. Each portal keeps its
 * own interval; the gate only decides who gets to run when two come due at once.
 */
const gate = new Semaphore(config.portalConcurrency);

/** Run one cycle through the gate, logging the wait if it had to queue. */
async function runGated(portal: Portal, runner: JobRunner): Promise<void> {
  const tag = `[${portal.name}]`;
  if (gate.queued > 0) console.log(`${tag} queued behind ${gate.queued} portal(s)`);
  await gate.run(async () => {
    if (stopped) return;
    try {
      await runner.run();
    } catch (err) {
      console.error(`${tag} run failed:`, err instanceof Error ? err.message : err);
    }
  });
}

/**
 * Read the window fresh every cycle rather than at startup, so editing the
 * settings doc takes effect without a restart. A settings read that fails must
 * not silently stop the service overnight, so it falls back to the defaults.
 */
async function currentActiveHours(): Promise<ActiveHours> {
  try {
    const s = await settingsCol().findOne({});
    return resolveActiveHours(s?.activeHours);
  } catch (err) {
    console.error(
      '[scheduler] could not read activeHours, using defaults:',
      err instanceof Error ? err.message : err,
    );
    return resolveActiveHours(undefined);
  }
}

function reschedule(loop: () => void, delayMs: number): void {
  const timer = setTimeout(loop, delayMs);
  timers.add(timer);
}

/**
 * Self-rescheduling loop per portal: run, then schedule the next run only after
 * the current one finishes, so cycles never overlap. Errors are caught so one
 * portal failing never stops the others.
 *
 * The interval is measured from the end of a cycle, so time spent waiting on the
 * gate delays the next run rather than stacking up behind it.
 *
 * Outside the configured active window the cycle is skipped entirely (no fetch,
 * no LLM, no Telegram) and the loop sleeps until the window reopens. Dry-runs
 * ignore the window: they never write or notify, so it would only get in the way.
 */
function schedulePortal(portal: Portal): void {
  const runner = new JobRunner(portal, getSource(portal));
  const loop = async () => {
    if (stopped) return;

    const hours = await currentActiveHours();
    if (!config.dryRun && !isWithinActiveHours(new Date(), hours)) {
      const waitMs = msUntilActive(new Date(), hours);
      console.log(
        `[${portal.name}] outside active window (${describeActiveHours(hours)}) — next run in ${(waitMs / 3600000).toFixed(1)}h`,
      );
      reschedule(loop, waitMs);
      return;
    }

    await runGated(portal, runner);
    // stop rescheduling a portal that auto-disabled after repeated failures
    if (stopped || runner.disabled) return;
    reschedule(loop, portal.intervalSeconds * 1000);
  };
  void loop();
}

export async function startScheduler(): Promise<void> {
  const enabled = await loadEnabledPortals();
  if (enabled.length === 0) {
    console.warn('[scheduler] no enabled portals — run `npm run seed`');
    return;
  }
  if (config.runOnce) {
    console.log(
      `[scheduler] running ${enabled.length} portal(s) once, ${config.portalConcurrency} at a time${config.dryRun ? ' (dry-run)' : ''}`,
    );
    await Promise.all(
      enabled.map((portal) => runGated(portal, new JobRunner(portal, getSource(portal)))),
    );
    return;
  }
  console.log(
    `[scheduler] starting ${enabled.length} portal(s), ${config.portalConcurrency} at a time, active ${describeActiveHours(await currentActiveHours())}`,
  );
  for (const portal of enabled) schedulePortal(portal);
}

async function loadEnabledPortals(): Promise<Portal[]> {
  const enabled = await portalsCol().find({ enabled: true }).toArray();
  if (!config.dryRun) return filterPortals(enabled);

  const byName = new Set(enabled.map((portal) => portal.name));
  const seedOnly = portalsSeed
    .filter((portal) => portal.enabled && !byName.has(portal.name))
    .map((portal) => ({ ...portal, _id: new ObjectId() }));

  if (seedOnly.length > 0) {
    console.log(`[scheduler] dry-run: adding ${seedOnly.length} seed-only portal(s) in memory`);
  }
  return filterPortals([...enabled, ...seedOnly]);
}

function filterPortals(portals: Portal[]): Portal[] {
  if (config.portalFilter.length === 0) return portals;
  const sourceKeys = new Set(portals.map((portal) => portal.source.toLowerCase()));

  const filtered = portals.filter((portal) => {
    const source = portal.source.toLowerCase();
    const name = portal.name.toLowerCase();
    return config.portalFilter.some((needle) => {
      if (sourceKeys.has(needle)) return source === needle;
      return name.includes(needle);
    });
  });

  console.log(
    `[scheduler] portal filter ${config.portalFilter.join(', ')} matched ${filtered.length}/${portals.length} portal(s)`,
  );
  return filtered;
}

export function stopScheduler(): void {
  stopped = true;
  for (const t of timers) clearTimeout(t);
  timers.clear();
}
