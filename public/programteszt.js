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
// Részenként: állapot (Tesztre vár / Javítani kell / Kész), a javítandó pontok
// (pipálhatók) és a tesztek listája. Új verzió a mappában → „Tesztre vár”.
// Egy termék = egy dokumentum; Alex lépései „műveletek” (applyOp).
// =====================================================================

export const STATES = ['wait', 'fix', 'ok'];
export const STATE = {
  wait: { t: 'Tesztre vár',   order: 0 },
  fix:  { t: 'Javítani kell', order: 1 },
  ok:   { t: 'Kész',          order: 2 },
};
const MAX = { parts: 200, versions: 100, points: 300, tests: 300, products: 300, programs: 400 };

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
      part = { id: newId(), key, name: g.name, status: 'wait', versions: [], points: [], tests: [], tested: null, ok_at: null, gone: false, created_at: ts, updated_at: ts };
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
 *   status       { part, status }    – kézi állapot (pl. Kész → újra Tesztre vár)
 */
export function applyOp(src, op, { now = new Date(), newId }) {
  if (!op || typeof op !== 'object') fail('Hibás művelet');
  const ts = now.toISOString();
  const p = structuredClone(src);
  const part = pick(p.parts, op.part, 'rész');
  const v = latestOf(part);

  switch (op.type) {
    case 'test_ok': {
      for (const x of part.points) if (!x.done) { x.done = true; x.done_at = ts; }
      part.status = 'ok'; part.ok_at = ts; part.tested = v?.dir || null;
      part.tests.push({ at: ts, v: v?.v || null, ok: true });
      break;
    }
    case 'test_fix': {
      const lines = String(op.text ?? '').split(/\r?\n/).map((s) => str(s, 500)).filter(Boolean);
      if (!lines.length) fail('Írj legalább egy észrevételt');
      if (part.points.length + lines.length > MAX.points) fail('Túl sok pont');
      for (const t of lines) part.points.push({ id: newId(), text: t, v: v?.v || null, at: ts, done: false, done_at: null });
      part.status = 'fix'; part.ok_at = null; part.tested = v?.dir || null;
      part.tests.push({ at: ts, v: v?.v || null, ok: false, n: lines.length });
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
      part.ok_at = op.status === 'ok' ? ts : null;
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

// ---------- Megjelenítéshez ----------

/** A látható részek: Tesztre vár → Javítani kell → Kész, azon belül a legutóbb változott elöl. */
export const visibleParts = (p) => p.parts.filter((x) => !x.gone && x.versions.length)
  .sort((a, b) => STATE[a.status].order - STATE[b.status].order || (b.updated_at || '').localeCompare(a.updated_at || ''));

export function summary(p) {
  const parts = visibleParts(p);
  const c = { wait: 0, fix: 0, ok: 0 };
  for (const x of parts) c[x.status]++;
  const last = parts.reduce((m, x) => { const t = latestOf(x)?.m || ''; return t > m ? t : m; }, '');
  return { ...c, parts: parts.length, complete: parts.length > 0 && c.ok === parts.length, last: last || null };
}
export const openPoints = (part) => part.points.filter((x) => !x.done);

/** Cím a helyi Központ „Megnyitás DTPS-ben” oldalához (a gépen fut, localhost). */
export const dtpsLink = (p, ver) => `http://localhost:47801/dtps.html#t=${encodeURIComponent(p.folder)}&p=${encodeURIComponent(ver.dir)}`;
