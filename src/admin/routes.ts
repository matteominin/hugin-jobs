import { Router } from 'express';
import { ObjectId } from 'mongodb';
import passport from 'passport';
import { jobs as jobsCol, portals as portalsCol } from '../db.js';
import { getSource } from '../sources/index.js';
import type { Portal } from '../types.js';
import { ensureAuthenticated, type SessionUser } from './auth.js';

export const api = Router();

// ---- auth ----

api.post('/login', (req, res, next) => {
  passport.authenticate('local', (err: unknown, user: SessionUser | false, info?: { message?: string }) => {
    if (err) return next(err);
    if (!user) return res.status(401).json({ error: info?.message ?? 'Invalid credentials' });
    req.logIn(user, (loginErr) => {
      if (loginErr) return next(loginErr);
      return res.json({ user });
    });
  })(req, res, next);
});

api.post('/logout', (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    req.session.destroy(() => res.json({ ok: true }));
  });
});

api.get('/me', (req, res) => {
  if (req.isAuthenticated?.()) return res.json({ user: req.user });
  res.status(401).json({ error: 'Not authenticated' });
});

// ---- everything below requires a session ----

api.use(ensureAuthenticated);

/** Serialize a portal into the shape the dashboard needs (no secrets involved). */
function portalView(p: Portal) {
  return {
    id: p._id?.toString(),
    name: p.name,
    source: p.source,
    company: p.company ?? null,
    enabled: p.enabled,
    status: p.status ?? 'running',
    intervalSeconds: p.intervalSeconds,
    lastRunAt: p.lastRunAt ?? null,
    failureCount: p.failureCount ?? 0,
  };
}

api.get('/portals', async (_req, res, next) => {
  try {
    const list = await portalsCol().find({}).sort({ name: 1 }).toArray();
    res.json({ portals: list.map(portalView) });
  } catch (err) {
    next(err);
  }
});

/** Toggle a portal on/off (and clear its failure counter when re-enabling). */
api.patch('/portals/:id', async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid portal id' });
    const { enabled } = req.body as { enabled?: unknown };
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'Body must be { enabled: boolean }' });
    }
    const update = enabled ? { enabled: true, failureCount: 0 } : { enabled: false };
    const updated = await portalsCol().findOneAndUpdate(
      { _id: id },
      { $set: update },
      { returnDocument: 'after' },
    );
    if (!updated) return res.status(404).json({ error: 'Portal not found' });
    res.json({ portal: portalView(updated) });
  } catch (err) {
    next(err);
  }
});

/**
 * Run a portal's source fetch-only, exactly like `dry-run:sources`: real HTTP to
 * the job board, no DB writes, no LLM, no Telegram. Returns the raw job list so an
 * admin can eyeball what a source (e.g. one under maintenance) is producing.
 */
api.post('/portals/:id/test', async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid portal id' });
    const portal = await portalsCol().findOne({ _id: id });
    if (!portal) return res.status(404).json({ error: 'Portal not found' });

    const started = Date.now();
    try {
      const raw = await getSource(portal).produce();
      res.json({
        ok: true,
        portal: portal.name,
        source: portal.source,
        durationMs: Date.now() - started,
        count: raw.length,
        jobs: raw.map((j) => ({
          title: j.title,
          url: j.url,
          location: j.location ?? null,
          company: j.company ?? null,
          description: j.description ? j.description.slice(0, 400) : null,
        })),
      });
    } catch (produceErr) {
      res.json({
        ok: false,
        portal: portal.name,
        source: portal.source,
        durationMs: Date.now() - started,
        error: produceErr instanceof Error ? produceErr.message : String(produceErr),
      });
    }
  } catch (err) {
    next(err);
  }
});

/** Notified jobs, newest first, with their portal name attached. */
api.get('/jobs', async (req, res, next) => {
  try {
    const limit = Math.min(500, Math.max(1, Number(req.query.limit ?? '100') || 100));
    const docs = await jobsCol()
      .find({ notified: true })
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();

    const portalNames = new Map(
      (await portalsCol().find({}).project({ name: 1 }).toArray()).map((p) => [
        p._id!.toString(),
        p.name as string,
      ]),
    );

    res.json({
      jobs: docs.map((j) => ({
        id: j._id?.toString(),
        title: j.title,
        url: j.url,
        company: j.enrichment?.company ?? j.company ?? null,
        location: j.enrichment?.location ?? j.location ?? null,
        portal: portalNames.get(j.portalId.toString()) ?? null,
        score: j.match?.score ?? null,
        reasoning: j.match?.reasoning ?? null,
        tags: j.enrichment?.tags ?? [],
        createdAt: j.createdAt,
      })),
    });
  } catch (err) {
    next(err);
  }
});

function parseId(raw: string): ObjectId | null {
  return ObjectId.isValid(raw) ? new ObjectId(raw) : null;
}
