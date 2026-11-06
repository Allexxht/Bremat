// =====================================================================
// BREMAT Központ – szerveroldal: belépési kód ellenőrzése, a projektkörök
// listája, és az Ötletek (saját Blobs tároló: "kozpont").
// (A Munkanapló és a Valk lap adatait a Központ a saját függvényeiktől
// kéri: /api/naplo, /api/km.)
//
// Egy ötlet = egy blob:  o/<uuid>   Törléskor előbb másolat:  d/<uuid>
// Állapot: nyitott → folyamatban → kesz (megvalósult) vagy elvetve (+ miért).
// =====================================================================
import { randomUUID } from 'node:crypto';
import { checkCode, KmError } from './km-core.mjs';
import { PROJECTS, PRIVATE_INDEX } from './projektek.mjs';

export { KmError };
const MAX_BODY = 16 * 1024;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const IDEA_STATES = ['nyitott', 'folyamatban', 'kesz', 'elvetve'];

const text = (v, max) => {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  const s = String(v).trim().slice(0, max);
  return s === '' ? null : s;
};
const ideaKey = (id) => {
  if (typeof id !== 'string' || !UUID_RE.test(id)) throw new KmError('Ismeretlen ötlet', 404);
  return `o/${id}`;
};
function needStore(store) { if (!store) throw new KmError('Nincs tároló', 500); return store; }

export async function handle(rawBody, { accessCode, store, now = new Date(), newId = randomUUID }) {
  if (typeof rawBody !== 'string' || rawBody.length > MAX_BODY) throw new KmError('Túl nagy kérés', 413);
  let body;
  try { body = JSON.parse(rawBody); } catch { throw new KmError('Hibás kérés'); }
  if (!body || typeof body !== 'object') throw new KmError('Hibás kérés');

  checkCode(body.code, accessCode);   // rossz kódnál itt megáll (401)
  const ts = now.toISOString();

  switch (body.action) {
    case 'ping':
      return true;
    case 'projects':
      return { projects: PROJECTS, private_index: PRIVATE_INDEX };

    case 'idea_list': {
      const s = needStore(store);
      const keys = await s.listKeys('o/');
      const rows = (await Promise.all(keys.map((k) => s.get(k)))).filter(Boolean);
      return rows.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    }
    case 'idea_add': {
      const s = needStore(store);
      const t = text(body.text, 2000);
      if (!t) throw new KmError('Írd be az ötletet');
      const rec = { id: newId(), text: t, status: 'nyitott', reason: null, created_at: ts, updated_at: ts, done_at: null };
      if (!(await s.setIfNew(ideaKey(rec.id), rec))) throw new KmError('A mentés nem sikerült, próbáld újra', 409);
      return rec;
    }
    case 'idea_update': {
      const s = needStore(store);
      const key = ideaKey(body.id);
      const cur = await s.get(key);
      if (!cur) throw new KmError('Ismeretlen ötlet', 404);
      const next = { ...cur, updated_at: ts };
      if (body.text !== undefined) { const t = text(body.text, 2000); if (!t) throw new KmError('Az ötlet nem lehet üres'); next.text = t; }
      if (body.status !== undefined) {
        if (!IDEA_STATES.includes(body.status)) throw new KmError('Érvénytelen állapot');
        next.status = body.status;
        next.done_at = body.status === 'kesz' || body.status === 'elvetve' ? (cur.status === body.status ? cur.done_at : ts) : null;
      }
      if (body.reason !== undefined) next.reason = text(body.reason, 1000);
      await s.set(key, next);
      return next;
    }
    case 'idea_delete': {
      const s = needStore(store);
      const key = ideaKey(body.id);
      const cur = await s.get(key);
      if (!cur) return true;
      await s.set(`d/${cur.id}`, { ...cur, deleted_at: ts });
      await s.delete(key);
      return true;
    }
    default:
      throw new KmError('Ismeretlen művelet');
  }
}
