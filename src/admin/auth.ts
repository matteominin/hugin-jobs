import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

/** What we encode in the admin JWT (never the password hash). */
export interface TokenPayload {
  username: string;
}

/** Sign a bearer token for a verified admin. */
export function signToken(username: string): string {
  return jwt.sign({ username } satisfies TokenPayload, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn as jwt.SignOptions['expiresIn'],
  });
}

/**
 * Gate for API routes: require a valid `Authorization: Bearer <token>`. On
 * success the decoded admin is placed on res.locals.user. Stateless — no session
 * or DB lookup — which is what lets the frontend live on a different origin
 * (e.g. Firebase) from the API (e.g. Render).
 */
export const ensureAuthenticated: RequestHandler = (req, res, next) => {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  try {
    const payload = jwt.verify(token, config.jwtSecret) as TokenPayload;
    res.locals.user = { username: payload.username } satisfies TokenPayload;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
};
