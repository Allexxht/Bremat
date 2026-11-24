// =====================================================================
// Robot programteszt követő – közös logika (a böngésző és a szerver is
// ezt tölti, mint a tasks.js-t). 2. változat (2026. november 24., Alex):
// egyszerű – termék → részek (oldallemez, tompavarrat…), részenként
// állapot, óra (indít / állj) és jegyzetek.
//
// Egy termék = egy dokumentum; minden változás egy „művelet” (op), amit
// az applyOp() alkalmaz – az éles szerver és a demó (?demo) ugyanígy.
// Egyszerre csak egy óra mehet: indításkor a többi magától megáll
// (a terméken belül itt, a többi terméknél a szerver / demó gondoskodik róla).
// =====================================================================

export const PART_STATES = ['programozas', 'teszt', 'finomitas', 'kesz'];
export const PART_STATE = {
  programozas: { t: 'Programozás',      icon: 'code-xml' },
  teszt:       { t: 'Tesztelés alatt',  icon: 'flask-conical' },
  finomitas:   { t: 'Finomítás kell',   icon: 'wrench' },
  kesz:        { t: 'Kész',             icon: 'circle-check-big' },
};

const MAX = { parts: 100, notes: 300, sessions: 1000 };
const DAY_MS = 86400000;

export class PtError extends Error {}
const fail = (m) => { throw new PtError(m); };
const str = (v, max) => {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  const s = String(v).trim().slice(0, max);
  return s === '' ? null : s;
};
const pick = (arr, id, what) => arr.find((x) => x.id === id) || fail(`Ismeretlen ${what}`);

/** Egy új, üres termék. */
export function newProduct({ id, sku, name }, ts) {
  const s = str(sku, 60) || fail('Add meg a cikkszámot (pl. 2950.5750)');
  return { id, sku: s, name: str(name, 200), parts: [], created_at: ts, updated_at: ts, rev: 1 };
}

/** A futó óra(k) leállítása; a mért időt hozzáadja a részhez. Új dokumentumot ad, ha volt mit leállítani. */
export function stopRunning(src, now = new Date()) {
  if (!src.parts.some((x) => x.running_since)) return src;
  const p = structuredClone(src);
  const ts = now.toISOString();
  for (const part of p.parts) if (part.running_since) closeTimer(part, now);
  p.updated_at = ts; p.rev = (src.rev || 0) + 1;
  return p;
}
function closeTimer(part, now) {
  const from = part.running_since;
  const ms = Math.max(0, Math.min(now - Date.parse(from), DAY_MS));   // egy menet legfeljebb 24 óra
  part.spent_ms += ms;
  part.sessions.push({ from, to: now.toISOString(), ms });
  if (part.sessions.length > MAX.sessions) part.sessions.shift();
  part.running_since = null;
}

/**
 * Egy művelet. A `src` dokumentumot nem módosítja, újat ad vissza.
 * op.type: info, part_add, part_rename, part_delete, part_status,
 *          timer_start, timer_stop, time_fix, note_add, note_delete.
 */
export function applyOp(src, op, { now = new Date(), newId }) {
  if (!op || typeof op !== 'object') fail('Hibás művelet');
  const ts = now.toISOString();
  const p = structuredClone(src);
  const part = () => pick(p.parts, op.part, 'rész');

  switch (op.type) {
    case 'info': {
      if (op.sku !== undefined) p.sku = str(op.sku, 60) || fail('A cikkszám nem lehet üres');
      if (op.name !== undefined) p.name = str(op.name, 200);
      break;
    }
    case 'part_add': {
      const name = str(op.name, 120) || fail('Add meg a rész nevét (pl. oldallemez)');
      if (p.parts.length >= MAX.parts) fail('Túl sok rész');
      p.parts.push({ id: newId(), name, status: 'programozas', spent_ms: 0, running_since: null, sessions: [], notes: [], created_at: ts, updated_at: ts });
      break;
    }
    case 'part_rename': {
      const x = part();
      x.name = str(op.name, 120) || fail('A név nem lehet üres');
      x.updated_at = ts;
      break;
    }
    case 'part_delete': {
      const x = part();
      p.parts = p.parts.filter((y) => y !== x);
      break;
    }
    case 'part_status': {
      const x = part();
      if (!PART_STATES.includes(op.status)) fail('Érvénytelen állapot');
      if (x.status === op.status) return src;
      x.status = op.status;
      if (op.status === 'kesz' && x.running_since) closeTimer(x, now);   // kész → az óra megáll
      x.updated_at = ts;
      break;
    }
    case 'timer_start': {
      const x = part();
      if (x.running_since) return src;
      for (const y of p.parts) if (y.running_since) closeTimer(y, now);   // egyszerre csak egy óra
      x.running_since = ts;
      x.updated_at = ts;
      break;
    }
    case 'timer_stop': {
      const x = part();
      if (!x.running_since) return src;
      closeTimer(x, now);
      x.updated_at = ts;
      break;
    }
    case 'time_fix': {   // elfelejtett indítás / leállítás: perc hozzáadása (+) vagy levonása (−)
      const x = part();
      const m = Math.round(Number(op.minutes));
      if (!Number.isFinite(m) || m === 0 || Math.abs(m) > 24 * 60) fail('Hibás percszám');
      x.spent_ms = Math.max(0, x.spent_ms + m * 60000);
      x.sessions.push({ from: ts, to: ts, ms: m * 60000, fix: true });
      if (x.sessions.length > MAX.sessions) x.sessions.shift();
      x.updated_at = ts;
      break;
    }
    case 'note_add': {
      const x = part();
      const text = str(op.text, 4000) || fail('Üres jegyzet');
      if (x.notes.length >= MAX.notes) fail('Túl sok jegyzet');
      x.notes.push({ id: newId(), text, at: ts });
      x.updated_at = ts;
      break;
    }
    case 'note_delete': {
      const x = part();
      const n = pick(x.notes, op.note, 'jegyzet');
      x.notes = x.notes.filter((y) => y !== n);
      break;
    }
    default:
      fail('Ismeretlen művelet');
  }
  p.updated_at = ts;
  p.rev = (src.rev || 0) + 1;
  return p;
}

/** Egy rész eddigi ideje ms-ben (a futó órával együtt). */
export const partMs = (part, nowMs = Date.now()) => part.spent_ms + (part.running_since ? Math.max(0, Math.min(nowMs - Date.parse(part.running_since), DAY_MS)) : 0);
/** Összesítés egy termékre. */
export function summary(p, nowMs = Date.now()) {
  const done = p.parts.filter((x) => x.status === 'kesz').length;
  return {
    total_ms: p.parts.reduce((s, x) => s + partMs(x, nowMs), 0),
    done, parts: p.parts.length,
    running: p.parts.find((x) => x.running_since) || null,
    complete: p.parts.length > 0 && done === p.parts.length,
  };
}
export function fmtMs(ms) {
  const m = Math.floor(ms / 60000), h = Math.floor(m / 60);
  return h ? `${h} ó ${m % 60} p` : `${m} p`;
}
/** Órakijelző: 1:05:09 */
export function clock(ms) {
  const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return `${h}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
