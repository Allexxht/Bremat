// =====================================================================
// BREMAT – Valk robot heti karbantartási lap: szerveroldali logika
//
// Hálózat- és tárolófüggetlen: a tárolót a hívó adja át (élesben Netlify
// Blobs, tesztben memória), így ugyanez a kód fut mindenhol.
// Minden bemenetet itt ellenőrzünk újra – a böngészőben futó ellenőrzés
// csak kényelmi, nem védelmi határ.
// =====================================================================
import { createHash, timingSafeEqual, randomUUID } from 'node:crypto';
// A feladatok katalógusa közös a böngészővel (public/tasks.js): a szerver innen
// tudja, mely kulcsok léteznek, melyik heti (kötelező), és mi a címük.
// FORM_VERSION is innen jön – egy régi, nyitva maradt oldal nem tud a régi
// tételekkel lapot beküldeni.
import { FORM_VERSION, TASK_BY_KEY, WEEKLY_KEYS } from '../public/tasks.js';

export { FORM_VERSION };
const STATUSES = new Set(['ok', 'action', 'skip']);
const MAX_ITEMS = 100;
const MAX_BODY = 64 * 1024;

export class KmError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

// --- Hozzáférési kód --------------------------------------------------
// Kis- és nagybetű, kötőjel, szóköz nem számít: "abcde-12345" = "ABCDE12345".
export const normalizeCode = (c) => String(c ?? '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();
const sha = (s) => createHash('sha256').update(s).digest();

export function checkCode(given, expected) {
  const exp = normalizeCode(expected);
  if (exp.length < 12) {
    throw new KmError('A szerveren nincs beállítva megfelelő hozzáférési kód (KM_ACCESS_CODE, legalább 12 karakter).', 500);
  }
  // Hash-ek összevetése állandó idejű összehasonlítással.
  if (!timingSafeEqual(sha(normalizeCode(given)), sha(exp))) {
    throw new KmError('Hibás hozzáférési kód', 401);
  }
}

// --- Dátum (mindig Europe/Budapest szerint) ---------------------------
const ymdFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Budapest', year: 'numeric', month: '2-digit', day: '2-digit' });
export const todayBudapest = (now = new Date()) => ymdFmt.format(now);
const toDate = (ymd) => new Date(ymd + 'T00:00:00Z');
const addDays = (ymd, n) => { const d = toDate(ymd); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

export function isoWeek(ymd) {
  const d = toDate(ymd);
  d.setUTCDate(d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7));
  const year = d.getUTCFullYear();
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const week = 1 + Math.round(((d - jan4) / 86400000 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
  return { year, week };
}

// --- Bemenet tisztítása ----------------------------------------------
const text = (v, max) => {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  const s = String(v).trim().slice(0, max);
  return s === '' ? null : s;
};

export function validateSubmit(p, today) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) throw new KmError('Hiányzó adatok');
  if (p.form_version !== FORM_VERSION) {
    throw new KmError('A lap közben megváltozott. Töltsd újra az oldalt, és töltsd ki újra a lapot.', 409);
  }

  const date = typeof p.check_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.check_date) ? p.check_date : null;
  if (!date || Number.isNaN(toDate(date).getTime()) || toDate(date).toISOString().slice(0, 10) !== date) {
    throw new KmError('Érvénytelen dátum');
  }
  if (date > addDays(today, 1) || date < addDays(today, -400)) {
    throw new KmError('A dátum nem lehet jövőbeli vagy egy évnél régebbi');
  }
  const robot = text(p.robot, 120);
  if (!robot) throw new KmError('A robot / cella megadása kötelező');
  const inspector = text(p.inspector, 120);
  if (!inspector) throw new KmError('Az ellenőrzést végző nevének megadása kötelező');

  // Tételek: a heti feladatok mind kötelezők, a ritkábbak (amik épp esedékesek)
  // tetszőlegesek. Ismeretlen vagy kétszer szereplő kulcs hiba.
  if (!Array.isArray(p.items) || !p.items.length || p.items.length > MAX_ITEMS) throw new KmError('Hiányoznak a feladatok');
  const seen = new Set();
  const items = p.items.map((it, i) => {
    const t = it && typeof it.key === 'string' ? TASK_BY_KEY[it.key] : null;
    if (!t) throw new KmError(`Ismeretlen feladat a lapon (${i + 1}.)`);
    if (seen.has(t.key)) throw new KmError(`Kétszer szerepel: ${t.title}`);
    seen.add(t.key);
    if (!STATUSES.has(it.status)) throw new KmError(`Nincs kitöltve: ${t.title}`);
    const note = text(it.note, 1000);
    if (it.status === 'action' && !note) throw new KmError(`Írd be, mit csináltál: ${t.title}`);
    if (it.status === 'skip' && !note) throw new KmError(`Írd be, miért maradt el: ${t.title}`);
    return { key: t.key, title: t.title, status: it.status, note: it.status === 'ok' ? null : note };
  });
  const missing = WEEKLY_KEYS.find((k) => !seen.has(k));
  if (missing) throw new KmError(`Hiányzik a lapról: ${TASK_BY_KEY[missing].title}`);

  if (typeof p.escalate !== 'boolean') throw new KmError('Jelöld be, hogy szükséges-e továbbjelzés');
  const escalateTo = text(p.escalate_to, 200);
  if (p.escalate && !escalateTo) throw new KmError('Add meg, kinek kell továbbjelezni');

  let gas = null;
  if (p.gas_flow_lpm !== null && p.gas_flow_lpm !== undefined && p.gas_flow_lpm !== '') {
    gas = Number(p.gas_flow_lpm);
    if (!Number.isFinite(gas)) throw new KmError('A gázáramlás csak szám lehet');
    if (gas < 0 || gas > 100) throw new KmError('A gázáramlás 0 és 100 l/min között lehet');
    gas = Math.round(gas * 10) / 10;
  }

  const { year, week } = isoWeek(date);
  return {
    form_version: FORM_VERSION,
    check_date: date,
    iso_year: year,
    iso_week: week,
    robot,
    inspector,
    items,
    action_count: items.filter((x) => x.status === 'action').length,
    skip_count: items.filter((x) => x.status === 'skip').length,
    // A hűtővíz-csere dátuma (a régi lapokkal közös mező): ha a feladat megvolt.
    cooling_water_changed: items.some((x) => x.key === 'hutoviz-csere' && x.status !== 'skip') ? date : null,
    gas_flow_lpm: gas,
    remarks: text(p.remarks, 4000),
    parts_used: text(p.parts_used, 2000),
    escalate: p.escalate,
    escalate_to: p.escalate ? escalateTo : null,
    approved_by: null,
    approved_at: null,
  };
}

// --- Tároló-kulcsok ----------------------------------------------------
const PREFIX = 'check/';
// Törölt lapok: nem tűnnek el nyomtalanul, hanem ide kerülnek át (a listában nem
// látszanak). Ha tévedésből törölték, a Netlify felületén (Blobs → km-checks)
// visszakereshető.
const TRASH = 'deleted/';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const keyOf = (id) => {
  if (typeof id !== 'string' || !UUID_RE.test(id)) throw new KmError('Nincs ilyen lap', 404);
  return PREFIX + id.toLowerCase();
};

// --- Kérés feldolgozása --------------------------------------------------
// store: { get(key), getWithEtag(key), setIfNew(key, value), setIfMatch(key, value, etag), delete(key), listKeys(prefix) }
export async function handle(rawBody, { store, accessCode, now = new Date(), newId = randomUUID }) {
  if (typeof rawBody !== 'string' || rawBody.length > MAX_BODY) throw new KmError('Túl nagy kérés', 413);
  let body;
  try { body = JSON.parse(rawBody); } catch { throw new KmError('Hibás kérés'); }
  if (!body || typeof body !== 'object') throw new KmError('Hibás kérés');

  checkCode(body.code, accessCode);

  switch (body.action) {
    case 'ping':
      return true;

    case 'list': {
      const keys = await store.listKeys(PREFIX);
      const rows = [];
      // Kis adagokban olvasunk, hogy sok lapnál se indítsunk egyszerre túl sok kérést.
      for (let i = 0; i < keys.length; i += 20) {
        const part = await Promise.all(keys.slice(i, i + 20).map((k) => store.get(k)));
        part.forEach((r) => { if (r) rows.push(r); });
      }
      rows.sort((a, b) => b.check_date.localeCompare(a.check_date) || b.created_at.localeCompare(a.created_at));
      return rows;
    }

    case 'get': {
      const r = await store.get(keyOf(body.id));
      if (!r) throw new KmError('Nincs ilyen lap', 404);
      return r;
    }

    case 'submit': {
      const rec = validateSubmit(body.check, todayBudapest(now));
      const id = newId();
      const full = { id, created_at: now.toISOString(), ...rec };
      const ok = await store.setIfNew(keyOf(id), full);
      if (!ok) throw new KmError('A mentés nem sikerült, próbáld újra', 409);
      return id;
    }

    case 'approve': {
      const name = text(body.name, 120);
      if (!name) throw new KmError('A jóváhagyó nevének megadása kötelező');
      const key = keyOf(body.id);
      const cur = await store.getWithEtag(key);
      if (!cur || !cur.data) throw new KmError('Nincs ilyen lap', 404);
      if (cur.data.approved_by) throw new KmError('Ezt a lapot már jóváhagyták', 409);
      const next = { ...cur.data, approved_by: name, approved_at: now.toISOString() };
      const ok = await store.setIfMatch(key, next, cur.etag);
      if (!ok) throw new KmError('Közben valaki módosította a lapot. Frissítsd az oldalt, és próbáld újra.', 409);
      return next;
    }

    case 'delete': {
      const name = text(body.name, 120);
      if (!name) throw new KmError('Írd be a nevedet a törléshez');
      const key = keyOf(body.id);
      const cur = await store.get(key);
      if (!cur) throw new KmError('Nincs ilyen lap – lehet, hogy már törölték', 404);
      // Előbb a másolat, csak utána a törlés: ha közben megszakad, a lap nem vész el.
      // Ha a másolat egy félbemaradt korábbi törlésből már megvan, az is jó.
      await store.setIfNew(TRASH + key.slice(PREFIX.length), { ...cur, deleted_by: name, deleted_at: now.toISOString() });
      await store.delete(key);
      return true;
    }

    default:
      throw new KmError('Ismeretlen művelet');
  }
}

// Memóriabeli tároló – tesztekhez és a helyi próbához.
export function memoryStore() {
  const m = new Map();
  let n = 0;
  return {
    async get(k) { const v = m.get(k); return v ? structuredClone(v.data) : null; },
    async getWithEtag(k) { const v = m.get(k); return v ? { data: structuredClone(v.data), etag: v.etag } : null; },
    async setIfNew(k, data) { if (m.has(k)) return false; m.set(k, { data: structuredClone(data), etag: String(++n) }); return true; },
    async setIfMatch(k, data, etag) { const v = m.get(k); if (!v || v.etag !== etag) return false; m.set(k, { data: structuredClone(data), etag: String(++n) }); return true; },
    async delete(k) { m.delete(k); },
    async listKeys(prefix) { return [...m.keys()].filter((k) => k.startsWith(prefix)); },
  };
}
