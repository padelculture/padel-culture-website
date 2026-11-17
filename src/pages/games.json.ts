// Public list of games and prices, read by the payment API so prices never come from the browser.
import { getCollection } from 'astro:content';
import site from '../data/site.json';
export async function GET() {
  const games = (await getCollection('games')).map((g) => ({ id: g.id, title: g.data.title, price: g.data.price, advance: Math.min(g.data.price, g.data.advance ?? (site as { advanceAmount?: number }).advanceAmount ?? g.data.price), status: g.data.status, start: g.data.date.toISOString() }));
  return new Response(JSON.stringify(games), { headers: { 'Content-Type': 'application/json' } });
}
