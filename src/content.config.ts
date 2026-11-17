import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const games = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/games' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),          // start date + time
    endTime: z.string().optional(),  // e.g. "21:00"
    venue: z.string(),
    area: z.string().default('West Delhi'),
    mapLink: z.string().optional(),
    format: z.string().default('Americano'),
    level: z.string().default('All levels'),
    price: z.number().default(0),
    advance: z.number().optional(),      // paid online to confirm a spot; rest at the court. Falls back to site setting.
    spots: z.number().default(16),
    reserved: z.number().default(0),     // spots taken offline (cash/WhatsApp)
    spotsLeft: z.number().optional(),  // old field, no longer used
    bookingLink: z.string().optional(),
    paymentLink: z.string().optional(),  // sent to players by WhatsApp from the dashboard
    status: z.enum(['open', 'full', 'cancelled']).default('open'),
  }),
});

export const collections = { games };
