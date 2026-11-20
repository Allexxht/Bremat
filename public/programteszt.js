// =====================================================================
// Robot programteszt követő – közös logika (a böngésző és a szerver is
// ezt tölti, mint a tasks.js-t). Egy termék = egy dokumentum; minden
// változás egy „művelet” (op), amit az applyOp() alkalmaz. Így az éles
// szerver (lib/kozpont-core.mjs) és a demó (?demo) pontosan ugyanúgy
// működik, és a napló (log) is magától íródik.
//
// A DTPS programfájl NEM kerül fel a netre: a böngésző csak a fájl nevét,
// méretét és SHA-256 ujjlenyomatát (hash) küldi. Ebből később bármelyik
// fájlról megmondható, melyik verzió (és hogy az-e az aktív).
// =====================================================================

export const PT_STATES = ['varakozik', 'programozas', 'teszt', 'finomitas', 'fonok_ok', 'automatizalt'];
export const PT_STATE = {
  varakozik:    { t: 'Várakozik',      icon: 'hourglass',        d: 'Még nincs termék / nincs elkezdve' },
  programozas:  { t: 'Programozás',    icon: 'code-xml',         d: 'DTPS-ben készül a program' },
  teszt:        { t: 'Teszt',          icon: 'flask-conical',    d: 'Próba a roboton' },
  finomitas:    { t: 'Finomítás',      icon: 'wrench',           d: 'Javítás a teszt után' },
  fonok_ok:     { t: 'Főnök OK',       icon: 'thumbs-up',        d: 'Jóváhagyva, automatizálásra vár' },
  automatizalt: { t: 'Automatizált',   icon: 'circle-check-big', d: 'Kész, a termelésben megy' },
};
export const PT_RESULTS = {
  jo:        { t: 'Jól ment',               icon: 'circle-check' },
  finomitas: { t: 'Finomítás kellett',      icon: 'wrench' },
  ujra:      { t: 'Szakasz újraprogramozva', icon: 'rotate-ccw' },
  rossz:     { t: 'Nem ment',               icon: 'circle-x' },
};
export const PT_KINDS = {
  programozas: 'Programozás',
  teszt: 'Teszt a roboton',
  finomitas: 'Finomítás',
  egyeb: 'Egyéb',
};
export const PT_STALE_DAYS = 14;   // ennyi nap mozgás nélkül: „Elakadt?” jelzés

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const HASH = /^[0-9a-f]{64}$/;
const MAX = { list: 200, log: 500 };

export class PtError extends Error {}
const fail = (m) => { throw new PtError(m); };

const str = (v, max) => {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  const s = String(v).trim().slice(0, max);
  return s === '' ? null : s;
};
const ymd = (v) => {
  const s = str(v, 10);
  if (!s) return null;
  if (!YMD.test(s) || Number.isNaN(Date.parse(s + 'T00:00:00Z'))) fail('Hibás dátum');
  return s;
};
const mins = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < 0 || n > 24 * 60 * 31) fail('Hibás időtartam (perc)');
  return n;
};
const pick = (arr, id, what) => arr.find((x) => x.id === id) || fail(`Ismeretlen ${what}`);
const capped = (arr, what) => { if (arr.length >= MAX.list) fail(`Túl sok ${what}`); };

/** Egy új, üres termék. */
export function newProduct({ id, sku, name, note, received_at }, ts) {
  const s = str(sku, 60);
  if (!s) fail('Add meg a cikkszámot (pl. 2950.5750)');
  const p = {
    id, sku: s, name: str(name, 200), note: str(note, 4000),
    status: 'varakozik',
    received_at: ymd(received_at), prog_start: null, test_start: null,
    boss_ok_at: null, boss_ok_by: null, done_at: null,
    paused: null, pauses: [],
    parts: [], rounds: [], issues: [], times: [], notes: [],
    log: [], created_at: ts, updated_at: ts, rev: 1,
  };
  p.log.push({ at: ts, t: `Felvéve: ${p.sku}${p.name ? ' – ' + p.name : ''}` });
  return p;
}

const fileInfo = (f) => {
  if (!f || typeof f !== 'object') return null;
  const name = str(f.name, 260);
  if (!name) return null;
  const hash = typeof f.hash === 'string' && HASH.test(f.hash.toLowerCase()) ? f.hash.toLowerCase() : null;
  const size = Number.isFinite(Number(f.size)) && Number(f.size) >= 0 ? Math.round(Number(f.size)) : null;
  return { name, size, hash };
};
const today = (ts) => ts.slice(0, 10);

/**
 * Egy művelet alkalmazása. A `p` dokumentumot nem módosítja, újat ad vissza.
 * op.type szerint: info, status, pause, resume, part_add, part_rename, part_delete,
 * version_add, version_activate, round_add, round_delete, issue_add, issue_solve,
 * issue_reopen, issue_delete, time_add, time_delete, note_add.
 */
export function applyOp(src, op, { now = new Date(), newId }) {
  if (!op || typeof op !== 'object') fail('Hibás művelet');
  const ts = now.toISOString();
  const p = structuredClone(src);
  const log = (t) => { p.log.push({ at: ts, t }); if (p.log.length > MAX.log) p.log.splice(0, p.log.length - MAX.log); };
  const partName = (id) => p.parts.find((x) => x.id === id)?.name || '?';

  switch (op.type) {
    case 'info': {
      if (op.sku !== undefined) { const s = str(op.sku, 60); if (!s) fail('A cikkszám nem lehet üres'); p.sku = s; }
      if (op.name !== undefined) p.name = str(op.name, 200);
      if (op.note !== undefined) p.note = str(op.note, 4000);
      for (const k of ['received_at', 'prog_start', 'test_start']) if (op[k] !== undefined) p[k] = ymd(op[k]);
      log('Adatok módosítva');
      break;
    }
    case 'status': {
      if (!PT_STATES.includes(op.status)) fail('Érvénytelen állapot');
      if (op.status === p.status) return src;
      const from = p.status;
      p.status = op.status;
      const d = today(ts);
      if (op.status === 'programozas' && !p.prog_start) p.prog_start = d;
      if ((op.status === 'teszt' || op.status === 'finomitas') && !p.test_start) p.test_start = d;
      if (op.status === 'fonok_ok' || op.status === 'automatizalt') {
        if (!p.boss_ok_at) { p.boss_ok_at = d; p.boss_ok_by = str(op.by, 120); }
      }
      if (op.status === 'automatizalt') {
        p.done_at = d;
        if (p.paused) { p.pauses.push({ from: p.paused.since, to: d, reason: p.paused.reason }); p.paused = null; }
      } else p.done_at = null;
      if (PT_STATES.indexOf(op.status) < PT_STATES.indexOf('fonok_ok')) { p.boss_ok_at = null; p.boss_ok_by = null; }
      log(`Állapot: ${PT_STATE[from].t} → ${PT_STATE[op.status].t}${op.status === 'fonok_ok' && p.boss_ok_by ? ` (${p.boss_ok_by})` : ''}`);
      break;
    }
    case 'pause': {
      if (p.paused) fail('Már szünetel');
      if (p.status === 'automatizalt') fail('Kész terméket nem lehet szüneteltetni');
      p.paused = { since: today(ts), reason: str(op.reason, 500) };
      log(`Szünet${p.paused.reason ? ': ' + p.paused.reason : ''}`);
      break;
    }
    case 'resume': {
      if (!p.paused) fail('Nem szünetel');
      p.pauses.push({ from: p.paused.since, to: today(ts), reason: p.paused.reason });
      if (p.pauses.length > MAX.list) p.pauses.shift();
      p.paused = null;
      log('Folytatás a szünet után');
      break;
    }

    // ---------- Programrészek és verziók ----------
    case 'part_add': {
      const name = str(op.name, 120) || fail('Add meg a rész nevét (pl. oldallemez)');
      capped(p.parts, 'programrész');
      p.parts.push({ id: newId(), name, versions: [], active: null, created_at: ts });
      log(`Új programrész: ${name}`);
      break;
    }
    case 'part_rename': {
      const part = pick(p.parts, op.part, 'programrész');
      const name = str(op.name, 120) || fail('A név nem lehet üres');
      log(`Rész átnevezve: ${part.name} → ${name}`);
      part.name = name;
      break;
    }
    case 'part_delete': {
      const part = pick(p.parts, op.part, 'programrész');
      p.parts = p.parts.filter((x) => x !== part);
      log(`Programrész törölve: ${part.name} (${part.versions.length} verzió)`);
      break;
    }
    case 'version_add': {
      const part = pick(p.parts, op.part, 'programrész');
      capped(part.versions, 'verzió');
      const file = fileInfo(op.file);
      if (file?.hash) {
        const dup = part.versions.find((v) => v.file?.hash === file.hash);
        if (dup) fail(`Ez a fájl már megvan: V${dup.v}`);
      }
      const v = part.versions.reduce((m, x) => Math.max(m, x.v), 0) + 1;
      const ver = { id: newId(), v, file, change: str(op.change, 2000), at: ts };
      part.versions.push(ver);
      part.active = ver.id;
      log(`${part.name}: új verzió V${v}${ver.change ? ' – ' + ver.change : ''} (ez az aktív)`);
      break;
    }
    case 'version_activate': {
      const part = pick(p.parts, op.part, 'programrész');
      const ver = pick(part.versions, op.version, 'verzió');
      if (part.active === ver.id) return src;
      part.active = ver.id;
      log(`${part.name}: aktív verzió visszaállítva V${ver.v}-re`);
      break;
    }

    // ---------- Teszt körök (felvonások) ----------
    case 'round_add': {
      capped(p.rounds, 'teszt kör');
      const result = op.result in PT_RESULTS ? op.result : fail('Válaszd ki, hogy ment a teszt');
      const n = p.rounds.reduce((m, x) => Math.max(m, x.n), 0) + 1;
      const date = ymd(op.date) || today(ts);
      // melyik verziókkal ment: a pillanatnyi aktív verziók
      const versions = p.parts.filter((x) => x.active).map((x) => ({ part: x.id, name: x.name, v: x.versions.find((v) => v.id === x.active)?.v ?? null }));
      p.rounds.push({ id: newId(), n, date, result, minutes: mins(op.minutes), note: str(op.note, 4000), versions, at: ts });
      if (!p.test_start || date < p.test_start) p.test_start = date;
      if (p.status === 'varakozik' || p.status === 'programozas') p.status = 'teszt';
      log(`${n}. teszt kör: ${PT_RESULTS[result].t}`);
      break;
    }
    case 'round_delete': {
      const r = pick(p.rounds, op.round, 'teszt kör');
      p.rounds = p.rounds.filter((x) => x !== r);
      log(`${r.n}. teszt kör törölve`);
      break;
    }

    // ---------- Hibák és megoldások ----------
    case 'issue_add': {
      capped(p.issues, 'hiba');
      const text = str(op.text, 2000) || fail('Írd le a hibát');
      const part = op.part ? pick(p.parts, op.part, 'programrész').id : null;
      const round = op.round ? Number(op.round) : (p.rounds.at(-1)?.n ?? null);
      const sol = str(op.solution, 2000);
      p.issues.push({ id: newId(), text, part, round: Number.isInteger(round) ? round : null, solution: sol, status: sol ? 'megoldva' : 'nyitott', at: ts, solved_at: sol ? ts : null });
      log(`Hiba${part ? ` (${partName(part)})` : ''}: ${text}`);
      break;
    }
    case 'issue_solve': {
      const it = pick(p.issues, op.issue, 'hiba');
      it.solution = str(op.solution, 2000) || fail('Írd le a megoldást');
      if (it.status !== 'megoldva') it.solved_at = ts;
      it.status = 'megoldva';
      log(`Megoldva: ${it.text} → ${it.solution}`);
      break;
    }
    case 'issue_reopen': {
      const it = pick(p.issues, op.issue, 'hiba');
      it.status = 'nyitott'; it.solved_at = null;
      log(`Hiba újra nyitva: ${it.text}`);
      break;
    }
    case 'issue_delete': {
      const it = pick(p.issues, op.issue, 'hiba');
      p.issues = p.issues.filter((x) => x !== it);
      log(`Hiba törölve: ${it.text}`);
      break;
    }

    // ---------- Időráfordítás ----------
    case 'time_add': {
      capped(p.times, 'időbejegyzés');
      const kind = op.kind in PT_KINDS ? op.kind : fail('Válaszd ki, mire ment az idő');
      const minutes = mins(op.minutes);
      if (!minutes) fail('Add meg, hány perc volt');
      const date = ymd(op.date) || today(ts);
      p.times.push({ id: newId(), date, kind, minutes, note: str(op.note, 1000), at: ts });
      if (kind === 'programozas' && (!p.prog_start || date < p.prog_start)) p.prog_start = date;
      log(`Idő: ${PT_KINDS[kind]} ${fmtMin(minutes)}`);
      break;
    }
    case 'time_delete': {
      const t = pick(p.times, op.time, 'időbejegyzés');
      p.times = p.times.filter((x) => x !== t);
      log(`Időbejegyzés törölve: ${PT_KINDS[t.kind]} ${fmtMin(t.minutes)}`);
      break;
    }

    // ---------- Jegyzet („hol tartok”) ----------
    case 'note_add': {
      capped(p.notes, 'jegyzet');
      const text = str(op.text, 4000) || fail('Üres jegyzet');
      p.notes.push({ id: newId(), text, at: ts });
      log('Jegyzet: ' + (text.length > 80 ? text.slice(0, 79) + '…' : text));
      break;
    }
    default:
      fail('Ismeretlen művelet');
  }
  p.updated_at = ts;
  p.rev = (src.rev || 0) + 1;
  return p;
}

export function fmtMin(m) {
  if (!m) return '0 p';
  const h = Math.floor(m / 60), r = m % 60;
  return h ? (r ? `${h} ó ${r} p` : `${h} ó`) : `${r} p`;
}
const dayDiff = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);

/** Összesítés egy termékre – a statisztikához és a kártyákhoz. `todayYmd`: a mai nap. */
export function stats(p, todayYmd) {
  const byKind = Object.fromEntries(Object.keys(PT_KINDS).map((k) => [k, 0]));
  for (const t of p.times) byKind[t.kind] = (byKind[t.kind] || 0) + t.minutes;
  const roundMin = p.rounds.reduce((s, r) => s + (r.minutes || 0), 0);
  byKind.teszt += roundMin;   // a teszt körnél beírt idő is teszt idő
  const total = Object.values(byKind).reduce((s, x) => s + x, 0);
  const start = [p.received_at, p.prog_start, p.created_at?.slice(0, 10)].filter(Boolean).sort()[0];
  const end = p.done_at || todayYmd;
  const pausedDays = p.pauses.reduce((s, x) => s + Math.max(0, dayDiff(x.from, x.to)), 0) + (p.paused ? Math.max(0, dayDiff(p.paused.since, todayYmd)) : 0);
  const lastAt = p.log.at(-1)?.at || p.updated_at;
  const idleDays = Math.max(0, dayDiff(lastAt.slice(0, 10), todayYmd));
  return {
    total, byKind,
    rounds: p.rounds.length,
    lastRound: p.rounds.at(-1) || null,
    issues: p.issues.length,
    openIssues: p.issues.filter((x) => x.status !== 'megoldva').length,
    versions: p.parts.reduce((s, x) => s + x.versions.length, 0),
    parts: p.parts.length,
    leadDays: start ? Math.max(0, dayDiff(start, end)) : 0,
    pausedDays, idleDays,
    stale: p.status !== 'automatizalt' && !p.paused && idleDays >= PT_STALE_DAYS,
  };
}

/** Melyik verzió ez a fájl? (ujjlenyomat alapján) */
export function findByHash(products, hash) {
  const out = [];
  for (const p of products) for (const part of p.parts) for (const v of part.versions) {
    if (v.file?.hash === hash) out.push({ product: p, part, version: v, active: part.active === v.id, latest: v.v === Math.max(...part.versions.map((x) => x.v)) });
  }
  return out;
}
