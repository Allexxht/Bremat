// =====================================================================
// Netlify Function: /api/kozpont – a Központ (kezdőlap) projektlistája.
// Ugyanaz a belépési kód, mint a heti lapé (KM_ACCESS_CODE).
// =====================================================================
import { handle, KmError } from '../../lib/kozpont-core.mjs';

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Csak POST kérés engedélyezett' });
  try {
    return json(200, { data: await handle(await req.text(), { accessCode: process.env.KM_ACCESS_CODE }) });
  } catch (e) {
    if (e instanceof KmError) return json(e.status, { error: e.message });
    console.error(e);
    return json(500, { error: 'Szerverhiba, próbáld újra később.' });
  }
};

export const config = { path: '/api/kozpont' };
