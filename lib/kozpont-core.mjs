// =====================================================================
// BREMAT Központ – szerveroldal: belépési kód ellenőrzése, a projektkörök
// listája, és az Ötletek (saját Blobs tároló: "kozpont").
// (A Munkanapló és a Valk lap adatait a Központ a saját függvényeiktől
// kéri: /api/naplo, /api/km.)
//
// Egy ötlet = egy blob:  o/<uuid>   Törléskor előbb másolat:  d/<uuid>
// Állapot: nyitott → folyamatban → kesz (megvalósult) vagy elvetve (+ miért).
//
// Robot programok: egy termék = egy blob:  pt/<uuid>,  utolsó szinkron: ptm.
// A termékeket / részeket / verziókat a Teendőim küldi a DTPS mappából
// (pt_sync, 5 percenként, csak nevek + dátumok). Alex lépéseit (teszt,
// pontok) a közös public/programteszt.js applyOp() alkalmazza – a demó is.
// =====================================================================
import { randomUUID } from 'node:crypto';
import { checkCode, KmError } from './km-core.mjs';
import { PROJECTS, PRIVATE_INDEX } from './projektek.mjs';
import { syncProduct, markGone, applyOp, PtError } from '../public/programteszt.js';

export { KmError };
const MAX_BODY = 256 * 1024;   // a DTPS szinkron (pt_sync) több száz programnevet is hozhat
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
const ptKey = (id) => {
  if (typeof id !== 'string' || !UUID_RE.test(id)) throw new KmError('Ismeretlen termék', 404);
  return `pt/${id}`;
};
const ptWrap = (fn) => { try { return fn(); } catch (e) { if (e instanceof PtError) throw new KmError(e.message); throw e; } };
function needStore(store) { if (!store) throw new KmError('Nincs tároló', 500); return store; }

export async function handle(rawBody, { accessCode, syncCode, store, now = new Date(), newId = randomUUID }) {
  if (typeof rawBody !== 'string' || rawBody.length > MAX_BODY) throw new KmError('Túl nagy kérés', 413);
  let body;
  try { body = JSON.parse(rawBody); } catch { throw new KmError('Hibás kérés'); }
  if (!body || typeof body !== 'object') throw new KmError('Hibás kérés');

  // A Teendőim a Munkanapló kódjával küldi a DTPS szinkront (ha az más, mint a Központé).
  if (body.action === 'pt_sync' && syncCode) { try { checkCode(body.code, syncCode); } catch { checkCode(body.code, accessCode); } }
  else checkCode(body.code, accessCode);   // rossz kódnál itt megáll (401)
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

    // ---------- Robot programteszt követő ----------
    case 'pt_list': {
      const s = needStore(store);
      const keys = await s.listKeys('pt/');
      const rows = (await Promise.all(keys.map((k) => s.get(k)))).filter((x) => x && !x.gone);
      const meta = (await s.get('ptm')) || {};
      return { products: rows.sort((a, b) => (a.sku || '').localeCompare(b.sku || '', 'hu', { numeric: true })), synced_at: meta.synced_at || null };
    }
    case 'pt_sync': {
      // { products: [{ folder, programs: [{ n, m }] }] } – a DTPS mappa mostani állapota
      const s = needStore(store);
      const list = Array.isArray(body.products) ? body.products : null;
      if (!list || list.length > 300) throw new KmError('Hibás szinkron');
      const keys = await s.listKeys('pt/');
      const docs = (await Promise.all(keys.map((k) => s.get(k)))).filter(Boolean);
      const seen = new Set();
      let changed = 0;
      for (const item of list) {
        const folder = text(item?.folder, 200);
        if (!folder || seen.has(folder.toLowerCase())) continue;
        seen.add(folder.toLowerCase());
        const cur = docs.find((d) => d.folder.toLowerCase() === folder.toLowerCase()) || null;
        const next = ptWrap(() => syncProduct(cur, item, { now, newId }));
        if (next !== cur) { await s.set(ptKey(next.id), next); changed++; }
      }
      for (const d of docs) {
        if (seen.has(d.folder.toLowerCase())) continue;
        const next = markGone(d, now);
        if (next !== d) { await s.set(ptKey(d.id), next); changed++; }
      }
      await s.set('ptm', { synced_at: ts, products: seen.size });
      return { changed };
    }
    case 'pt_op': {
      // Nincs rev-ellenőrzés: a szinkron 5 percenként is írhatja a terméket, Alex lépése a mostanira megy.
      const s = needStore(store);
      const key = ptKey(body.id);
      const cur = await s.get(key);
      if (!cur) throw new KmError('Ismeretlen termék', 404);
      const next = ptWrap(() => applyOp(cur, body.op, { now, newId }));
      if (next !== cur) await s.set(key, next);
      return next;
    }
    default:
      throw new KmError('Ismeretlen művelet');
  }
}
