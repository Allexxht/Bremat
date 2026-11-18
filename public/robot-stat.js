// =====================================================================
// BREMAT – Robot napló: közös katalógus és számítások
//
// A böngésző (/robot/) és a szerver (lib/robot-core.mjs) is ezt tölti be,
// ugyanúgy, mint a tasks.js-t. Tiszta adat és tiszta függvények: nincs
// benne böngésző- vagy Node-specifikus hívás, így a tesztek is futtatják.
//
// Robot: Valk Welding / Panasonic TM-2000 WGH4 (G4 vezérlő).
// =====================================================================

// A pendant „Operating time (Accumulate)” képernyőjének sorai, a kijelző
// sorrendjében. Az értékek másodpercben (egy tizedes).
export const COUNTERS = [
  { key: 'power_on', label: 'Power ON' },
  { key: 'running', label: 'Running' },
  { key: 'arc_on', label: 'Arc ON (Auto)' },
  { key: 'holding', label: 'Holding (Auto)' },
  { key: 'error_hold', label: 'Error hold (Auto)' },
  { key: 'servo_off', label: 'Servo OFF (Auto)' },
  { key: 'idle', label: 'Idle (Auto)' },
];
export const COUNTER_KEYS = COUNTERS.map((c) => c.key);

// Állásidő okai (a napi naplóban).
export const DOWN_REASONS = [
  { key: 'atallas', label: 'Átállás' },
  { key: 'hiba', label: 'Hiba' },
  { key: 'anyaghiany', label: 'Anyaghiány' },
  { key: 'karbantartas', label: 'Karbantartás' },
  { key: 'betanitas', label: 'Betanítás / teszt' },
  { key: 'egyeb', label: 'Egyéb' },
];
export const DOWN_KEYS = DOWN_REASONS.map((r) => r.key);
export const reasonLabel = (k) => (DOWN_REASONS.find((r) => r.key === k) || { label: k }).label;

// Gépadatok. Ami nincs megadva, azzal BECSÜLT értékkel számolunk, és a
// felület „becsült” jellel mutatja. A becsült értékek Alex jóváhagyásával
// (2026. november 18.) – nem mért adatok.
export const CFG_FIELDS = [
  { key: 'robot_price', label: 'Robot és cella ára', unit: 'Ft', def: 45000000, min: 0, max: 1e10 },
  { key: 'hourly_wage', label: 'Órabér (kézi hegesztő, munkáltatói költséggel)', unit: 'Ft/óra', def: 4000, min: 0, max: 1e6 },
  { key: 'run_cost', label: 'Áram + gáz + huzal költsége', unit: 'Ft/robot-óra', def: 1200, min: 0, max: 1e6 },
  { key: 'eur_rate', label: 'Árfolyam', unit: 'Ft/€', def: 400, min: 1, max: 10000 },
];
export const DEFAULTS = {
  ...Object.fromEntries(CFG_FIELDS.map((f) => [f.key, f.def])),
  commissioned: '2026-03-18',          // beüzemelés napja
  count_start: '2026-03-18T11:54',     // a pendant „Count start” ideje (itt minden számláló 0)
};

// A beállított értékek + a hiányzók becsült értékkel. estimated[kulcs] = true, ha becsült.
export function effectiveCfg(cfg = {}) {
  const out = { estimated: {} };
  for (const f of CFG_FIELDS) {
    const v = cfg[f.key];
    if (typeof v === 'number' && Number.isFinite(v)) out[f.key] = v;
    else { out[f.key] = f.def; out.estimated[f.key] = true; }
  }
  out.commissioned = cfg.commissioned || DEFAULTS.commissioned;
  out.count_start = cfg.count_start || DEFAULTS.count_start;
  out.operators = Array.isArray(cfg.operators) && cfg.operators.length ? cfg.operators : ['Alex'];
  return out;
}

// Az első mérés: a pendant fotója, 2026. november 18. (ACCUM, a számlálás
// 2026. március 18. 11:54:13-kor indult).
export const FIRST_READING = {
  date: '2026-11-18',
  time: null,
  values: { power_on: 1265933.6, running: 9171.3, arc_on: 4555.8, holding: 574.5, error_hold: 43.5, servo_off: 265.4, idle: 1259.8 },
  note: 'Első mérés – a pendant fotója alapján (Operating time, Accumulate; count start 2026-03-18 11:54:13).',
};

// --- Idő formázás / beolvasás ---------------------------------------------
const r1 = (x) => Math.round(x * 10) / 10;
export function secToParts(sec) {
  const s = Math.max(0, Math.round(Number(sec) * 10) / 10);
  const h = Math.floor(s / 3600), m = Math.floor((s - h * 3600) / 60);
  return { h, m, s: r1(s - h * 3600 - m * 60) };
}
// „351h 38min 53.6s” – ahogy a pendant mutatja
export function fmtPendant(sec) {
  if (sec == null) return '—';
  const p = secToParts(sec);
  return `${p.h}h ${p.m}min ${String(p.s.toFixed(1))}s`;
}
// „351 ó 39 p” – rövid
export function fmtHM(sec) {
  if (sec == null) return '—';
  const m = Math.round(sec / 60), h = Math.floor(m / 60);
  return h ? `${h} ó ${m % 60} p` : `${m} p`;
}
// Elfogad: „351:38:53.6”, „351:38”, „351h 38min 53.6s”, „351h38m”, „2h”, „45min”
export function parseDuration(str) {
  if (str == null) return null;
  const s = String(str).trim().replace(',', '.');
  if (!s) return null;
  let m = s.match(/^(\d+):(\d{1,2})(?::(\d{1,2}(?:\.\d+)?))?$/);
  if (m) {
    if (+m[2] > 59 || (m[3] && +m[3] >= 60)) return NaN;
    return r1(+m[1] * 3600 + +m[2] * 60 + (m[3] ? +m[3] : 0));
  }
  m = s.match(/^(?:(\d+)\s*h)?\s*(?:(\d+)\s*m(?:in)?)?\s*(?:(\d+(?:\.\d+)?)\s*s)?$/i);
  if (m && (m[1] || m[2] || m[3])) {
    if ((m[1] && m[2] && +m[2] > 59) || ((m[1] || m[2]) && m[3] && +m[3] >= 60)) return NaN;
    return r1((+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0));
  }
  return NaN;
}
// „HH:MM” – „HH:MM” különbsége percben; ha a vége korábbi, éjfélen átnyúlik.
export function spanMinutes(start, end) {
  const re = /^([01]?\d|2[0-3]):([0-5]\d)$/;
  const a = re.exec(start || ''), b = re.exec(end || '');
  if (!a || !b) return null;
  let d = (+b[1] * 60 + +b[2]) - (+a[1] * 60 + +a[2]);
  if (d <= 0) d += 1440;
  return d;
}

// --- A pendant fotójának szövege (OCR) → számlálók -----------------------
// A Tesseract tipikus tévesztései: 0 → O/o/D/Q, 1 → l/I/|, „Arc” → „are”.
const D = '[0-9OoQDlI|]';
const TIME_RE = new RegExp(`(${D}+)\\s*[hH]\\s*(${D}{1,2})\\s*m(?:in)?\\s*(${D}{1,2}(?:[.,]${D}+)?)\\s*s?`);
const fixDigits = (x) => x.replace(/[OoQD]/g, '0').replace(/[lI|]/g, '1').replace(',', '.');
const LABEL_RES = [   // a sorrend számít: az „Error hold” előbb, mint a „Holding”
  ['error_hold', /err?[o0]r/i],
  ['holding', /h[o0]ld/i],
  ['power_on', /p[o0]w[e3]r/i],
  ['running', /r[uv]nn?[il1]ng|runn/i],
  ['arc_on', /\b[ao]r[ce]\b|\barc/i],
  ['servo_off', /s[e3]rv[o0]/i],
  ['idle', /[il1|][dcl][l1|]e\b|idle/i],
];
export function parseOperatingTime(text) {
  const values = Object.fromEntries(COUNTER_KEYS.map((k) => [k, null]));
  let countStart = null;
  const timeLines = [];
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const cs = line.match(/(20\d\d)\s*\/\s*(\d{1,2})\s*\/\s*(\d{1,2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (cs && /c[o0]unt|start/i.test(line)) {
      countStart = `${cs[1]}-${cs[2].padStart(2, '0')}-${cs[3].padStart(2, '0')}T${cs[4].padStart(2, '0')}:${cs[5]}${cs[6] ? ':' + cs[6] : ''}`;
      continue;
    }
    const m = TIME_RE.exec(line);
    if (!m) continue;
    const h = +fixDigits(m[1]), mi = +fixDigits(m[2]), s = +fixDigits(m[3]);
    if (![h, mi, s].every(Number.isFinite) || mi > 59 || s >= 60) continue;
    const label = line.slice(0, m.index);
    const hit = LABEL_RES.find(([, re]) => re.test(label));
    timeLines.push({ key: hit ? hit[0] : null, sec: r1(h * 3600 + mi * 60 + s) });
  }
  for (const t of timeLines) if (t.key && values[t.key] == null) values[t.key] = t.sec;
  // Ha a feliratok egy részét nem tudta kiolvasni, de pontosan 7 időérték van,
  // a kijelző sorrendje szerint pótolja a hiányzókat.
  if (timeLines.length === COUNTER_KEYS.length) {
    timeLines.forEach((t, i) => { if (values[COUNTER_KEYS[i]] == null) values[COUNTER_KEYS[i]] = t.sec; });
  }
  const found = COUNTER_KEYS.filter((k) => values[k] != null).length;
  return { values, count_start: countStart, found };
}

// Ellentmondások egy mentésen belül (csak figyelmeztetés, nem tiltás).
export function readingWarnings(v) {
  const w = [];
  const has = (k) => typeof v[k] === 'number';
  if (has('running') && has('power_on') && v.running > v.power_on) w.push('A Running nagyobb, mint a Power ON.');
  if (has('arc_on') && has('running') && v.arc_on > v.running) w.push('Az Arc ON nagyobb, mint a Running.');
  return w;
}

// --- Számláló-mentések → időszakok ---------------------------------------
const tsOf = (date, time) => Date.parse(`${date}T${time || '12:00'}:00Z`);
export const readingTs = (r) => tsOf(r.date, r.time);
export const sortReadings = (rows) => [...rows].sort((a, b) => readingTs(a) - readingTs(b) || String(a.created_at).localeCompare(String(b.created_at)));

// Két egymást követő mentés különbsége = az időszak valós értéke. Az első
// mentés előtti nullpont a „Count start” (ott minden számláló 0).
// reset = a mentés előtt nullázták a számlálót: ekkor az érték maga a különbség.
export function counterPeriods(readings, cfg = {}) {
  const start = cfg.count_start || DEFAULTS.count_start;
  const zero = Object.fromEntries(COUNTER_KEYS.map((k) => [k, 0]));
  let prev = { ts: Date.parse(start + (start.length === 16 ? ':00Z' : 'Z')), values: zero };
  const out = [];
  for (const r of sortReadings(readings)) {
    const ts = readingTs(r);
    const delta = {};
    let dropped = false;
    for (const k of COUNTER_KEYS) {
      const cur = r.values?.[k], before = prev.values?.[k];
      if (typeof cur !== 'number') { delta[k] = null; continue; }
      if (r.reset || typeof before !== 'number') { delta[k] = cur; continue; }
      if (cur < before) { dropped = true; delta[k] = cur; } else delta[k] = r1(cur - before);
    }
    out.push({ from: prev.ts, to: ts, delta, reading: r, reset: !!r.reset, dropped });
    prev = { ts, values: r.values };
  }
  return out;
}
export const ratio = (a, b) => (typeof a === 'number' && typeof b === 'number' && b > 0 ? a / b : null);

// Az időszakok értékei hónapokra szétosztva, a napok arányában.
// approx = a hónap értéke legalább részben hónapon átnyúló időszakból jön.
export const monthOf = (ymd) => ymd.slice(0, 7);
const monthStartTs = (ym) => Date.parse(`${ym}-01T00:00:00Z`);
const nextMonth = (ym) => { const [y, m] = ym.split('-').map(Number); return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`; };
export function countersByMonth(periods) {
  const res = new Map();
  for (const p of periods) {
    const span = p.to - p.from;
    if (!(span > 0)) continue;
    let ym = new Date(p.from).toISOString().slice(0, 7);
    while (monthStartTs(ym) < p.to) {
      const a = Math.max(p.from, monthStartTs(ym)), b = Math.min(p.to, monthStartTs(nextMonth(ym)));
      if (b > a) {
        const f = (b - a) / span;
        const row = res.get(ym) || { month: ym, approx: false, values: Object.fromEntries(COUNTER_KEYS.map((k) => [k, 0])) };
        for (const k of COUNTER_KEYS) if (typeof p.delta[k] === 'number') row.values[k] += p.delta[k] * f;
        if (f < 1) row.approx = true;
        res.set(ym, row);
      }
      ym = nextMonth(ym);
    }
  }
  return [...res.values()].sort((a, b) => a.month.localeCompare(b.month));
}

// --- Napi napló → statisztika --------------------------------------------
// Számítás (Alex jóváhagyásával, 2026. november 18.):
//  - robot cellaidő = kezdés–befejezés (az állásidővel együtt – óvatos becslés,
//    mert a robot mellett is ott áll valaki);
//  - megspórolt idő = jó db × kézi idő/db − robot cellaidő;
//  - megtakarítás = megspórolt óra × órabér − robot-óra × üzemköltség.
//  A kézi hegesztés anyagköltségét (gáz, huzal) nem számoljuk le – így a
//  megtakarítás inkább kevesebb, mint több.
export const downMin = (e) => (e.downtime || []).reduce((s, d) => s + (d.min || 0), 0);
export function entrySaving(e, product, cfg) {
  if (!product || !(product.manual_min > 0) || !(e.good > 0) || !(e.minutes > 0)) return null;
  const manual = e.good * product.manual_min;
  const saved = manual - e.minutes;
  return { manual_min: manual, saved_min: saved, saving: (saved / 60) * cfg.hourly_wage - (e.minutes / 60) * cfg.run_cost };
}

// Termékenkénti minősítés (általános gyakorlat – nem a kézikönyvből):
// bajos, ha a selejt > 5% vagy az állásidő > 20% a cellaidőből; 10 db alatt kevés az adat.
export const QUALITY_RULE = { scrap: 0.05, down: 0.2, minPcs: 10 };
export function quality(p) {
  const made = p.good + p.scrap;
  if (made < QUALITY_RULE.minPcs) return 'keves';
  const sr = made ? p.scrap / made : 0;
  const dr = p.minutes ? p.downtime / p.minutes : 0;
  return sr > QUALITY_RULE.scrap || dr > QUALITY_RULE.down ? 'bajos' : 'jo';
}

export function entryStats(entries, products, cfgIn) {
  const cfg = cfgIn && cfgIn.estimated ? cfgIn : effectiveCfg(cfgIn);
  const prod = new Map((products || []).map((p) => [p.id, p]));
  const per = new Map();
  const tot = { entries: 0, good: 0, scrap: 0, reworked: 0, minutes: 0, downtime: 0, saved_min: 0, manual_min: 0, robot_min_cmp: 0, saving: 0, missing_manual: 0 };
  const pareto = new Map();
  const monthly = new Map();
  for (const e of entries || []) {
    tot.entries++;
    const p = e.product_id ? prod.get(e.product_id) : null;
    const key = e.product_id || '-';
    const row = per.get(key) || { id: e.product_id || null, name: p?.name || e.product_name || '(nincs termék)', program: p?.program || e.program || null, manual_min: p?.manual_min ?? null, good: 0, scrap: 0, reworked: 0, minutes: 0, downtime: 0, saved_min: 0, manual_total: 0, robot_cmp: 0, saving: 0, cmp: false };
    const dm = downMin(e);
    row.good += e.good || 0; row.scrap += e.scrap || 0; row.reworked += e.reworked || 0;
    row.minutes += e.minutes || 0; row.downtime += dm;
    tot.good += e.good || 0; tot.scrap += e.scrap || 0; tot.reworked += e.reworked || 0;
    tot.minutes += e.minutes || 0; tot.downtime += dm;
    const sv = entrySaving(e, p, cfg);
    if (sv) {
      row.saved_min += sv.saved_min; row.manual_total += sv.manual_min; row.robot_cmp += e.minutes; row.saving += sv.saving; row.cmp = true;
      tot.saved_min += sv.saved_min; tot.manual_min += sv.manual_min; tot.robot_min_cmp += e.minutes; tot.saving += sv.saving;
    } else if (e.good > 0 && e.minutes > 0) tot.missing_manual++;
    per.set(key, row);
    for (const d of e.downtime || []) pareto.set(d.reason, (pareto.get(d.reason) || 0) + (d.min || 0));
    const ym = monthOf(e.date);
    const mo = monthly.get(ym) || { month: ym, good: 0, scrap: 0, minutes: 0, saving: 0, saved_min: 0, byProduct: {} };
    mo.good += e.good || 0; mo.scrap += e.scrap || 0; mo.minutes += e.minutes || 0;
    if (sv) { mo.saving += sv.saving; mo.saved_min += sv.saved_min; }
    if (e.good) mo.byProduct[key] = (mo.byProduct[key] || 0) + e.good;
    monthly.set(ym, mo);
  }
  const products_ = [...per.values()].map((r) => {
    const rpp = r.good > 0 && r.minutes > 0 ? r.minutes / r.good : null;
    const netpp = r.good > 0 && r.minutes > 0 ? Math.max(0, r.minutes - r.downtime) / r.good : null;
    return {
      ...r,
      robot_min_per_pc: rpp,
      net_min_per_pc: netpp,
      speedup: r.cmp && r.robot_cmp > 0 ? r.manual_total / r.robot_cmp : null,
      scrap_rate: r.good + r.scrap ? r.scrap / (r.good + r.scrap) : null,
      quality: quality(r),
    };
  }).sort((a, b) => b.good - a.good || a.name.localeCompare(b.name));
  const downTotal = [...pareto.values()].reduce((a, b) => a + b, 0);
  let cum = 0;
  const par = [...pareto].sort((a, b) => b[1] - a[1]).map(([reason, min]) => {
    cum += min;
    return { reason, label: reasonLabel(reason), min, pct: downTotal ? min / downTotal : 0, cum: downTotal ? cum / downTotal : 0 };
  });
  return {
    totals: { ...tot, speedup: tot.robot_min_cmp > 0 ? tot.manual_min / tot.robot_min_cmp : null },
    products: products_,
    pareto: par,
    monthly: [...monthly.values()].sort((a, b) => a.month.localeCompare(b.month)),
    cfg,
  };
}

// Megtérülés: az eddigi megtakarítás a robot árához képest, és a havi ütem
// alapján a várható dátum (csak ha legalább 14 napnyi napló van).
const DAY = 86400000;
export function payback(totalSaving, cfgIn, firstDate, today) {
  const cfg = cfgIn && cfgIn.estimated ? cfgIn : effectiveCfg(cfgIn);
  const price = cfg.robot_price;
  const pct = price > 0 ? totalSaving / price : null;
  let perMonth = null, monthsLeft = null, date = null;
  if (firstDate && today) {
    const days = (Date.parse(today + 'T00:00:00Z') - Date.parse(firstDate + 'T00:00:00Z')) / DAY + 1;
    if (days >= 14) {
      perMonth = (totalSaving / days) * 30.44;
      if (perMonth > 0 && price > totalSaving) {
        monthsLeft = (price - totalSaving) / perMonth;
        date = new Date(Date.parse(today + 'T00:00:00Z') + monthsLeft * 30.44 * DAY).toISOString().slice(0, 10);
      }
    }
  }
  return { price, pct, perMonth, monthsLeft, date, estimated: !!cfg.estimated.robot_price };
}
