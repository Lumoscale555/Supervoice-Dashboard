// Vercel serverless entry point. Vercel treats a default-exported Express app
// as a request handler directly — no adapter needed. vercel.json rewrites
// every /api/* request to this one function; Express's own routes (already
// written as full /api/... paths in server/index.js) handle the rest.
export { default } from '../server/index.js';
