// Stateless session: a signed JWT in an httpOnly cookie, not server-side
// memory. This is required for serverless (Vercel) — each request can land
// on a different function instance with no shared memory, so express-session's
// default MemoryStore silently breaks in production (every login would look
// logged-out on the next request). A signed cookie has no server-side state
// to lose, so it works identically locally and serverless.

import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';

const COOKIE_NAME = 'sv.sid';
const MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7 days

// No hardcoded fallback secret: falls back to a random value generated once
// per process if SESSION_SECRET isn't set. Fine for local dev; on Vercel,
// each cold start would get a different random secret and invalidate
// existing sessions, so SESSION_SECRET must be set in the project's env vars
// for production.
const SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
if (!process.env.SESSION_SECRET) {
  console.warn('  ⚠ SESSION_SECRET not set — using a random value for this process (fine for local dev only).');
}

/** Sign a session payload ({ role, tenantId? }) and set it as the session cookie. */
export function setSessionCookie(res, payload) {
  const token = jwt.sign(payload, SECRET, { expiresIn: MAX_AGE_SECONDS });
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: MAX_AGE_SECONDS * 1000,
    path: '/',
  });
}

export function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

/** Reads and verifies the session cookie onto req.authSession ({role, tenantId?} or null). */
export function readSession(req, _res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) {
    req.authSession = null;
    return next();
  }
  try {
    req.authSession = jwt.verify(token, SECRET);
  } catch {
    req.authSession = null;
  }
  next();
}
