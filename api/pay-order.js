// Creates a Razorpay order for a spot in a game. The spot itself is only created once payment succeeds.
// POST { gameId } with Authorization: Bearer <Firebase ID token>.
import { send, readBody, userFromRequest, getBooking, razorpay, configured, gameInfo, gameCounts } from './_lib/pay.js';
import crypto from 'node:crypto';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  if (!configured()) return send(res, 503, { error: 'Online payment is not switched on yet.' });
  try {
    const user = await userFromRequest(req);
    if (!user) return send(res, 401, { error: 'Please log in again.' });
    const { gameId } = await readBody(req);
    const game = gameId && await gameInfo(req, gameId);
    if (!game || game.status === 'cancelled') return send(res, 404, { error: 'Game not found.' });
    const bookingId = `${gameId}__${user.uid}`;
    const b = await getBooking(bookingId);
    if (b && (b.paid || b.advancePaid)) return send(res, 409, { error: 'Your spot is already confirmed.', paid: true });
    if (!b) {
      const c = await gameCounts(gameId);
      if (game.status === 'full' || Number(c.booked || 0) + Number(game.reserved || 0) >= Number(game.spots)) return send(res, 409, { error: 'Sorry, this game just filled up. Join the waitlist.', full: true });
    }
    const price = Number(game.price);
    const advance = Number(game.advance ?? price);
    const amount = Math.round(advance * 100);
    const order = await razorpay('/orders', { method: 'POST', body: JSON.stringify({
      amount, currency: 'INR',
      receipt: 'pc_' + crypto.createHash('sha1').update(bookingId + Date.now()).digest('hex').slice(0, 30),
      notes: { bookingId, uid: user.uid, gameId, price: String(price) },
    }) });
    send(res, 200, { orderId: order.id, amount, currency: 'INR', keyId: process.env.RAZORPAY_KEY_ID, title: game.title, phone: user.phone, balance: Math.max(0, price - advance) });
  } catch (e) {
    console.error(e);
    send(res, 500, { error: 'Could not start the payment. Please try again.' });
  }
}
