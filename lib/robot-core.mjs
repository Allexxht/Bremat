// =====================================================================
// BREMAT – Robot napló: szerveroldali logika (tárolófüggetlen)
//
// Saját Blobs tároló: "robot", saját függvény: /api/robot, saját oldal: /robot/.
// A számítások és a katalógus közös a böngészővel: public/robot-stat.js.
//
// Kulcsok:
//   cfg/gep                      gépadatok, operátornevek
//   p/<uuid>                     termék (nem törlődik, csak archiválható)
//   e/<YYYY-MM>                  egy hónap napi bejegyzései egy blobban
//                                ({ month, entries: [...] }, írás etaggel)
//   h/<id>/<változat>            a bejegyzés módosítás előtti változata
//   d/<id>                       törölt bejegyzés / mérés másolata
//   c/<YYYY-MM-DD>/<uuid>        pendant-számláló mentés
//   f/<uuid>                     a pendant fotója (kicsinyített JPEG, base64)
//   Később (még nincs felülete): err/<YYYY-MM> USB hibalista, run/… program-
//   futásnapló, opc/… OPC UA adatok – lásd docs/jegyzet.md → Robot napló.
//
// Szerepek (a kódból):
//   admin    – ROBOT_ADMIN_CODE, ha nincs, KM_ACCESS_CODE: mindent
//   operator – ROBOT_OPERATOR_CODE: naplóz, számlálót ment, a saját aznapi
//              bejegyzését javíthatja / törölheti, az utolsó 7 napot látja
//   viewer   – ROBOT_VIEW_CODE (a főnök): csak a statisztikát látja
// =====================================================================
import { createHash, timingSafeEqual, randomUUID } from 'node:crypto';
import { normalizeCode, todayBudapest, KmError } from './km-core.mjs';
import { COUNTER_KEYS, DOWN_KEYS, CFG_FIELDS, DEFAULTS, sortReadings, spanMinutes } from '../public/robot-stat.js';

export { KmError };
export const MAX_BODY = 1536 * 1024;          // a fotó miatt nagyobb, mint a többi függvénynél
const MAX_JSON = 64 * 1024;                   // fotó nélkül
const MAX_PHOTO = 1100 * 1024;                // base64 hossz (~800 KB JPEG)
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const YM_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const HM_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;
const MIN_DATE = '2026-01-01';
const OPERATOR_DAYS = 7;

const sha = (s) => createHash('sha256').update(s).digest();
const toDate = (ymd) => new Date(ymd + 'T00:00:00Z');
const addDays = (ymd, n) => { const d = toDate(ymd); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const validYmd = (v) => typeof v === 'string' && YMD_RE.test(v) && !Number.isNaN(toDate(v).getTime()) && toDate(v).toISOString().slice(0, 10) === v;
const tsBudapestDay = (iso) => todayBudapest(new Date(iso));

const text = (v, max) => {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  const s = String(v).trim().slice(0, max);
  return s === '' ? null : s;
};
function int(v, label, max = 100000, def = 0) {
  if (v === null || v === undefined || v === '') return def;
  const n = Number(String(v).replace(',', '.'));
  if (!Number.isInteger(n) || n < 0 || n > max) throw new KmError(`Érvénytelen szám: ${label}`);
  return n;
}
function num(v, label, min, max) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(/\s/g, '').replace(',', '.'));
  if (!Number.isFinite(n) || n < min || n > max) throw new KmError(`Érvénytelen érték: ${label}`);
  return n;
}

// --- Belépés: a kódból jön a szerep ---------------------------------------
export function roleOf(given, codes) {
  const admin = normalizeCode(codes.admin);
  if (admin.length < 12) throw new KmError('A szerveren nincs beállítva megfelelő hozzáférési kód (KM_ACCESS_CODE vagy ROBOT_ADMIN_CODE, legalább 12 karakter).', 500);
  const g = sha(normalizeCode(given));
  let role = null;
  for (const [r, c] of [['admin', admin], ['operator', normalizeCode(codes.operator)], ['viewer', normalizeCode(codes.viewer)]]) {
    if (c.length < 12) continue;
    if (timingSafeEqual(g, sha(c)) && !role) role = r;   // mindhármat végignézi (állandó idő)
  }
  if (!role) throw new KmError('Hibás hozzáférési kód', 401);
  return role;
}
const ALLOW = {
  ping: ['admin', 'operator', 'viewer'],
  meta: ['admin', 'operator', 'viewer'],
  summary: ['admin', 'operator', 'viewer'],
  entries: ['admin', 'operator', 'viewer'],
  entry_create: ['admin', 'operator'],
  entry_update: ['admin', 'operator'],
  entry_delete: ['admin', 'operator'],
  entry_history: ['admin'],
  counters: ['admin', 'operator', 'viewer'],
  counter_create: ['admin', 'operator'],
  counter_delete: ['admin'],
  photo: ['admin', 'operator', 'viewer'],
  stats: ['admin', 'viewer'],
  product_save: ['admin'],
  cfg_save: ['admin'],
};

// --- Gépadatok -------------------------------------------------------------
const CFG_KEY = 'cfg/gep';
export function validateCfg(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) throw new KmError('Hiányzó adatok');
  const out = {};
  for (const f of CFG_FIELDS) out[f.key] = num(p[f.key], f.label, f.min, f.max);
  if (p.commissioned != null && p.commissioned !== '') {
    if (!validYmd(p.commissioned)) throw new KmError('Érvénytelen beüzemelési dátum');
    out.commissioned = p.commissioned;
  } else out.commissioned = null;
  if (p.count_start != null && p.count_start !== '') {
    if (typeof p.count_start !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(p.count_start) || !validYmd(p.count_start.slice(0, 10))) throw new KmError('Érvénytelen „Count start” időpont');
    out.count_start = p.count_start;
  } else out.count_start = null;
  const ops = Array.isArray(p.operators) ? p.operators : [];
  out.operators = [...new Set(ops.map((o) => text(o, 60)).filter(Boolean))].slice(0, 30);
  return out;
}

// --- Termékek --------------------------------------------------------------
export function validateProduct(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) throw new KmError('Hiányzó adatok');
  const name = text(p.name, 120);
  if (!name) throw new KmError('Add meg a termék nevét');
  const manual = num(p.manual_min, 'kézi hegesztési idő', 0.01, 10000);
  return {
    name,
    program: text(p.program, 120),
    manual_min: manual == null ? null : Math.round(manual * 100) / 100,
    note: text(p.note, 1000),
    active: p.active !== false,
  };
}
async function listProducts(store) {
  const keys = await store.listKeys('p/');
  return (await Promise.all(keys.map((k) => store.get(k)))).filter(Boolean)
    .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, 'hu'));
}

// --- Napi bejegyzés --------------------------------------------------------
export function validateEntry(p, today, products) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) throw new KmError('Hiányzó adatok');
  if (!validYmd(p.date)) throw new KmError('Érvénytelen dátum');
  if (p.date > addDays(today, 1)) throw new KmError('A dátum nem lehet jövőbeli');
  if (p.date < MIN_DATE) throw new KmError('Túl régi dátum');
  const good = int(p.good, 'jó darab');
  const scrap = int(p.scrap, 'selejt');
  const reworked = int(p.reworked, 'javított');
  if (reworked > good) throw new KmError('A javított darab a jók közül való – nem lehet több, mint a jó darab');
  let product = null;
  if (p.product_id) {
    product = products.find((x) => x.id === p.product_id);
    if (!product) throw new KmError('Ismeretlen termék');
  }
  if ((good || scrap) && !product) throw new KmError('Válaszd ki a terméket');
  // Idő: kezdés–befejezés, vagy csak időtartam (perc).
  let start = null, end = null, minutes = null;
  if (p.start || p.end) {
    if (!HM_RE.test(p.start || '') || !HM_RE.test(p.end || '')) throw new KmError('A kezdés és a befejezés óra:perc legyen (pl. 7:30)');
    start = p.start.padStart(5, '0'); end = p.end.padStart(5, '0');
    minutes = spanMinutes(start, end);
    if (minutes > 16 * 60) throw new KmError('16 óránál hosszabb – ellenőrizd a kezdést és a befejezést');
  } else if (p.minutes !== null && p.minutes !== undefined && p.minutes !== '') {
    minutes = int(p.minutes, 'időtartam (perc)', 1440);
    if (minutes === 0) minutes = null;
  }
  const raw = Array.isArray(p.downtime) ? p.downtime : [];
  if (raw.length > 10) throw new KmError('Túl sok állásidő-sor');
  const downtime = raw.map((d, i) => {
    if (!d || !DOWN_KEYS.includes(d.reason)) throw new KmError(`Válaszd ki az állásidő okát (${i + 1}.)`);
    const min = int(d.min, 'állásidő (perc)', 1440);
    if (!min) throw new KmError(`Add meg az állásidő percét (${i + 1}.)`);
    return { reason: d.reason, min };
  });
  const down = downtime.reduce((s, d) => s + d.min, 0);
  if ((good || scrap) && !minutes) throw new KmError('Add meg, mennyi ideig ment (kezdés–befejezés vagy perc)');
  if (minutes && down > minutes) throw new KmError('Az állásidő nem lehet több, mint a kezdés–befejezés közötti idő');
  if (!good && !scrap && !minutes && !down) throw new KmError('Üres bejegyzés – adj meg darabot, időt vagy állásidőt');
  return {
    date: p.date,
    product_id: product ? product.id : null,
    product_name: product ? product.name : null,
    program: product ? product.program : null,
    good, scrap, reworked, start, end, minutes, downtime,
    note: text(p.note, 1000),
  };
}
const monthKey = (ym) => `e/${ym}`;
const ENTRY_FIELDS = ['date', 'product_id', 'good', 'scrap', 'reworked', 'start', 'end', 'minutes', 'downtime', 'note'];
const sameEntry = (a, b) => ENTRY_FIELDS.every((f) => JSON.stringify(a[f] ?? null) === JSON.stringify(b[f] ?? null));

// Egy hónap blobjának módosítása etaggel; ütközésnél újraolvas és újrapróbál.
async function mutateMonth(store, ym, fn) {
  for (let i = 0; i < 5; i++) {
    const cur = await store.getWithEtag(monthKey(ym));
    const data = cur?.data || { month: ym, entries: [] };
    const res = fn(data.entries);
    const next = { month: ym, entries: data.entries };
    const ok = cur ? await store.setIfMatch(monthKey(ym), next, cur.etag) : await store.setIfNew(monthKey(ym), next);
    if (ok) return res;
  }
  throw new KmError('Egyszerre túl sokan mentettek – próbáld újra', 409);
}
const monthsBetween = (from, to) => {
  const out = [];
  let [y, m] = from.slice(0, 7).split('-').map(Number);
  const [ty, tm] = to.slice(0, 7).split('-').map(Number);
  while (y < ty || (y === ty && m <= tm)) { out.push(`${y}-${String(m).padStart(2, '0')}`); if (++m > 12) { m = 1; y++; } if (out.length > 120) break; }
  return out;
};
async function readEntries(store, from, to) {
  const keys = new Set(await store.listKeys('e/'));
  const months = monthsBetween(from, to).filter((ym) => keys.has(monthKey(ym)));
  const blobs = await Promise.all(months.map((ym) => store.get(monthKey(ym))));
  return blobs.filter(Boolean).flatMap((b) => b.entries)
    .filter((e) => e.date >= from && e.date <= to)
    .sort((a, b) => a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at));
}
async function allEntries(store) {
  const keys = (await store.listKeys('e/')).filter((k) => YM_RE.test(k.slice(2)));
  const blobs = await Promise.all(keys.map((k) => store.get(k)));
  return blobs.filter(Boolean).flatMap((b) => b.entries)
    .sort((a, b) => a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at));
}
async function findEntry(store, id, date) {
  if (typeof id !== 'string' || !UUID_RE.test(id) || !validYmd(date)) throw new KmError('Nincs ilyen bejegyzés', 404);
  const blob = await store.get(monthKey(date.slice(0, 7)));
  const e = blob?.entries.find((x) => x.id === id);
  if (!e) throw new KmError('Nincs ilyen bejegyzés – lehet, hogy közben törölték vagy módosították. Frissítsd az oldalt.', 404);
  return e;
}
// Az operátor a saját, aznap rögzített bejegyzését javíthatja / törölheti
// (amíg az admin hozzá nem nyúlt – az admin javítása marad).
function canTouch(role, e, name, today) {
  if (role === 'admin') return true;
  return role === 'operator' && e.created_role === 'operator' && e.updated_role !== 'admin' && tsBudapestDay(e.created_at) === today && e.who === name;
}

// --- Számláló-mentés -------------------------------------------------------
export function validateReading(p, today) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) throw new KmError('Hiányzó adatok');
  if (!validYmd(p.date)) throw new KmError('Érvénytelen dátum');
  if (p.date > addDays(today, 1)) throw new KmError('A dátum nem lehet jövőbeli');
  if (p.date < MIN_DATE) throw new KmError('Túl régi dátum');
  let time = null;
  if (p.time) { if (!HM_RE.test(p.time)) throw new KmError('Az idő óra:perc legyen'); time = p.time.padStart(5, '0'); }
  const values = {};
  for (const k of COUNTER_KEYS) {
    const v = num(p.values?.[k], k, 0, 1e9);
    if (v == null) throw new KmError('Minden számláló értékét add meg');
    values[k] = Math.round(v * 10) / 10;
  }
  return { date: p.date, time, values, reset: !!p.reset, source: p.source === 'foto' ? 'foto' : 'kezi', note: text(p.note, 1000) };
}
async function listReadings(store) {
  const keys = await store.listKeys('c/');
  return sortReadings((await Promise.all(keys.map((k) => store.get(k)))).filter(Boolean));
}
const tsOfReading = (r) => Date.parse(`${r.date}T${r.time || '12:00'}:00Z`);

function needName(v) {
  const n = text(v, 60);
  if (!n) throw new KmError('Válaszd ki, ki vagy (név)');
  return n;
}

// store: { get, getWithEtag, setIfNew, setIfMatch, set, delete, listKeys }
export async function handle(rawBody, { store, codes, now = new Date(), newId = randomUUID }) {
  if (typeof rawBody !== 'string' || rawBody.length > MAX_BODY) throw new KmError('Túl nagy kérés', 413);
  let body;
  try { body = JSON.parse(rawBody); } catch { throw new KmError('Hibás kérés'); }
  if (!body || typeof body !== 'object') throw new KmError('Hibás kérés');

  const role = roleOf(body.code, codes);
  const action = body.action;
  if (!ALLOW[action]) throw new KmError('Ismeretlen művelet');
  if (!ALLOW[action].includes(role)) throw new KmError('Ehhez nincs jogosultságod', 403);
  if (action !== 'counter_create' && rawBody.length > MAX_JSON) throw new KmError('Túl nagy kérés', 413);
  const today = todayBudapest(now);
  const ts = now.toISOString();

  switch (action) {
    case 'ping':
      return { role };

    case 'meta': {
      const cfg = (await store.get(CFG_KEY)) || {};
      const products = await listProducts(store);
      return { role, cfg, products, today };
    }

    // Központ sziget: mai és havi darab, utolsó számláló-mentés.
    case 'summary': {
      const month = today.slice(0, 7);
      const rows = await readEntries(store, month + '-01', today);
      const readings = await listReadings(store);
      const sum = (list, f) => list.reduce((s, e) => s + (e[f] || 0), 0);
      const todays = rows.filter((e) => e.date === today);
      return {
        today: { good: sum(todays, 'good'), entries: todays.length, minutes: sum(todays, 'minutes') },
        month: { good: sum(rows, 'good'), scrap: sum(rows, 'scrap'), minutes: sum(rows, 'minutes'), entries: rows.length },
        last_reading: readings.length ? readings[readings.length - 1].date : null,
      };
    }

    // Bejegyzések egy időszakra. Az operátor csak az utolsó 7 napot látja.
    case 'entries': {
      let { from, to } = body;
      if (!validYmd(from) || !validYmd(to) || from > to) throw new KmError('Érvénytelen időszak');
      if (role === 'operator') { const lo = addDays(today, -(OPERATOR_DAYS - 1)); if (from < lo) from = lo; if (from > to) return []; }
      if ((toDate(to) - toDate(from)) / 86400000 > 800) throw new KmError('Túl hosszú időszak');
      return readEntries(store, from, to);
    }

    case 'entry_create': {
      const who = needName(body.name);
      const e = validateEntry(body.entry, today, await listProducts(store));
      const rec = { id: newId(), ...e, who, created_role: role, created_at: ts, version: 1, updated_at: null, updated_by: null, updated_role: null };
      await mutateMonth(store, e.date.slice(0, 7), (list) => { list.push(rec); });
      return rec;
    }

    case 'entry_update': {
      const name = needName(body.name);
      const cur = await findEntry(store, body.id, body.date);
      if (!canTouch(role, cur, name, today)) throw new KmError('Ezt a bejegyzést csak az admin javíthatja (az operátor a saját, aznapi bejegyzését).', 403);
      if (body.version !== cur.version) throw new KmError('Közben valaki módosította ezt a bejegyzést. Frissítsd az oldalt, és próbáld újra.', 409);
      const e = validateEntry(body.entry, today, await listProducts(store));
      if (sameEntry(cur, e)) return cur;
      // A régi változat megőrzése egyben zár is: ugyanazt a változatot csak egyszer lehet felülírni.
      if (!(await store.setIfNew(`h/${cur.id}/${cur.version}`, { ...cur, replaced_at: ts, replaced_by: name }))) {
        throw new KmError('Közben valaki módosította ezt a bejegyzést. Frissítsd az oldalt, és próbáld újra.', 409);
      }
      const next = { ...cur, ...e, version: cur.version + 1, updated_at: ts, updated_by: name, updated_role: role };
      const oldYm = cur.date.slice(0, 7), newYm = e.date.slice(0, 7);
      if (oldYm === newYm) {
        await mutateMonth(store, oldYm, (list) => { const i = list.findIndex((x) => x.id === cur.id); if (i >= 0) list[i] = next; else list.push(next); });
      } else {
        // Másik hónapba került: előbb az új helyre, utána ki a régiből.
        await mutateMonth(store, newYm, (list) => { list.push(next); });
        await mutateMonth(store, oldYm, (list) => { const i = list.findIndex((x) => x.id === cur.id); if (i >= 0) list.splice(i, 1); });
      }
      return next;
    }

    case 'entry_delete': {
      const name = needName(body.name);
      const cur = await findEntry(store, body.id, body.date);
      if (!canTouch(role, cur, name, today)) throw new KmError('Ezt a bejegyzést csak az admin törölheti (az operátor a saját, aznapi bejegyzését).', 403);
      await store.setIfNew(`d/${cur.id}`, { ...cur, deleted_by: name, deleted_at: ts });
      await mutateMonth(store, cur.date.slice(0, 7), (list) => { const i = list.findIndex((x) => x.id === cur.id); if (i >= 0) list.splice(i, 1); });
      return true;
    }

    case 'entry_history': {
      if (typeof body.id !== 'string' || !UUID_RE.test(body.id)) throw new KmError('Nincs ilyen bejegyzés', 404);
      const keys = await store.listKeys(`h/${body.id.toLowerCase()}/`);
      return (await Promise.all(keys.map((k) => store.get(k)))).filter(Boolean).sort((a, b) => b.version - a.version);
    }

    case 'counters':
      return listReadings(store);

    case 'counter_create': {
      const who = needName(body.name);
      const r = validateReading(body.reading, today);
      const all = await listReadings(store);
      // Csökkenő érték = nullázták a számlálót, vagy elírás. Csak jelöléssel engedjük.
      const before = all.filter((x) => tsOfReading(x) <= tsOfReading(r)).pop();
      if (before && !r.reset) {
        const lower = COUNTER_KEYS.filter((k) => r.values[k] < before.values[k]);
        if (lower.length) throw new KmError(`Kisebb érték, mint az előző mentésben (${before.date}): ${lower.join(', ')}. Ha nullázták a számlálót, jelöld be a „Nullázták” mezőt; különben ellenőrizd a számokat.`, 409);
      }
      const id = newId();
      let photo_id = null;
      if (body.photo != null) {
        const ph = body.photo;
        if (!ph || typeof ph.data !== 'string' || !/^image\/(jpeg|png|webp)$/.test(ph.mime || '') || !/^[A-Za-z0-9+/=]+$/.test(ph.data)) throw new KmError('Hibás fotó');
        if (ph.data.length > MAX_PHOTO) throw new KmError('A fotó túl nagy', 413);
        photo_id = newId();
        await store.setIfNew(`f/${photo_id}`, { mime: ph.mime, data: ph.data, created_at: ts });
      }
      const rec = { id, ...r, photo_id, by: who, created_role: role, created_at: ts };
      if (!(await store.setIfNew(`c/${r.date}/${id}`, rec))) throw new KmError('A mentés nem sikerült, próbáld újra', 409);
      return rec;
    }

    case 'counter_delete': {
      if (typeof body.id !== 'string' || !UUID_RE.test(body.id)) throw new KmError('Nincs ilyen mentés', 404);
      const key = (await store.listKeys('c/')).find((k) => k.endsWith('/' + body.id.toLowerCase()));
      const cur = key && await store.get(key);
      if (!cur) throw new KmError('Nincs ilyen mentés', 404);
      await store.setIfNew(`d/${cur.id}`, { ...cur, deleted_by: text(body.name, 60), deleted_at: ts });
      await store.delete(key);
      return true;
    }

    case 'photo': {
      if (typeof body.id !== 'string' || !UUID_RE.test(body.id)) throw new KmError('Nincs ilyen fotó', 404);
      const ph = await store.get(`f/${body.id.toLowerCase()}`);
      if (!ph) throw new KmError('Nincs ilyen fotó', 404);
      return { mime: ph.mime, data: ph.data };
    }

    // Minden adat a statisztikához (a számolás a böngészőben, robot-stat.js).
    case 'stats': {
      const [cfg, products, entries, readings] = await Promise.all([store.get(CFG_KEY), listProducts(store), allEntries(store), listReadings(store)]);
      return { cfg: cfg || {}, products, entries, readings, today };
    }

    case 'product_save': {
      const p = validateProduct(body.product);
      if (body.id != null) {
        if (typeof body.id !== 'string' || !UUID_RE.test(body.id)) throw new KmError('Ismeretlen termék', 404);
        const key = `p/${body.id.toLowerCase()}`;
        const cur = await store.getWithEtag(key);
        if (!cur?.data) throw new KmError('Ismeretlen termék', 404);
        const next = { ...cur.data, ...p, updated_at: ts };
        if (!(await store.setIfMatch(key, next, cur.etag))) throw new KmError('Közben módosult – frissítsd az oldalt', 409);
        return next;
      }
      const rec = { id: newId(), ...p, created_at: ts, updated_at: ts };
      if (!(await store.setIfNew(`p/${rec.id}`, rec))) throw new KmError('A mentés nem sikerült, próbáld újra', 409);
      return rec;
    }

    case 'cfg_save': {
      const c = validateCfg(body.cfg);
      const rec = { ...c, updated_at: ts };
      await store.set(CFG_KEY, rec);
      return rec;
    }

    default:
      throw new KmError('Ismeretlen művelet');
  }
}

export { DEFAULTS };
