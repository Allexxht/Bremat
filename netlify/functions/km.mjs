// =====================================================================
// Netlify Function: /api/km
// A heti karbantartási lapok olvasása és írása. Az adatok a site saját
// Netlify Blobs tárolójában vannak ("km-checks"), külső adatbázis nincs.
// A hozzáférési kód a KM_ACCESS_CODE környezeti változóban van
// (Netlify → Site configuration → Environment variables).
// =====================================================================
import { getStore } from '@netlify/blobs';
import { handle, KmError } from '../../lib/km-core.mjs';

function blobStore() {
  const s = getStore({ name: 'km-checks', consistency: 'strong' });
  return {
    get: (k) => s.get(k, { type: 'json' }),
    async getWithEtag(k) {
      const r = await s.getWithMetadata(k, { type: 'json' });
      return r ? { data: r.data, etag: r.etag } : null;
    },
    async setIfNew(k, v) { return (await s.setJSON(k, v, { onlyIfNew: true })).modified; },
    async setIfMatch(k, v, etag) { return (await s.setJSON(k, v, { onlyIfMatch: etag })).modified; },
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
    const data = await handle(await req.text(), {
      store: blobStore(),
      accessCode: process.env.KM_ACCESS_CODE,
    });
    return json(200, { data });
  } catch (e) {
    if (e instanceof KmError) return json(e.status, { error: e.message });
    console.error(e);
    return json(500, { error: 'Szerverhiba, próbáld újra később.' });
  }
};

export const config = { path: '/api/km' };
