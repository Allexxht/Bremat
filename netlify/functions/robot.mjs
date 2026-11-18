// =====================================================================
// Netlify Function: /api/robot – a hegesztőrobot működési naplója
// (napi napló, pendant-számlálók, statisztika). Saját Blobs tároló: "robot".
// Kódok (Netlify → Environment variables):
//   ROBOT_ADMIN_CODE   (ha nincs: KM_ACCESS_CODE) – admin, mindent
//   ROBOT_OPERATOR_CODE – operátor: naplóz, számlálót ment
//   ROBOT_VIEW_CODE     – csak a statisztika (a főnöknek)
// =====================================================================
import { getStore } from '@netlify/blobs';
import { handle, KmError } from '../../lib/robot-core.mjs';

function blobStore() {
  const s = getStore({ name: 'robot', consistency: 'strong' });
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
      codes: {
        admin: process.env.ROBOT_ADMIN_CODE || process.env.KM_ACCESS_CODE,
        operator: process.env.ROBOT_OPERATOR_CODE,
        viewer: process.env.ROBOT_VIEW_CODE,
      },
    });
    return json(200, { data });
  } catch (e) {
    if (e instanceof KmError) return json(e.status, { error: e.message });
    console.error(e);
    return json(500, { error: 'Szerverhiba, próbáld újra később.' });
  }
};

export const config = { path: '/api/robot' };
