// Confirms a payment after Razorpay Checkout succeeds, then creates the paid booking.
// POST { orderId, paymentId, signature } with Authorization: Bearer <Firebase ID token>.
import { send, readBody, userFromRequest, razorpay, confirmPaidBooking, hmac, sameHex, configured, gameInfo } from './_lib/pay.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  if (!configured()) return send(res, 503, { error: 'Online payment is not switched on yet.' });
  try {
    const user = await userFromRequest(req);
    if (!user) return send(res, 401, { error: 'Please log in again.' });
    const { orderId, paymentId, signature } = await readBody(req);
    if (!sameHex(hmac(process.env.RAZORPAY_KEY_SECRET, `${orderId}|${paymentId}`), signature)) return send(res, 400, { error: 'Payment could not be verified.' });
    const order = await razorpay(`/orders/${encodeURIComponent(orderId)}`);
    const { uid, gameId, price } = order.notes || {};
    if (!gameId || uid !== user.uid) return send(res, 403, { error: 'This payment belongs to another booking.' });
    const game = await gameInfo(req, gameId);
    const r = await confirmPaidBooking({ gameId, uid, spots: game?.spots ?? 99, reserved: game?.reserved || 0, paymentId, orderId, amount: order.amount, full: order.amount >= Number(price || 0) * 100 });
    if (r.full) return send(res, 409, { error: 'Payment received, but the game filled up a moment before. The host will refund you or move you to the next game.', full: true });
    send(res, 200, { ok: true });
  } catch (e) {
    console.error(e);
    send(res, 500, { error: 'Payment received but we could not confirm your spot yet. The host will sort it out.' });
  }
}
