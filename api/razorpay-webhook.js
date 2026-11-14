// Backup confirmation straight from Razorpay (covers players who close the window before returning).
// In Razorpay Dashboard → Webhooks: URL https://www.padelculture.in/api/razorpay-webhook, events: order.paid, secret = RAZORPAY_WEBHOOK_SECRET.
import { send, readBody, markPaid, hmac, sameHex } from './_lib/pay.js';

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  const body = await readBody(req, { raw: true });
  const raw = req.rawBody || '';
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !sameHex(hmac(secret, raw), req.headers['x-razorpay-signature'])) return send(res, 400, { error: 'Bad signature' });
  try {
    if (body.event === 'order.paid') {
      const order = body.payload?.order?.entity || {};
      const pay = body.payload?.payment?.entity || {};
      if (order.notes?.bookingId) await markPaid(order.notes.bookingId, { paymentId: pay.id || '', orderId: order.id, amount: order.amount_paid || order.amount });
    }
    send(res, 200, { ok: true });
  } catch (e) {
    console.error(e);
    send(res, 500, { error: 'retry' });
  }
}
