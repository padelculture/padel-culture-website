// Shared helpers for Razorpay payments. No npm packages: Node's crypto + fetch only.
// Vercel env vars needed:
//   RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET       (Razorpay Dashboard → Account & Settings → API Keys)
//   RAZORPAY_WEBHOOK_SECRET                     (Razorpay Dashboard → Webhooks, optional but recommended)
//   FIREBASE_SERVICE_ACCOUNT                    (Firebase → Project settings → Service accounts → Generate key; paste the whole JSON)
import crypto from 'node:crypto';

export const PROJECT = 'padel-culture';
const API_KEY = 'AIzaSyBa2qjnxw2OQtbgeGpacO5mF8xde1nu_jg'; // public web key
const FS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

export function send(res, code, body) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

export async function readBody(req, { raw = false } = {}) {
  // For webhooks we need the exact bytes, so don't touch Vercel's parsed req.body.
  if (!raw && req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const text = Buffer.concat(chunks).toString('utf8');
  req.rawBody = text;
  try { return JSON.parse(text || '{}'); } catch { return {}; }
}

// Who is calling? Checks the Firebase ID token with Google and returns the uid.
export async function userFromRequest(req) {
  const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
  if (!m) return null;
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: m[1] }),
  });
  if (!r.ok) return null;
  const u = (await r.json()).users?.[0];
  return u ? { uid: u.localId, phone: u.phoneNumber || '' } : null;
}

// Service-account access token for Firestore (server writes bypass the client rules).
let cached = { token: '', exp: 0 };
async function adminToken() {
  if (cached.token && cached.exp > Date.now() + 60e3) return cached.token;
  const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
  if (!sa.client_email || !sa.private_key) throw new Error('FIREBASE_SERVICE_ACCOUNT is not set');
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/datastore', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })}`;
  const sig = crypto.createSign('RSA-SHA256').update(unsigned).sign(sa.private_key.replace(/\\n/g, '\n'), 'base64url');
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${sig}` }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('Could not get a Firestore token');
  cached = { token: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return cached.token;
}

const val = (v) => v == null ? undefined : v.stringValue ?? v.booleanValue ?? (v.integerValue != null ? Number(v.integerValue) : v.doubleValue);
export async function getBooking(id) {
  const r = await fetch(`${FS}/bookings/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${await adminToken()}` } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error('Could not read the booking');
  const f = (await r.json()).fields || {};
  return Object.fromEntries(Object.entries(f).map(([k, v]) => [k, val(v)]));
}

export async function markPaid(bookingId, p) {
  const fields = {
    paid: { booleanValue: true },
    status: { stringValue: 'confirmed' },
    payMethod: { stringValue: 'razorpay' },
    paymentId: { stringValue: p.paymentId },
    orderId: { stringValue: p.orderId },
    amountPaid: { integerValue: String(p.amount) },
    paidAt: { timestampValue: new Date().toISOString() },
  };
  const mask = Object.keys(fields).map((k) => `updateMask.fieldPaths=${k}`).join('&');
  const r = await fetch(`${FS}/bookings/${encodeURIComponent(bookingId)}?${mask}&currentDocument.exists=true`, {
    method: 'PATCH', headers: { Authorization: `Bearer ${await adminToken()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }),
  });
  if (!r.ok) throw new Error('Could not mark the booking paid');
}

export async function razorpay(path, init = {}) {
  const auth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64');
  const r = await fetch(`https://api.razorpay.com/v1${path}`, { ...init, headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json', ...(init.headers || {}) } });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.description || 'Razorpay error');
  return j;
}

export const hmac = (secret, text) => crypto.createHmac('sha256', secret).update(text).digest('hex');
export const sameHex = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
export const configured = () => Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET && process.env.FIREBASE_SERVICE_ACCOUNT);

// Game prices come from the published site, never from the browser.
export async function gameInfo(req, gameId) {
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const r = await fetch(`https://${host}/games.json`);
  const list = r.ok ? await r.json() : [];
  return list.find((g) => g.id === gameId) || null;
}
