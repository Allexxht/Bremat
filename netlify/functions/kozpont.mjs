// =====================================================================
// Netlify Function: /api/kozpont – a Központ (kezdőlap) projektlistája és
// az Ötletek. Saját Blobs tároló: "kozpont". Ugyanaz a belépési kód, mint a
// heti lapé (KM_ACCESS_CODE).
// =====================================================================
import { getStore } from '@netlify/blobs';
import { handle, KmError } from '../../lib/kozpont-core.mjs';

function blobStore() {
  const s = getStore({ name: 'kozpont', consistency: 'strong' });
  return {
    get: (k) => s.get(k, { type: 'json' }),
    async setIfNew(k, v) { return (await s.setJSON(k, v, { onlyIfNew: true })).modified; },
    async set(k, v) { await s.setJSON(k, v); },
    delete: (k) => s.delete(k),
    async listKeys(prefix) {
      const { blobs } = await s.list({ prefix });
      return blobs.map((b) => b.key);
    },
  };
}

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Csak POST kérés engedélyezett' });
  try {
    return json(200, { data: await handle(await req.text(), { accessCode: process.env.KM_ACCESS_CODE, store: blobStore() }) });
  } catch (e) {
    if (e instanceof KmError) return json(e.status, { error: e.message });
    console.error(e);
    return json(500, { error: 'Szerverhiba, próbáld újra később.' });
  }
};

export const config = { path: '/api/kozpont' };
