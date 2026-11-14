// Creates a Razorpay order for the caller's own booking. POST { gameId } with Authorization: Bearer <Firebase ID token>.
import { send, readBody, userFromRequest, getBooking, razorpay, configured, gameInfo } from './_lib/pay.js';
import crypto from 'node:crypto';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  if (!configured()) return send(res, 503, { error: 'Online payment is not switched on yet.' });
  try {
    const user = await userFromRequest(req);
    if (!user) return send(res, 401, { error: 'Please log in again.' });
    const { gameId } = await readBody(req);
    const game = gameId && await gameInfo(req, gameId);
    if (!game) return send(res, 404, { error: 'Game not found.' });
    const bookingId = `${gameId}__${user.uid}`;
    const b = await getBooking(bookingId);
    if (!b) return send(res, 404, { error: 'Book a spot first.' });
    if (b.paid) return send(res, 409, { error: 'This spot is already paid.', paid: true });
    const amount = Math.round(Number(game.price) * 100);
    const order = await razorpay('/orders', { method: 'POST', body: JSON.stringify({
      amount, currency: 'INR',
      receipt: 'pc_' + crypto.createHash('sha1').update(bookingId).digest('hex').slice(0, 30),
      notes: { bookingId, uid: user.uid, gameId },
    }) });
    send(res, 200, { orderId: order.id, amount, currency: 'INR', keyId: process.env.RAZORPAY_KEY_ID, title: game.title, phone: user.phone });
  } catch (e) {
    console.error(e);
    send(res, 500, { error: 'Could not start the payment. Please try again.' });
  }
}
