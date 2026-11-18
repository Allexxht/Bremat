// Egységtesztek a Robot napló közös számításaihoz (public/robot-stat.js):  npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseOperatingTime, parseDuration, fmtPendant, spanMinutes, counterPeriods, countersByMonth,
  entryStats, payback, effectiveCfg, FIRST_READING, readingWarnings, quality,
} from '../public/robot-stat.js';

// A Tesseract.js (eng) valódi kimenete a pendant fotójáról (2026. november 18.):
// „Arc” → „are”, „1h” → „lh”, „0h” → „Oh”, „0min” → „Omin”, sor eleji szemét.
const OCR = `oo =
8 BE ov: 2 |
Rope Re 8 i ET 5 i eee =
[Count start : 2026/ 3/18 11:54:13 —
[Power ON 351h 38min 53.6s
[Running 2h 32min 51.3s
are ON (Auto) lh 15min 55.8s
If
[Holding (Auto) Oh 9min 34.5s
{Error hold (Auto) Oh Omin 43.5s
|{Servo OFF (Auto) Oh 4min 25.4s
Idle (Auto) Oh 20min 59.8s
| baler.
FE eet peta wm EER
/`;

test('OCR: a valódi fotó szövegéből mind a 7 érték és a Count start', () => {
  const r = parseOperatingTime(OCR);
  assert.equal(r.found, 7);
  assert.deepEqual(r.values, FIRST_READING.values);
  assert.equal(r.count_start, '2026-03-18T11:54:13');
});

test('OCR: felirat nélkül a sorrend dönt (pontosan 7 időérték)', () => {
  const t = ['351h 38min 53.6s', '2h 32min 51.3s', '1h 15min 55.8s', '0h 9min 34.5s', '0h 0min 43.5s', '0h 4min 25.4s', '0h 20min 59.8s'].map((x) => `x ${x}`).join('\n');
  assert.deepEqual(parseOperatingTime(t).values, FIRST_READING.values);
  const few = parseOperatingTime('Power ON 351h 38min 53.6s\nvalami 1h 2min 3s');
  assert.equal(few.found, 1);
  assert.equal(few.values.power_on, 1265933.6);
  assert.equal(parseOperatingTime('').found, 0);
});

test('időtartam beolvasása és formázása', () => {
  assert.equal(parseDuration('351:38:53.6'), 1265933.6);
  assert.equal(parseDuration('351:38:53,6'), 1265933.6);
  assert.equal(parseDuration('2h 32min 51.3s'), 9171.3);
  assert.equal(parseDuration('2h32m'), 9120);
  assert.equal(parseDuration('45min'), 2700);
  assert.equal(parseDuration('0:20'), 1200);
  assert.ok(Number.isNaN(parseDuration('1:75')));
  assert.ok(Number.isNaN(parseDuration('sok')));
  assert.equal(parseDuration(''), null);
  assert.equal(fmtPendant(1265933.6), '351h 38min 53.6s');
  assert.equal(fmtPendant(43.5), '0h 0min 43.5s');
  assert.equal(spanMinutes('7:30', '9:15'), 105);
  assert.equal(spanMinutes('22:00', '02:00'), 240);
  assert.equal(spanMinutes('7:30', 'x'), null);
});

test('számlálók: különbség a nullponttól és két mentés között, nullázás', () => {
  const cfg = { count_start: '2026-03-18T11:54:13' };
  const a = { date: '2026-11-18', time: '10:00', values: FIRST_READING.values };
  const b = { date: '2026-11-25', time: '10:00', values: { ...FIRST_READING.values, power_on: FIRST_READING.values.power_on + 36000, arc_on: FIRST_READING.values.arc_on + 3600 } };
  const p = counterPeriods([b, a], cfg);   // sorrendbe rakja
  assert.equal(p.length, 2);
  assert.equal(p[0].delta.power_on, FIRST_READING.values.power_on);
  assert.equal(p[0].from, Date.parse('2026-03-18T11:54:13Z'));
  assert.equal(p[1].delta.power_on, 36000);
  assert.equal(p[1].delta.arc_on, 3600);
  assert.equal(p[1].delta.running, 0);
  const c = { date: '2026-12-01', time: '10:00', values: { ...FIRST_READING.values, power_on: 100 }, reset: true };
  const p2 = counterPeriods([a, b, c], cfg);
  assert.equal(p2[2].delta.power_on, 100);
  assert.equal(p2[2].reset, true);
  assert.equal(readingWarnings({ power_on: 10, running: 20, arc_on: 5 }).length, 1);
});

test('számlálók havi bontása: a napok arányában, közelítő jelöléssel', () => {
  const p = counterPeriods([{ date: '2026-04-30', time: '00:00', values: { power_on: 4000, running: 0, arc_on: 0, holding: 0, error_hold: 0, servo_off: 0, idle: 0 } }], { count_start: '2026-03-31T00:00' });
  const m = countersByMonth(p);
  assert.deepEqual(m.map((x) => x.month), ['2026-03', '2026-04']);
  assert.ok(Math.abs(m[0].values.power_on - 4000 / 30) < 1e-6);
  assert.ok(Math.abs(m[0].values.power_on + m[1].values.power_on - 4000) < 1e-6);
  assert.ok(m[0].approx && m[1].approx);
});

test('statisztika: robot vs. kézi, megtakarítás, Pareto, havi darab', () => {
  const products = [
    { id: 'p1', name: 'Konzol', manual_min: 12 },
    { id: 'p2', name: 'Keret', manual_min: null },
  ];
  const cfg = effectiveCfg({ hourly_wage: 5000, run_cost: 1000 });
  assert.equal(cfg.estimated.robot_price, true);
  assert.equal(cfg.estimated.hourly_wage, undefined);
  const entries = [
    { date: '2026-11-03', product_id: 'p1', good: 20, scrap: 1, reworked: 2, minutes: 60, downtime: [{ reason: 'atallas', min: 10 }] },
    { date: '2026-11-04', product_id: 'p1', good: 10, scrap: 0, reworked: 0, minutes: 30, downtime: [] },
    { date: '2026-11-04', product_id: 'p2', good: 5, scrap: 0, reworked: 0, minutes: 40, downtime: [{ reason: 'hiba', min: 25 }] },
    { date: '2026-12-01', product_id: null, good: 0, scrap: 0, reworked: 0, minutes: null, downtime: [{ reason: 'hiba', min: 5 }, { reason: 'betanitas', min: 30 }] },
  ];
  const s = entryStats(entries, products, cfg);
  const k = s.products.find((p) => p.id === 'p1');
  assert.equal(k.good, 30);
  assert.equal(k.robot_min_per_pc, 3);            // 90 perc / 30 db
  assert.equal(k.speedup, 4);                      // 12 / 3
  assert.equal(k.saved_min, 30 * 12 - 90);         // 270 perc
  // 4,5 óra × 5000 − 1,5 robot-óra × 1000
  assert.equal(Math.round(k.saving), 22500 - 1500);
  const r = s.products.find((p) => p.id === 'p2');
  assert.equal(r.speedup, null);
  assert.equal(s.totals.missing_manual, 1);
  assert.equal(s.totals.good, 35);
  assert.deepEqual(s.pareto.map((x) => [x.reason, x.min]), [['hiba', 30], ['betanitas', 30], ['atallas', 10]]);
  assert.equal(s.pareto[s.pareto.length - 1].cum, 1);
  assert.deepEqual(s.monthly.map((m) => [m.month, m.good]), [['2026-11', 35], ['2026-12', 0]]);
  assert.equal(s.monthly[0].byProduct.p1, 30);
});

test('minősítés és megtérülés', () => {
  assert.equal(quality({ good: 5, scrap: 0, minutes: 10, downtime: 0 }), 'keves');
  assert.equal(quality({ good: 90, scrap: 10, minutes: 100, downtime: 0 }), 'bajos');
  assert.equal(quality({ good: 100, scrap: 1, minutes: 100, downtime: 30 }), 'bajos');
  assert.equal(quality({ good: 100, scrap: 1, minutes: 100, downtime: 10 }), 'jo');
  const pb = payback(1000000, effectiveCfg({ robot_price: 10000000 }), '2026-11-01', '2026-11-30');
  assert.equal(pb.pct, 0.1);
  assert.equal(pb.estimated, false);
  assert.ok(pb.perMonth > 1000000 && pb.perMonth < 1100000);
  assert.ok(pb.date > '2027-07-01' && pb.date < '2027-10-01');
  const short = payback(1000, effectiveCfg({}), '2026-11-20', '2026-11-25');
  assert.equal(short.perMonth, null);
  assert.equal(short.estimated, true);
});
