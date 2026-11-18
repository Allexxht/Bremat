// Egységtesztek a Robot napló szerveroldali logikájához (lib/robot-core.mjs):  npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handle, roleOf } from '../lib/robot-core.mjs';
import { memoryStore } from '../lib/km-core.mjs';
import { FIRST_READING } from '../public/robot-stat.js';

const ADMIN = 'ADMIN-12345-ABCDE', OPER = 'OPER-12345-ABCDE', VIEW = 'VIEW-12345-ABCDE';
const codes = { admin: ADMIN, operator: OPER, viewer: VIEW };
const NOW = new Date('2026-11-18T09:00:00Z');
let n = 0;
const nid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
const call = (s, code, o, now = NOW) => handle(JSON.stringify({ code, ...o }), { store: s, codes, now, newId: nid });
async function rejects(p, status, re) {
  await assert.rejects(p, (e) => { assert.equal(e.status, status, e.message); if (re) assert.match(e.message, re); return true; });
}
async function setup() {
  const s = memoryStore();
  const p = await call(s, ADMIN, { action: 'product_save', product: { name: ' Konzol ', program: 'P1_02-1_GroundW-Cap_R_AE', manual_min: '12,5' } });
  return { s, p };
}
const entry = (p, x = {}) => ({ date: '2026-11-18', product_id: p.id, good: 20, scrap: 1, reworked: 2, start: '7:30', end: '9:00', downtime: [{ reason: 'atallas', min: 10 }], note: 'ok', ...x });

test('szerepek a kódból', async () => {
  assert.equal(roleOf('admin-12345-abcde', codes), 'admin');
  assert.equal(roleOf(OPER, codes), 'operator');
  assert.equal(roleOf(VIEW, codes), 'viewer');
  assert.throws(() => roleOf('rossz', codes), (e) => e.status === 401);
  assert.throws(() => roleOf(ADMIN, { admin: 'rovid' }), (e) => e.status === 500);
  // operátor- és nézőkód nélkül csak az admin lép be
  assert.throws(() => roleOf(OPER, { admin: ADMIN }), (e) => e.status === 401);
  const s = memoryStore();
  assert.deepEqual(await call(s, VIEW, { action: 'ping' }), { role: 'viewer' });
  await rejects(call(s, VIEW, { action: 'entry_create', name: 'X', entry: {} }), 403);
  await rejects(call(s, OPER, { action: 'stats' }), 403);
  await rejects(call(s, OPER, { action: 'product_save', product: { name: 'x' } }), 403);
  await rejects(call(s, ADMIN, { action: 'nincs' }), 400, /Ismeretlen/);
});

test('termék: mentés, módosítás, ellenőrzés', async () => {
  const { s, p } = await setup();
  assert.equal(p.name, 'Konzol');
  assert.equal(p.manual_min, 12.5);
  assert.equal(p.active, true);
  await rejects(call(s, ADMIN, { action: 'product_save', product: { name: ' ' } }), 400, /nevét/);
  await rejects(call(s, ADMIN, { action: 'product_save', product: { name: 'x', manual_min: '-1' } }), 400);
  const u = await call(s, ADMIN, { action: 'product_save', id: p.id, product: { name: 'Konzol', manual_min: null, active: false } });
  assert.equal(u.manual_min, null);
  assert.equal(u.active, false);
  const m = await call(s, OPER, { action: 'meta' });
  assert.equal(m.role, 'operator');
  assert.equal(m.products.length, 1);
});

test('bejegyzés: ellenőrzés', async () => {
  const { s, p } = await setup();
  const c = (e, name = 'Alex') => call(s, OPER, { action: 'entry_create', name, entry: e });
  await rejects(c(entry(p), ' '), 400, /ki vagy/);
  await rejects(c(entry(p, { date: '2026-11-20' })), 400, /jövőbeli/);
  await rejects(c(entry(p, { product_id: null })), 400, /terméket/);
  await rejects(c(entry(p, { product_id: '00000000-0000-4000-8000-999999999999' })), 400, /Ismeretlen/);
  await rejects(c(entry(p, { reworked: 30 })), 400, /javított/);
  await rejects(c(entry(p, { start: null, end: null })), 400, /mennyi ideig/);
  await rejects(c(entry(p, { end: '25:00' })), 400, /óra:perc/);
  await rejects(c(entry(p, { downtime: [{ reason: 'xx', min: 5 }] })), 400, /okát/);
  await rejects(c(entry(p, { downtime: [{ reason: 'hiba', min: 200 }] })), 400, /több/);
  await rejects(c({ date: '2026-11-18' }), 400, /Üres/);
  const r = await c(entry(p));
  assert.equal(r.minutes, 90);
  assert.equal(r.start, '07:30');
  assert.equal(r.product_name, 'Konzol');
  assert.equal(r.program, 'P1_02-1_GroundW-Cap_R_AE');
  assert.equal(r.who, 'Alex');
  assert.equal(r.created_role, 'operator');
  // csak állásidő, termék nélkül
  const d = await c({ date: '2026-11-18', downtime: [{ reason: 'hiba', min: 45 }] });
  assert.equal(d.minutes, null);
  // csak időtartam (perc)
  const t = await c(entry(p, { start: null, end: null, minutes: '75' }));
  assert.equal(t.minutes, 75);
  const list = await call(s, ADMIN, { action: 'entries', from: '2026-11-01', to: '2026-11-30' });
  assert.equal(list.length, 3);
});

test('bejegyzés: javítás, történet, hónapváltás, törlés, jogok', async () => {
  const { s, p } = await setup();
  const r = await call(s, OPER, { action: 'entry_create', name: 'Alex', entry: entry(p) });
  // operátor: a saját aznapi bejegyzését javíthatja
  const u = await call(s, OPER, { action: 'entry_update', name: 'Alex', id: r.id, date: r.date, version: 1, entry: entry(p, { good: 25 }) });
  assert.equal(u.good, 25);
  assert.equal(u.version, 2);
  await rejects(call(s, OPER, { action: 'entry_update', name: 'Alex', id: r.id, date: r.date, version: 1, entry: entry(p, { good: 26 }) }), 409);
  // más nevén nem
  await rejects(call(s, OPER, { action: 'entry_update', name: 'Béla', id: r.id, date: r.date, version: 2, entry: entry(p, { good: 26 }) }), 403);
  // másnap már nem
  await rejects(call(s, OPER, { action: 'entry_update', name: 'Alex', id: r.id, date: r.date, version: 2, entry: entry(p, { good: 26 }) }, new Date('2026-11-19T09:00:00Z')), 403);
  // az admin igen, és áttehető másik hónapba
  const m = await call(s, ADMIN, { action: 'entry_update', name: 'Alex', id: r.id, date: r.date, version: 2, entry: entry(p, { date: '2026-10-30' }) });
  assert.equal(m.date, '2026-10-30');
  assert.equal((await call(s, ADMIN, { action: 'entries', from: '2026-11-01', to: '2026-11-30' })).length, 0);
  assert.equal((await call(s, ADMIN, { action: 'entries', from: '2026-10-01', to: '2026-10-31' })).length, 1);
  const h = await call(s, ADMIN, { action: 'entry_history', id: r.id });
  assert.deepEqual(h.map((x) => x.version), [2, 1]);
  // az operátor a 7 napnál régebbit nem látja
  assert.equal((await call(s, OPER, { action: 'entries', from: '2026-10-01', to: '2026-11-30' })).length, 0);
  await rejects(call(s, OPER, { action: 'entry_delete', name: 'Alex', id: r.id, date: '2026-10-30' }), 403);
  assert.equal(await call(s, ADMIN, { action: 'entry_delete', name: 'Alex', id: r.id, date: '2026-10-30' }), true);
  assert.equal((await call(s, ADMIN, { action: 'entries', from: '2026-10-01', to: '2026-11-30' })).length, 0);
  assert.ok(await s.get(`d/${r.id}`));
  await rejects(call(s, ADMIN, { action: 'entry_delete', name: 'Alex', id: r.id, date: '2026-10-30' }), 404);
});

test('egyszerre mentett bejegyzések egy hónapban nem vesznek el', async () => {
  const { s, p } = await setup();
  await Promise.all(Array.from({ length: 4 }, (_, i) => call(s, OPER, { action: 'entry_create', name: 'Alex', entry: entry(p, { good: i + 1, reworked: 0 }) })));
  const list = await call(s, ADMIN, { action: 'entries', from: '2026-11-01', to: '2026-11-30' });
  assert.equal(list.length, 4);
});

test('számlálók: első mérés, csökkenés, nullázás, fotó', async () => {
  const s = memoryStore();
  const first = { ...FIRST_READING, source: 'foto' };
  const a = await call(s, OPER, { action: 'counter_create', name: 'Alex', reading: first, photo: { mime: 'image/jpeg', data: 'QUJD' } });
  assert.equal(a.values.power_on, 1265933.6);
  assert.equal(a.source, 'foto');
  assert.ok(a.photo_id);
  assert.deepEqual(await call(s, VIEW, { action: 'photo', id: a.photo_id }), { mime: 'image/jpeg', data: 'QUJD' });
  await rejects(call(s, OPER, { action: 'counter_create', name: 'Alex', reading: { ...first, values: { ...first.values, idle: null } } }), 400, /Minden/);
  await rejects(call(s, OPER, { action: 'counter_create', name: 'Alex', reading: first, photo: { mime: 'text/html', data: 'x' } }), 400, /fotó/);
  const lower = { ...first, date: '2026-11-18', time: '15:00', values: { ...first.values, power_on: 100 } };
  await rejects(call(s, OPER, { action: 'counter_create', name: 'Alex', reading: lower }), 409, /Nullázták/);
  const ok = await call(s, OPER, { action: 'counter_create', name: 'Alex', reading: { ...lower, reset: true } });
  assert.equal(ok.reset, true);
  const list = await call(s, VIEW, { action: 'counters' });
  assert.deepEqual(list.map((x) => x.id), [a.id, ok.id]);
  await rejects(call(s, OPER, { action: 'counter_delete', id: ok.id }), 403);
  assert.equal(await call(s, ADMIN, { action: 'counter_delete', id: ok.id, name: 'Alex' }), true);
  assert.equal((await call(s, ADMIN, { action: 'counters' })).length, 1);
  const sum = await call(s, OPER, { action: 'summary' });
  assert.equal(sum.last_reading, '2026-11-18');
});

test('gépadatok és statisztika-adatok', async () => {
  const { s, p } = await setup();
  await rejects(call(s, ADMIN, { action: 'cfg_save', cfg: { robot_price: 'sok' } }), 400);
  const c = await call(s, ADMIN, { action: 'cfg_save', cfg: { robot_price: '45 000 000', hourly_wage: '', commissioned: '2026-03-18', operators: ['Alex', ' Alex ', 'Béla', ''] } });
  assert.equal(c.robot_price, 45000000);
  assert.equal(c.hourly_wage, null);
  assert.deepEqual(c.operators, ['Alex', 'Béla']);
  await call(s, OPER, { action: 'entry_create', name: 'Alex', entry: entry(p) });
  const st = await call(s, VIEW, { action: 'stats' });
  assert.equal(st.entries.length, 1);
  assert.equal(st.products.length, 1);
  assert.equal(st.cfg.robot_price, 45000000);
  assert.equal(st.today, '2026-11-18');
});
