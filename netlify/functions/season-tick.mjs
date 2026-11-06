// Season 0, every 10 minutes: measure the coins launched here and pay the milestones they reached.
// A scheduled function (no URL); see netlify/lib/season.mjs and supabase/migrations/0006_season1.sql.
import { tick } from '../lib/season.mjs';

export default async () => {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return new Response('not configured', { status: 503 });
  try {
    const r = await tick();
    console.log('season tick', JSON.stringify(r));
    return new Response(JSON.stringify(r), { headers: { 'content-type': 'application/json' } });
  } catch (e) {
    console.error('season tick', e.message);
    return new Response('error', { status: 500 });
  }
};

export const config = { schedule: '*/10 * * * *' };
