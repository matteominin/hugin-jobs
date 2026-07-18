import bcrypt from 'bcryptjs';
import type { RequestHandler } from 'express';
import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import { adminUsers } from '../db.js';

/** The shape kept in the session — never the password hash. */
export interface SessionUser {
  username: string;
}

/**
 * Wire Passport with a single local (username + password) strategy that checks
 * the bcrypt hash in the adminUsers collection. Only the username is serialized
 * into the session cookie; every request re-confirms the account still exists.
 */
export function configurePassport(): void {
  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        const user = await adminUsers().findOne({ username });
        if (!user) return done(null, false, { message: 'Invalid credentials' });
        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return done(null, false, { message: 'Invalid credentials' });
        return done(null, { username: user.username } satisfies SessionUser);
      } catch (err) {
        return done(err);
      }
    }),
  );

  passport.serializeUser((user, done) => {
    done(null, (user as SessionUser).username);
  });

  passport.deserializeUser(async (username: string, done) => {
    try {
      const user = await adminUsers().findOne({ username });
      if (!user) return done(null, false);
      done(null, { username: user.username } satisfies SessionUser);
    } catch (err) {
      done(err);
    }
  });
}

/** Gate for API routes: 401 unless a valid session is present. */
export const ensureAuthenticated: RequestHandler = (req, res, next) => {
  if (req.isAuthenticated?.()) return next();
  res.status(401).json({ error: 'Not authenticated' });
};
