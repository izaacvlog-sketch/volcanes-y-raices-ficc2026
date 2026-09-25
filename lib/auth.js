import { createHash, timingSafeEqual } from 'node:crypto';

// Where the current edition lives in Vercel Blob. Every upload overwrites it.
export const PDF_PATHNAME = 'revista/actual.pdf';

// Compare the typed password with ADMIN_PASSWORD without leaking timing information.
export function passwordOk(candidate) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || typeof candidate !== 'string' || candidate.length === 0) return false;
  const a = createHash('sha256').update(candidate).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body) {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return {};
}
