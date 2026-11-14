// Confirms a payment after Razorpay Checkout succeeds, then marks the booking paid.
// POST { orderId, paymentId, signature } with Authorization: Bearer <Firebase ID token>.
import { send, readBody, userFromRequest, razorpay, markPaid, hmac, sameHex, configured } from './_lib/pay.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  if (!configured()) return send(res, 503, { error: 'Online payment is not switched on yet.' });
  try {
    const user = await userFromRequest(req);
    if (!user) return send(res, 401, { error: 'Please log in again.' });
    const { orderId, paymentId, signature } = await readBody(req);
    if (!sameHex(hmac(process.env.RAZORPAY_KEY_SECRET, `${orderId}|${paymentId}`), signature)) return send(res, 400, { error: 'Payment could not be verified.' });
    const order = await razorpay(`/orders/${encodeURIComponent(orderId)}`);
    const { bookingId, uid } = order.notes || {};
    if (!bookingId || uid !== user.uid) return send(res, 403, { error: 'This payment belongs to another booking.' });
    await markPaid(bookingId, { paymentId, orderId, amount: order.amount });
    send(res, 200, { ok: true });
  } catch (e) {
    console.error(e);
    send(res, 500, { error: 'Payment received but we could not update your booking yet. The host will confirm it.' });
  }
}
