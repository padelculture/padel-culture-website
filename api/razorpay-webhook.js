// Backup confirmation straight from Razorpay (covers players who close the window before returning).
// In Razorpay Dashboard → Webhooks: URL https://www.padelculture.in/api/razorpay-webhook, events: order.paid, secret = RAZORPAY_WEBHOOK_SECRET.
import { send, readBody, confirmPaidBooking, hmac, sameHex, gameInfo } from './_lib/pay.js';

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
      const n = order.notes || {};
      if (n.gameId && n.uid) {
        const game = await gameInfo(req, n.gameId);
        const amount = order.amount_paid || order.amount;
        await confirmPaidBooking({ gameId: n.gameId, uid: n.uid, spots: game?.spots ?? 99, reserved: game?.reserved || 0, paymentId: pay.id || '', orderId: order.id, amount, full: amount >= Number(n.price || 0) * 100 });
      }
    }
    send(res, 200, { ok: true });
  } catch (e) {
    console.error(e);
    send(res, 500, { error: 'retry' });
  }
}
