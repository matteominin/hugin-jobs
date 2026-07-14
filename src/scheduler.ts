import { ObjectId } from 'mongodb';
import { config } from './config.js';
import { portals as portalsCol } from './db.js';
import { JobRunner } from './runner.js';
import { portalsSeed } from './seed.js';
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
    // stop rescheduling a portal that auto-disabled after repeated failures
    if (stopped || runner.disabled) return;
    const timer = setTimeout(loop, portal.intervalSeconds * 1000);
    timers.add(timer);
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
      `[scheduler] running ${enabled.length} portal(s) once${config.dryRun ? ' (dry-run)' : ''}`,
    );
    const settled = await Promise.allSettled(
      enabled.map((portal) => new JobRunner(portal, getSource(portal)).run()),
    );
    for (let i = 0; i < settled.length; i++) {
      const result = settled[i];
      if (result.status === 'rejected') {
        console.error(
          `[${enabled[i].name}] run failed:`,
          result.reason instanceof Error ? result.reason.message : result.reason,
        );
      }
    }
    return;
  }
  console.log(`[scheduler] starting ${enabled.length} portal(s)`);
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
