// =====================================================================
// BREMAT – Munkanapló: szerveroldali logika
//
// Külön a Valk heti karbantartási laptól: saját tároló ("naplo"), saját
// függvény (/api/naplo), saját oldal (/naplo/). Közös csak a belépési kód
// ellenőrzése és a dátumkezelés (lib/km-core.mjs).
//
// Egy bejegyzés = egy blob:  e/<YYYY-MM-DD>/<uuid>
//   A dátum a kulcsban van, így egy hét bejegyzéseihez elég a kulcsokat
//   listázni és csak az adott napokét beolvasni.
// Módosításkor a régi változat megmarad:  h/<uuid>/<változat>
//   (setIfNew – ha két eszköz ugyanazt a változatot írná felül, a második
//   elutasítva, így semmi nem vész el csendben).
// Törléskor:  d/<uuid>  (előbb a másolat, utána a törlés).
// =====================================================================
import { randomUUID } from 'node:crypto';
import { checkCode, todayBudapest, isoWeek, KmError } from './km-core.mjs';

export { KmError };
const MAX_BODY = 64 * 1024;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const MIN_DATE = '2020-01-01';
const MAX_RANGE_DAYS = 62;

const toDate = (ymd) => new Date(ymd + 'T00:00:00Z');
const addDays = (ymd, n) => { const d = toDate(ymd); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const validYmd = (v) => typeof v === 'string' && YMD_RE.test(v) && !Number.isNaN(toDate(v).getTime()) && toDate(v).toISOString().slice(0, 10) === v;

const text = (v, max) => {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  const s = String(v).trim().slice(0, max);
  return s === '' ? null : s;
};

// A bejegyzés felhasználó által megadott mezői.
export function validateEntry(p, today) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) throw new KmError('Hiányzó adatok');
  if (!validYmd(p.date)) throw new KmError('Érvénytelen dátum');
  if (p.date > addDays(today, 1)) throw new KmError('A dátum nem lehet jövőbeli');
  if (p.date < MIN_DATE) throw new KmError('Túl régi dátum');
  const body = text(p.text, 4000);
  if (!body) throw new KmError('Írd be, mit csináltál');
  let hours = null;
  if (p.hours !== null && p.hours !== undefined && p.hours !== '') {
    hours = Number(String(p.hours).replace(',', '.'));
    if (!Number.isFinite(hours) || hours <= 0 || hours > 24) throw new KmError('Az idő 0 és 24 óra között lehet');
    hours = Math.round(hours * 100) / 100;
  }
  const { year, week } = isoWeek(p.date);
  return { date: p.date, iso_year: year, iso_week: week, text: body, area: text(p.area, 120), hours };
}

const keyFor = (date, id) => `e/${date}/${id}`;
const idOf = (id) => {
  if (typeof id !== 'string' || !UUID_RE.test(id)) throw new KmError('Nincs ilyen bejegyzés', 404);
  return id.toLowerCase();
};
async function findKey(store, id) {
  const keys = await store.listKeys('e/');
  return keys.find((k) => k.endsWith('/' + id)) || null;
}

async function readKeys(store, keys) {
  const rows = [];
  for (let i = 0; i < keys.length; i += 20) {
    const part = await Promise.all(keys.slice(i, i + 20).map((k) => store.get(k)));
    part.forEach((r) => { if (r) rows.push(r); });
  }
  return rows;
}
const sortRows = (rows) => rows.sort((a, b) => a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at));

// --- A Teendőim (asztali program) állapota a Központ szigetéhez ---------
// Hány teendő van hátra, mi fut éppen, hány fontos. Csak az utolsó állapot
// számít (minden küldés felülírja).
const TODO_KEY = 'status/teendoim';
const count = (v, label) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > 1e13) throw new KmError(`Érvénytelen szám: ${label}`);
  return n;
};
export function validateTodoStatus(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) throw new KmError('Hiányzó állapot');
  const doing = Array.isArray(p.doing) ? p.doing : [];
  if (doing.length > 50) throw new KmError('Túl sok futó teendő');
  return {
    open: count(p.open, 'hátralévő'),
    starred: count(p.starred, 'fontos'),
    doing: doing.map((d) => ({
      text: text(d && d.text, 300) || '(névtelen)',
      spent_ms: count(d && d.spent_ms, 'mért idő'),
      // a futó óra indulása (Unix ms) – ebből a Központ élőben számolja az időt
      started_at: d && d.started_at != null ? count(d.started_at, 'indítás') : null,
    })),
  };
}

// --- Napi idősáv: a Teendőim óráinak szakaszai ------------------------
// Egy nap = egy blob:  t/<YYYY-MM-DD>  { date, segments, updated_at }
// A Teendőim minden változáskor a teljes napot küldi (felülírja), így egy
// elveszett vagy kétszer elküldött kérés sem okoz hibát.
// Egy szakasz: name (teendő vagy tevékenység neve), kind (todo = teendő,
// activity = állandó tevékenység, pl. „Általános”, break = szünet),
// start / end (Unix ms; end = null, ha még fut).
const TIME_KINDS = ['todo', 'activity', 'break'];
const MAX_SEGMENTS = 300;
const DAY_MS = 86400000;
export function validateTimeDay(p, today) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) throw new KmError('Hiányzó adatok');
  if (!validYmd(p.date)) throw new KmError('Érvénytelen dátum');
  if (p.date > addDays(today, 1)) throw new KmError('A dátum nem lehet jövőbeli');
  if (p.date < MIN_DATE) throw new KmError('Túl régi dátum');
  if (!Array.isArray(p.segments)) throw new KmError('Hiányzó szakaszok');
  if (p.segments.length > MAX_SEGMENTS) throw new KmError('Túl sok szakasz egy napon');
  // A nap ±1 nap türelemmel (időzóna, éjfélen átnyúló szakasz).
  const lo = toDate(p.date).getTime() - DAY_MS, hi = toDate(p.date).getTime() + 2 * DAY_MS;
  const segments = p.segments.map((s, i) => {
    if (!s || typeof s !== 'object') throw new KmError(`Hibás szakasz (${i + 1}.)`);
    const kind = TIME_KINDS.includes(s.kind) ? s.kind : 'todo';
    const start = count(s.start, 'kezdés');
    const end = s.end == null ? null : count(s.end, 'befejezés');
    if (start < lo || start > hi) throw new KmError(`A szakasz nem erre a napra esik (${i + 1}.)`);
    if (end != null && (end < start || end > hi)) throw new KmError(`Hibás befejezés (${i + 1}.)`);
    const name = text(s.name, 300) || (kind === 'break' ? 'Szünet' : '(névtelen)');
    return { name, kind, start, end };
  }).sort((a, b) => a.start - b.start);
  return { date: p.date, segments };
}

// store: { get, getWithEtag, setIfNew, setIfMatch, set, delete, listKeys } – mint a km-core-nál.
export async function handle(rawBody, { store, accessCode, now = new Date(), newId = randomUUID }) {
  if (typeof rawBody !== 'string' || rawBody.length > MAX_BODY) throw new KmError('Túl nagy kérés', 413);
  let body;
  try { body = JSON.parse(rawBody); } catch { throw new KmError('Hibás kérés'); }
  if (!body || typeof body !== 'object') throw new KmError('Hibás kérés');

  checkCode(body.code, accessCode);
  const today = todayBudapest(now);
  const ts = now.toISOString();

  switch (body.action) {
    case 'ping':
      return true;

    // Egy időszak (pl. egy hét) bejegyzései, dátum szerint növekvő sorrendben.
    case 'range': {
      if (!validYmd(body.from) || !validYmd(body.to) || body.from > body.to) throw new KmError('Érvénytelen időszak');
      if ((toDate(body.to) - toDate(body.from)) / 86400000 > MAX_RANGE_DAYS) throw new KmError('Túl hosszú időszak');
      const keys = (await store.listKeys('e/')).filter((k) => { const d = k.slice(2, 12); return d >= body.from && d <= body.to; });
      return sortRows(await readKeys(store, keys));
    }

    // Minden bejegyzés – kereséshez és CSV-hez.
    case 'all':
      return sortRows(await readKeys(store, await store.listKeys('e/')));

    case 'create': {
      const e = validateEntry(body.entry, today);
      const author = text(body.name, 120);
      if (!author) throw new KmError('Írd be a nevedet');
      const id = newId();
      const rec = { id, ...e, author, created_at: ts, version: 1, updated_at: null, updated_by: null };
      if (!(await store.setIfNew(keyFor(e.date, id), rec))) throw new KmError('A mentés nem sikerült, próbáld újra', 409);
      return rec;
    }

    case 'update': {
      const id = idOf(body.id);
      const name = text(body.name, 120);
      if (!name) throw new KmError('Írd be a nevedet');
      const e = validateEntry(body.entry, today);
      const key = await findKey(store, id);
      const cur = key && await store.getWithEtag(key);
      if (!cur || !cur.data) throw new KmError('Nincs ilyen bejegyzés – lehet, hogy közben törölték', 404);
      if (body.version !== cur.data.version) throw new KmError('Közben valaki módosította ezt a bejegyzést. Frissítsd az oldalt, és próbáld újra.', 409);
      const same = ['date', 'text', 'area', 'hours'].every((f) => (cur.data[f] ?? null) === (e[f] ?? null));
      if (same) return cur.data;
      // A régi változat megőrzése egyben zár is: ugyanazt a változatot csak egyszer lehet felülírni.
      if (!(await store.setIfNew(`h/${id}/${cur.data.version}`, { ...cur.data, replaced_at: ts, replaced_by: name }))) {
        throw new KmError('Közben valaki módosította ezt a bejegyzést. Frissítsd az oldalt, és próbáld újra.', 409);
      }
      const next = { ...cur.data, ...e, version: cur.data.version + 1, updated_at: ts, updated_by: name };
      const newKey = keyFor(e.date, id);
      if (newKey === key) {
        if (!(await store.setIfMatch(key, next, cur.etag))) throw new KmError('Közben valaki módosította ezt a bejegyzést. Frissítsd az oldalt, és próbáld újra.', 409);
      } else {
        // Másik napra került: előbb az új helyre írjuk, csak utána töröljük a régit.
        if (!(await store.setIfNew(newKey, next))) throw new KmError('A mentés nem sikerült, próbáld újra', 409);
        await store.delete(key);
      }
      return next;
    }

    // Egy bejegyzés korábbi változatai (legújabb elöl).
    case 'history': {
      const id = idOf(body.id);
      const rows = await readKeys(store, await store.listKeys(`h/${id}/`));
      return rows.sort((a, b) => b.version - a.version);
    }

    case 'delete': {
      const id = idOf(body.id);
      const name = text(body.name, 120);
      if (!name) throw new KmError('Írd be a nevedet a törléshez');
      const key = await findKey(store, id);
      const cur = key && await store.get(key);
      if (!cur) throw new KmError('Nincs ilyen bejegyzés – lehet, hogy már törölték', 404);
      await store.setIfNew(`d/${id}`, { ...cur, deleted_by: name, deleted_at: ts });
      await store.delete(key);
      return true;
    }

    case 'todo_status_set': {
      const st = validateTodoStatus(body.status);
      await store.set(TODO_KEY, { ...st, name: text(body.name, 120), updated_at: ts });
      return true;
    }

    case 'todo_status':
      return (await store.get(TODO_KEY)) || null;

    // A Teendőim egy napjának szakaszai (az egész nap, felülírja).
    case 'time_day_set': {
      const d = validateTimeDay(body.day, today);
      await store.set(`t/${d.date}`, { ...d, name: text(body.name, 120), updated_at: ts });
      return true;
    }

    // Egy időszak napjainak szakaszai, dátum szerint növekvő sorrendben.
    case 'time_range': {
      if (!validYmd(body.from) || !validYmd(body.to) || body.from > body.to) throw new KmError('Érvénytelen időszak');
      if ((toDate(body.to) - toDate(body.from)) / DAY_MS > MAX_RANGE_DAYS) throw new KmError('Túl hosszú időszak');
      const keys = (await store.listKeys('t/')).filter((k) => { const d = k.slice(2, 12); return d >= body.from && d <= body.to; });
      return (await readKeys(store, keys)).sort((a, b) => a.date.localeCompare(b.date));
    }

    default:
      throw new KmError('Ismeretlen művelet');
  }
}
