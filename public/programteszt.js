// =====================================================================
// Robot programok – közös logika (a böngésző és a szerver is ezt tölti,
// mint a tasks.js-t). 3. változat (2026. november 26., Alex):
//
// A termékek, részek és verziók MAGUKTÓL jönnek a DTPS mappából: a Teendőim
// 5 percenként beolvassa (C:\robotinstallation\…\Alex\<termék>\Teaching\),
// és csak a neveket + dátumokat küldi fel (pt_sync). A programfájl a gépen marad.
//
// Programnév (Alex szabálya):  R001_[V7_ | V2_UJ_ | V7-UJ_]2950_7510_OLDAL_LEMEZ_B.rp4
//   R001  = 1. robot,  V… = verzió (nincs = Alap, UJ = teljesen újraírt),
//   2950_7510 = cikkszám,  utána a rész neve.
//
// Részenként: állapot (Tesztre vár / Javítani kell / Kis finomítás / Kész), a javítandó
// pontok (pipálhatók), a tesztek listája, VERZIÓNKÉNTI infó (az Alaphoz írt az Alapnál
// marad, a V1-hez írt a V1-nél…) és egy ÖSSZESÍTŐ infó a részhez (verziótól független).
// Új verzió a mappában → „Tesztre vár”.
// Egy termék = egy dokumentum; Alex lépései „műveletek” (applyOp).
// =====================================================================

export const STATES = ['wait', 'fix', 'tweak', 'ok', 'auto'];
export const STATE = {
  wait:   { t: 'Tesztre vár',   order: 0 },
  fix:    { t: 'Javítani kell', order: 1 },
  custom: { t: 'Saját állapot', order: 1.5 },   // Alex bármit beírhat, színnel (2026. nov. 26.)
  tweak:  { t: 'Kis finomítás', order: 2 },
  ok:     { t: 'Kész',          order: 3 },
  auto:   { t: 'Automatizálva', order: 4 },   // a program megy a gyártásban (2026. nov. 27., Alex)
};
/** A termék állapota (Alex, 2026. nov. 27.): mi van most munkában. Alap: Áll. */
export const PSTATES = {
  test: { t: 'Tesztelés alatt', order: 0 },   // erősen kiemelve
  idle: { t: 'Áll',             order: 1 },   // semmi extra
  auto: { t: 'Automatizált',    order: 2 },   // kiemelve, de kevésbé
  off:  { t: 'Munkán kívül',    order: 3 },   // szürke, háttérben
};
export const pstateOf = (p) => (PSTATES[p.pstate] ? p.pstate : 'idle');
/** A saját állapot színei (kulcs tárolódik, nem a színkód). */
export const COLORS = {
  violet: { t: 'Lila', hex: '#7b3fe4' }, pink: { t: 'Rózsaszín', hex: '#d6337a' }, orange: { t: 'Narancs', hex: '#e8631c' },
  teal: { t: 'Türkiz', hex: '#0a9bb0' }, blue: { t: 'Kék', hex: '#2563c9' }, green: { t: 'Zöld', hex: '#1f9d55' },
  amber: { t: 'Sárga', hex: '#c27c00' }, red: { t: 'Piros', hex: '#d1342f' }, grey: { t: 'Szürke', hex: '#6b7280' },
};
/** Jelölés a részen (az állapottól független): kihúzva (nem kell, a lista aljára kerül, nem számít bele),
 *  csak teszt, ideiglenes. A táblában más keretet kap. */
export const MARKS = {
  strike: { t: 'Kihúzva', hex: '#6b7280' },
  test:   { t: 'Csak teszt', hex: '#7b3fe4' },
  temp:   { t: 'Ideiglenes', hex: '#e8631c' },
};
/** A rész állapota megjelenítéshez: { k, t, color } – a color CSS-érték (a beépítetteknél a --st-* változó). */
export function stateOf(part) {
  if (part.status === 'custom') {
    const c = COLORS[part.custom?.c] ? part.custom.c : 'grey';
    return { k: 'custom', t: part.custom?.t || STATE.custom.t, color: COLORS[c].hex, c };
  }
  const k = STATE[part.status] ? part.status : 'wait';
  return { k, t: STATE[k].t, color: `var(--st-${k})` };
}
/** Időmérés (Alex, 2026. nov. 27.): mire ment el az idő. A programozás = iroda + kint. */
export const TKINDS = {
  prog: { t: 'Programozás', s: 'iroda (DTPS)' },     // a Teendőim méri magától, amíg a DTPS elöl van
  kint: { t: 'Javítás kint', s: 'a robotnál' },      // a robotnál, a pendanton javítva – óra a panelen
  test: { t: 'Teszt', s: 'a robotnál' },             // óra a panelen; „Minden tökéletes” / „Mi a teendő?” leállítja
};
const MAX = { time: 4000, parts: 200, versions: 100, points: 300, tests: 300, notes: 500, products: 300, programs: 400 };

export class PtError extends Error {}
const fail = (m) => { throw new PtError(m); };
const str = (v, max) => {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  const s = String(v).trim().slice(0, max);
  return s === '' ? null : s;
};
const pick = (arr, id, what) => arr.find((x) => x.id === id) || fail(`Ismeretlen ${what}`);

// ---------- Nevek ----------

/** Termékmappa: „2950.7510 - Voorraadmenger S-series - kad extra” → cikkszám + megnevezés. */
export function parseFolder(folder) {
  const f = String(folder).trim();
  const m = f.match(/^(.*?\S)\s+-\s+(.+)$/);
  return m ? { sku: m[1].trim(), name: m[2].replace(/\s+/g, ' ').trim() } : { sku: f, name: null };
}

/**
 * Programmappa: „R001_V7-UJ_2950_7510_OLDAL-L_BEL.rp4” →
 * { robot: 1, file: 'V7-UJ_2950_7510_OLDAL-L_BEL.rp4', v: 'V7-UJ', n: 7, uj: true, part: 'OLDAL-L_BEL', key: 'OLDAL_L_BEL' }
 * A cikkszám (2950.7510 → 2950_7510) a terméké; ha a programnévben nincs, a rész neve a maradék.
 */
export function parseProgram(dir, sku) {
  const m = String(dir).trim().match(/^R(\d{1,3})_(.+)\.rp4$/i);
  if (!m) return null;
  const file = `${m[2]}.rp4`;
  let rest = m[2];
  let v = 'Alap', n = 0, uj = false;
  const vm = rest.match(/^V(\d{1,3})((?:[-_]UJ)?)[-_](.+)$/i);
  if (vm) { n = Number(vm[1]); uj = !!vm[2]; v = `V${vm[1]}${vm[2] ? vm[2].toUpperCase() : ''}`; rest = vm[3]; }
  else {
    const um = rest.match(/^UJ[-_](.+)$/i);   // „UJ_…” verziószám nélkül
    if (um) { uj = true; v = 'UJ'; rest = um[1]; }
  }
  if (sku) {
    // a cikkszám elválasztói (. - _ szóköz) a programnévben bármelyikek lehetnek
    const re = new RegExp('^' + String(sku).trim().split(/[.\-_\s]+/).map((x) => x.replace(/[^\w]/g, (c) => `\\${c}`)).join('[._\\-\\s]') + '[._\\-\\s]+', 'i');
    if (re.test(rest)) rest = rest.replace(re, '');
  }
  const part = rest.trim();
  if (!part) return null;
  return { robot: Number(m[1]), file, dir: String(dir).trim(), v, n, uj, part, key: partKey(part) };
}
export const partKey = (s) => String(s).toUpperCase().replace(/[\s\-_]+/g, '_').replace(/^_+|_+$/g, '');

/** Verziók sorrendje: szám, utána UJ, végül a dátum (a legfrissebb az utolsó). */
const vCmp = (a, b) => a.n - b.n || Number(a.uj) - Number(b.uj) || String(a.m || '').localeCompare(String(b.m || ''));
export const latestOf = (part) => part.versions[part.versions.length - 1] || null;

// ---------- Szinkron a DTPS mappából ----------

const isoOf = (m) => {
  const t = typeof m === 'number' ? m : Date.parse(m);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
};

/**
 * A mappa egy termékének mostani állapota alapján frissíti a dokumentumot.
 * src: a meglévő dokumentum vagy null; item: { folder, programs: [{ n: 'R001_….rp4', m: dátum }] }.
 * Új dokumentumot ad (vagy ugyanazt, ha semmi nem változott).
 */
export function syncProduct(src, item, { now = new Date(), newId }) {
  const folder = str(item?.folder, 200) || fail('Hiányzó termékmappa');
  const ts = now.toISOString();
  const { sku, name } = parseFolder(folder);
  const p = src ? structuredClone(src) : { id: newId(), folder, sku, name, parts: [], gone: false, created_at: ts, updated_at: ts, rev: 0 };
  const before = JSON.stringify(src ? { f: src.folder, s: src.sku, n: src.name, g: src.gone, parts: src.parts } : null);
  p.folder = folder; p.sku = sku; p.name = name; p.gone = false;

  // programok részenként
  const groups = new Map();
  for (const x of (Array.isArray(item.programs) ? item.programs : []).slice(0, MAX.programs)) {
    const pr = parseProgram(str(x?.n, 200) || '', sku);
    if (!pr) continue;
    const ver = { v: pr.v, n: pr.n, uj: pr.uj, dir: pr.dir, file: pr.file, robot: pr.robot, part: pr.part, m: isoOf(x.m) };
    if (!groups.has(pr.key)) groups.set(pr.key, { name: pr.part, versions: [] });
    groups.get(pr.key).versions.push(ver);
  }
  for (const [key, g] of groups) {
    g.versions.sort(vCmp);
    let part = p.parts.find((x) => x.key === key);
    if (!part) {
      if (p.parts.length >= MAX.parts) continue;
      part = { id: newId(), key, name: g.name, status: 'wait', versions: [], points: [], notes: [], info: '', tests: [], tested: null, ok_at: null, gone: false, created_at: ts, updated_at: ts };
      p.parts.push(part);
    }
    const prevLatest = latestOf(part)?.dir || null;
    part.versions = g.versions.slice(-MAX.versions);
    part.name = latestOf(part).part;   // ahogy a legfrissebb programban szerepel (pl. OLDAL-L_BEL)
    part.gone = false;
    const latest = latestOf(part).dir;
    // új verzió jelent meg (amit még nem teszteltél) → tesztre vár
    if (latest !== prevLatest && part.tested !== latest && part.status !== 'wait' && prevLatest !== null) { part.status = 'wait'; part.updated_at = ts; }
    if (latest !== prevLatest) part.updated_at = ts;
  }
  for (const part of p.parts) if (!groups.has(part.key) && !part.gone) { part.gone = true; part.updated_at = ts; }

  if (JSON.stringify({ f: p.folder, s: p.sku, n: p.name, g: p.gone, parts: p.parts }) === before) return src;
  p.updated_at = ts; p.rev = (src?.rev || 0) + 1;
  return p;
}

/** A mappában már nem szereplő termék: elrejtve (az adatai megmaradnak). */
export function markGone(src, now = new Date()) {
  if (src.gone) return src;
  return { ...structuredClone(src), gone: true, updated_at: now.toISOString(), rev: (src.rev || 0) + 1 };
}

// ---------- Alex lépései ----------

/**
 * op.type:
 *   test_ok      { part }            – Teszteltem: minden tökéletes → Kész (a pontok kipipálva)
 *   test_fix     { part, text }      – Teszteltem: észrevételek (soronként egy pont) → Javítani kell
 *   point_toggle { part, point }     – pont kipipálása / vissza
 *   point_delete { part, point }
 *   status       { part, status }    – kézi állapot (Tesztre vár / Javítani kell / Kis finomítás / Kész)
 *   pstate       { pstate }          – a TERMÉK állapota (nem kell part): test | idle | auto | off
 *   mark         { part, mark }      – jelölés: 'strike' | 'test' | 'temp' | null (nincs)
 *   status_custom { part, text, color } – saját állapot: bármilyen szöveg (max. 40 betű) + szín (COLORS kulcsa)
 *   note_add     { part, text }      – infó a legfrissebb verzióhoz (a verzióval együtt megmarad)
 *   note_delete  { part, note }
 *   info_set     { part, text }      – összesítő infó a részhez (verziótól független)
 *   time_start   { part, kind }      – óra indul (kind: TKINDS kulcsa); a futó óra (ha van) megáll
 *   time_stop    { at? }             – a futó óra megáll (at: ha elfelejtetted, mikor hagytad abba)
 *   time_fix     { part, kind, min, day? } – kézi javítás: + / − perc (a legfrissebb verzióhoz)
 *   time_delete  { entry }           – időbejegyzés törlése
 */
export function applyOp(src, op, { now = new Date(), newId }) {
  if (!op || typeof op !== 'object') fail('Hibás művelet');
  const ts = now.toISOString();
  const p = structuredClone(src);
  if (op.type === 'time_stop') {
    const e = runningOf(p); if (!e) return src;
    let end = now.getTime();
    if (op.at != null) { const t = Date.parse(op.at); if (!Number.isFinite(t) || t > end + 60000 || t < Date.parse(e.from)) fail('Érvénytelen időpont'); end = Math.min(t, end); }
    e.ms = Math.min(RUN_CAP, Math.max(0, end - Date.parse(e.from)));
    if (e.ms < 10000) p.time = p.time.filter((y) => y !== e);   // véletlen koppintás
    p.updated_at = ts; p.rev = (src.rev || 0) + 1;
    return p;
  }
  if (op.type === 'time_delete') {
    const e = pick(p.time || [], op.entry, 'időbejegyzés');
    p.time = p.time.filter((y) => y !== e);
    p.updated_at = ts; p.rev = (src.rev || 0) + 1;
    return p;
  }
  if (op.type === 'pstate') {
    if (!PSTATES[op.pstate]) fail('Érvénytelen termékállapot');
    if (pstateOf(src) === op.pstate) return src;
    p.pstate = op.pstate; p.pstate_at = ts; p.updated_at = ts; p.rev = (src.rev || 0) + 1;
    return p;
  }
  const part = pick(p.parts, op.part, 'rész');
  const v = latestOf(part);

  switch (op.type) {
    case 'time_start': {
      if (!TKINDS[op.kind]) fail('Érvénytelen időfajta');
      const r = runningOf(p);
      if (r && r.part === part.id && r.k === op.kind) return src;
      if (r) r.ms = Math.min(RUN_CAP, Math.max(0, now.getTime() - Date.parse(r.from)));
      p.time ||= [];
      if (p.time.length >= MAX.time) fail('Túl sok időbejegyzés');
      p.time.push({ id: newId(), part: part.id, k: op.kind, v: v?.v || null, from: ts, ms: null, src: 'ora' });
      p.updated_at = ts; p.rev = (src.rev || 0) + 1;
      return p;   // a rész sorrendje ne változzon
    }
    case 'time_fix': {
      if (!TKINDS[op.kind]) fail('Érvénytelen időfajta');
      const min = Math.round(Number(op.min));
      if (!Number.isFinite(min) || min === 0 || Math.abs(min) > 720) fail('Adj meg perceket (legfeljebb 12 óra)');
      let from = ts;
      if (op.day) { if (!/^\d{4}-\d{2}-\d{2}$/.test(op.day) || Date.parse(op.day) > now.getTime()) fail('Érvénytelen nap'); from = `${op.day}T11:00:00.000Z`; }
      p.time ||= [];
      if (p.time.length >= MAX.time) fail('Túl sok időbejegyzés');
      p.time.push({ id: newId(), part: part.id, k: op.kind, v: v?.v || null, from, ms: min * 60000, src: 'kezi' });
      p.updated_at = ts; p.rev = (src.rev || 0) + 1;
      return p;
    }
    case 'test_ok': {
      for (const x of part.points) if (!x.done) { x.done = true; x.done_at = ts; }
      part.status = 'ok'; part.ok_at = ts; part.tested = v?.dir || null;
      part.tests.push({ at: ts, v: v?.v || null, ok: true });
      stopTest(p, part, now);
      break;
    }
    case 'test_fix': {
      const lines = String(op.text ?? '').split(/\r?\n/).map((s) => str(s, 500)).filter(Boolean);
      if (!lines.length) fail('Írj legalább egy észrevételt');
      if (part.points.length + lines.length > MAX.points) fail('Túl sok pont');
      for (const t of lines) part.points.push({ id: newId(), text: t, v: v?.v || null, at: ts, done: false, done_at: null });
      part.status = 'fix'; part.ok_at = null; part.tested = v?.dir || null;
      part.tests.push({ at: ts, v: v?.v || null, ok: false, n: lines.length });
      stopTest(p, part, now);
      break;
    }
    case 'point_toggle': {
      const x = pick(part.points, op.point, 'pont');
      x.done = !x.done; x.done_at = x.done ? ts : null;
      break;
    }
    case 'point_delete': {
      const x = pick(part.points, op.point, 'pont');
      part.points = part.points.filter((y) => y !== x);
      break;
    }
    case 'status': {
      if (!STATES.includes(op.status)) fail('Érvénytelen állapot');
      if (part.status === op.status) return src;
      part.status = op.status;
      part.ok_at = op.status === 'ok' || op.status === 'auto' ? (part.ok_at || ts) : null;
      break;
    }
    case 'status_custom': {
      const t = str(op.text, 40) || fail('Írd be az állapotot');
      if (!COLORS[op.color]) fail('Érvénytelen szín');
      if (part.status === 'custom' && part.custom?.t === t && part.custom?.c === op.color) return src;
      part.status = 'custom'; part.custom = { t, c: op.color }; part.ok_at = null;
      break;
    }
    case 'mark': {
      const m = op.mark || null;
      if (m !== null && !MARKS[m]) fail('Érvénytelen jelölés');
      if ((part.mark || null) === m) return src;
      part.mark = m;
      break;
    }
    case 'note_add': {
      const text = str(op.text, 4000) || fail('Üres infó');
      part.notes ||= [];
      if (part.notes.length >= MAX.notes) fail('Túl sok infó');
      part.notes.push({ id: newId(), text, v: v?.v || 'Alap', dir: v?.dir || null, at: ts });
      break;
    }
    case 'note_delete': {
      const x = pick(part.notes || [], op.note, 'infó');
      part.notes = part.notes.filter((y) => y !== x);
      break;
    }
    case 'info_set': {
      const text = str(op.text, 8000) || '';
      if ((part.info || '') === text) return src;
      part.info = text; part.info_at = ts;
      break;
    }
    default:
      fail('Ismeretlen művelet');
  }
  if (part.tests.length > MAX.tests) part.tests.splice(0, part.tests.length - MAX.tests);
  part.updated_at = ts;
  p.updated_at = ts;
  p.rev = (src.rev || 0) + 1;
  return p;
}

// ---------- Időmérés ----------

const RUN_CAP = 10 * 3600000;   // egy elfelejtett óra legfeljebb 10 órát számít
export const runningOf = (p) => (p.time || []).find((e) => e.ms === null) || null;
/** A teszt-óra megáll, ha a részre teszteredmény jön. */
function stopTest(p, part, now) {
  const e = runningOf(p);
  if (!e || e.part !== part.id || e.k !== 'test') return;
  e.ms = Math.min(RUN_CAP, Math.max(0, now.getTime() - Date.parse(e.from)));
  if (e.ms < 10000) p.time = p.time.filter((y) => y !== e);
}
/** Egy bejegyzés hossza (a futó óráé a mostanig). */
export const entryMs = (e, now = Date.now()) => (e.ms ?? Math.min(RUN_CAP, Math.max(0, now - Date.parse(e.from))));

/**
 * A Teendőim által mért programozás (a pt_list „pctime” listája: { cid, folder, program, from, ms }) a termékhez:
 * a termékmappa és a programnév alapján → { id, part, k: 'prog', v, from, ms, src: 'pc' }.
 */
export function pcEntries(p, pc) {
  const f = String(p.folder || '').toLowerCase(), out = [];
  for (const e of pc || []) {
    if (String(e.folder || '').toLowerCase() !== f) continue;
    const pr = parseProgram(e.program, p.sku); if (!pr) continue;
    const part = p.parts.find((x) => x.key === pr.key); if (!part) continue;
    out.push({ id: e.cid, part: part.id, k: 'prog', v: pr.v, from: e.from, ms: e.ms, src: 'pc' });
  }
  return out;
}
/** A termék összes időbejegyzése (a panelen kézzel / órával felvett + a Teendőim mérése). */
export const timeOf = (p, pc) => [...(p.time || []), ...pcEntries(p, pc)];

/** Összegzés: { prog, kint, test, all, coding } (ms) – coding = programozás összesen (iroda + kint). */
export function timeSum(entries, now = Date.now()) {
  const t = { prog: 0, kint: 0, test: 0 };
  for (const e of entries) if (t[e.k] !== undefined) t[e.k] += entryMs(e, now);
  for (const k of Object.keys(t)) t[k] = Math.max(0, t[k]);   // a kézi levonás nem viheti 0 alá
  return { ...t, coding: t.prog + t.kint, all: t.prog + t.kint + t.test };
}

/** Verziónként (a legfrissebb elöl): [{ v, prog, kint, test, all }]. */
export function timeByVersion(part, entries, now = Date.now()) {
  const order = part.versions.map((x) => x.v), m = new Map();
  for (const e of entries) {
    if (e.part !== part.id) continue;
    const v = e.v || 'Alap';
    if (!m.has(v)) m.set(v, []);
    m.get(v).push(e);
  }
  return [...m.entries()].map(([v, es]) => ({ v, ...timeSum(es, now) }))
    .sort((a, b) => order.lastIndexOf(b.v) - order.lastIndexOf(a.v));
}

/**
 * A Teendőim mérésének összefésülése a havi tárolóba ({ [cid]: { folder, program, from, ms } }).
 * Ugyanaz a cid újra jöhet (a futó munkamenet nő): a hosszabb marad. Visszaadja az elfogadott cid-eket.
 */
export function mergePcTime(month, items, now = new Date()) {
  const ok = [];
  for (const it of Array.isArray(items) ? items : []) {
    const cid = str(it?.cid, 64), folder = str(it?.folder, 200), program = str(it?.program, 200);
    const from = isoOf(it?.from), ms = Math.round(Number(it?.ms));
    if (!cid || !folder || !program || !from || !Number.isFinite(ms) || ms < 0) continue;
    if (Date.parse(from) > now.getTime() + 300000) continue;
    const cur = month[cid];
    month[cid] = { folder, program, from: cur?.from || from, ms: Math.min(RUN_CAP, Math.max(cur?.ms || 0, ms)) };
    ok.push(cid);
  }
  return ok;
}

// ---------- Megjelenítéshez ----------

/** Az eddig használt saját állapotok (gyors választáshoz), a leggyakoribb elöl. */
export function usedCustoms(products) {
  const m = new Map();
  for (const p of products) for (const x of p.parts) if (x.custom?.t && COLORS[x.custom.c]) {
    const key = `${x.custom.t}\u0000${x.custom.c}`; m.set(key, { t: x.custom.t, c: x.custom.c, n: (m.get(key)?.n || 0) + 1 });
  }
  return [...m.values()].sort((a, b) => b.n - a.n).slice(0, 8);
}

/** A látható részek: Tesztre vár → Javítani kell → (saját) → Kész, a kihúzottak a végén, azon belül a legutóbb változott elöl. */
export const visibleParts = (p) => p.parts.filter((x) => !x.gone && x.versions.length)
  .sort((a, b) => Number(a.mark === 'strike') - Number(b.mark === 'strike') || (STATE[a.status]?.order ?? 0) - (STATE[b.status]?.order ?? 0) || (b.updated_at || '').localeCompare(a.updated_at || ''));

/** A számolásba beleszámító részek (a kihúzottak nélkül). */
export const countedParts = (p) => visibleParts(p).filter((x) => x.mark !== 'strike');

export function summary(p) {
  const parts = countedParts(p), struck = visibleParts(p).length - parts.length;
  const c = { wait: 0, fix: 0, tweak: 0, ok: 0, auto: 0, custom: 0 }, customs = new Map();
  for (const x of parts) {
    c[STATE[x.status] ? x.status : 'wait']++;
    if (x.status === 'custom') { const s = stateOf(x), key = `${s.t}\u0000${s.c}`; customs.set(key, { t: s.t, c: s.c, color: s.color, n: (customs.get(key)?.n || 0) + 1 }); }
  }
  const last = parts.reduce((m, x) => { const t = latestOf(x)?.m || ''; return t > m ? t : m; }, '');
  return { ...c, customs: [...customs.values()], struck, parts: parts.length, done: c.ok + c.auto, complete: parts.length > 0 && c.ok + c.auto === parts.length, last: last || null };
}
export const openPoints = (part) => part.points.filter((x) => !x.done);

/** A rész infói verziónként csoportosítva, a legfrissebb verzió elöl: [{ v, notes, version }]. */
export function notesByVersion(part) {
  const order = part.versions.map((x) => x.v);
  const groups = new Map();
  for (const n of part.notes || []) { if (!groups.has(n.v)) groups.set(n.v, []); groups.get(n.v).push(n); }
  for (const v of order) if (!groups.has(v)) groups.set(v, []);
  const rank = (v) => { const i = order.lastIndexOf(v); return i < 0 ? -1 : i; };
  return [...groups.entries()].sort((a, b) => rank(b[0]) - rank(a[0]))
    .map(([v, notes]) => ({ v, notes, version: [...part.versions].reverse().find((x) => x.v === v) || null }));
}

/** Cím a helyi Központ „Megnyitás DTPS-ben” oldalához (a gépen fut, localhost). */
export const dtpsLink = (p, ver) => `http://localhost:47801/dtps.html#t=${encodeURIComponent(p.folder)}&p=${encodeURIComponent(ver.dir)}`;
