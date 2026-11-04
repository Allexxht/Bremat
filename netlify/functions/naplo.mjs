// =====================================================================
// Netlify Function: /api/naplo – a Munkanapló (külön a Valk heti laptól).
// Saját Blobs tároló: "naplo". Belépési kód: NAPLO_ACCESS_CODE, ha be van
// állítva, különben ugyanaz, mint a heti lapé (KM_ACCESS_CODE).
// =====================================================================
import { getStore } from '@netlify/blobs';
import { handle, KmError } from '../../lib/naplo-core.mjs';

function blobStore() {
  const s = getStore({ name: 'naplo', consistency: 'strong' });
  return {
    get: (k) => s.get(k, { type: 'json' }),
    async getWithEtag(k) {
      const r = await s.getWithMetadata(k, { type: 'json' });
      return r ? { data: r.data, etag: r.etag } : null;
    },
    async setIfNew(k, v) { return (await s.setJSON(k, v, { onlyIfNew: true })).modified; },
    async setIfMatch(k, v, etag) { return (await s.setJSON(k, v, { onlyIfMatch: etag })).modified; },
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
    const data = await handle(await req.text(), {
      store: blobStore(),
      accessCode: process.env.NAPLO_ACCESS_CODE || process.env.KM_ACCESS_CODE,
    });
    return json(200, { data });
  } catch (e) {
    if (e instanceof KmError) return json(e.status, { error: e.message });
    console.error(e);
    return json(500, { error: 'Szerverhiba, próbáld újra később.' });
  }
};

export const config = { path: '/api/naplo' };
