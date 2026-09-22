// Two independent login surfaces on one signed session cookie (see
// server/authSession.js — a stateless JWT, not server-side memory, so this
// works identically on serverless):
//   role: 'client' + tenantId  -> the dashboard, scoped to that tenant
//   role: 'admin'              -> the tenant-management console
// A client session can never reach admin routes and vice versa.

import { verifyPassword } from './crypto.js';

export function requireClient(req, res, next) {
  if (req.authSession?.role === 'client' && req.authSession.tenantId) return next();
  res.status(401).json({ error: { message: 'Sign in to continue.', status: 401 } });
}

export function requireAdmin(req, res, next) {
  if (req.authSession?.role === 'admin') return next();
  res.status(401).json({ error: { message: 'Admin sign-in required.', status: 401 } });
}

// No hardcoded fallback on purpose: if ADMIN_USERNAME/ADMIN_PASSWORD aren't
// set in .env, admin login is refused outright rather than defaulting to a
// well-known username/password.
export function checkAdminCredentials(username, password) {
  const expectedUser = process.env.ADMIN_USERNAME;
  const expectedPass = process.env.ADMIN_PASSWORD;
  if (!expectedUser || !expectedPass) return false;
  return username === expectedUser && password === expectedPass;
}

export { verifyPassword };
