// Egységtesztek a Munkanapló szerveroldali logikájához:  npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handle } from '../lib/naplo-core.mjs';
import { memoryStore } from '../lib/km-core.mjs';

const CODE = 'ABCDE-12345-FGHIJ-67890';
const NOW = new Date('2026-11-04T08:00:00Z');
let n = 0;
const ctx = (store, now = NOW) => ({ store, accessCode: CODE, now, newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}` });
const call = (s, o, now) => handle(JSON.stringify({ code: CODE, ...o }), ctx(s, now));
const entry = (x = {}) => ({ date: '2026-11-03', text: ' Huzaladagoló görgő csere ', area: 'Valk robot', hours: '1,5', ...x });

async function rejects(p, status, re) {
  await assert.rejects(p, (e) => { assert.equal(e.status, status); if (re) assert.match(e.message, re); return true; });
}

test('kód kell', async () => {
  const s = memoryStore();
  await rejects(handle(JSON.stringify({ action: 'ping', code: 'rossz' }), ctx(s)), 401);
  assert.equal(await call(s, { action: 'ping' }), true);
});

test('új bejegyzés: ellenőrzés', async () => {
  const s = memoryStore();
  const c = (e, name = 'Alex') => call(s, { action: 'create', entry: e, name });
  await rejects(c(entry({ text: '  ' })), 400, /mit csináltál/);
  await rejects(c(entry({ date: '2026-02-30' })), 400, /dátum/);
  await rejects(c(entry({ date: '2026-11-06' })), 400, /jövőbeli/);
  await rejects(c(entry({ hours: '30' })), 400, /24/);
  await rejects(c(entry({ hours: 'sok' })), 400, /24/);
  await rejects(c(entry(), ' '), 400, /nevedet/);
  const r = await c(entry());
  assert.equal(r.text, 'Huzaladagoló görgő csere');
  assert.equal(r.hours, 1.5);
  assert.equal(r.iso_week, 45);
  assert.equal(r.version, 1);
  assert.equal(r.author, 'Alex');
  const r2 = await c(entry({ hours: '', area: '' }));
  assert.equal(r2.hours, null);
  assert.equal(r2.area, null);
});

test('időszak: csak a kért napok, dátum szerint', async () => {
  const s = memoryStore();
  for (const d of ['2026-11-04', '2026-11-02', '2026-10-30', '2026-11-08']) {
    await call(s, { action: 'create', entry: entry({ date: d }), name: 'Alex' }, new Date('2026-11-08T10:00:00Z'));
  }
  const w = await call(s, { action: 'range', from: '2026-11-02', to: '2026-11-08' });
  assert.deepEqual(w.map((x) => x.date), ['2026-11-02', '2026-11-04', '2026-11-08']);
  assert.equal((await call(s, { action: 'all' })).length, 4);
  await rejects(call(s, { action: 'range', from: '2026-01-01', to: '2026-12-31' }), 400, /hosszú/);
  await rejects(call(s, { action: 'range', from: '2026-11-08', to: '2026-11-02' }), 400);
});

test('módosítás: a régi változat megmarad, kétszeres felülírás elutasítva', async () => {
  const s = memoryStore();
  const r = await call(s, { action: 'create', entry: entry(), name: 'Alex' });
  const u = await call(s, { action: 'update', id: r.id, version: 1, entry: entry({ text: 'Görgő és spirál csere' }), name: 'Béla' });
  assert.equal(u.version, 2);
  assert.equal(u.updated_by, 'Béla');
  assert.equal(u.author, 'Alex');
  assert.equal(u.created_at, r.created_at);
  // Egy régi változatra épülő módosítás nem írhatja felül csendben.
  await rejects(call(s, { action: 'update', id: r.id, version: 1, entry: entry({ text: 'más' }), name: 'Alex' }), 409, /módosította/);
  const h = await call(s, { action: 'history', id: r.id });
  assert.equal(h.length, 1);
  assert.equal(h[0].text, 'Huzaladagoló görgő csere');
  assert.equal(h[0].replaced_by, 'Béla');
  // Változatlan tartalom: nincs új változat.
  const same = await call(s, { action: 'update', id: r.id, version: 2, entry: entry({ text: 'Görgő és spirál csere' }), name: 'Alex' });
  assert.equal(same.version, 2);
});

test('módosítás másik napra: átkerül, a régi napról eltűnik', async () => {
  const s = memoryStore();
  const r = await call(s, { action: 'create', entry: entry(), name: 'Alex' });
  await call(s, { action: 'update', id: r.id, version: 1, entry: entry({ date: '2026-10-28' }), name: 'Alex' });
  assert.equal((await call(s, { action: 'range', from: '2026-11-02', to: '2026-11-08' })).length, 0);
  const old = await call(s, { action: 'range', from: '2026-10-26', to: '2026-11-01' });
  assert.equal(old.length, 1);
  assert.equal(old[0].iso_week, 44);
  assert.equal((await call(s, { action: 'all' })).length, 1);
});

test('törlés: név kell, másolat marad, utána nincs', async () => {
  const s = memoryStore();
  const r = await call(s, { action: 'create', entry: entry(), name: 'Alex' });
  await rejects(call(s, { action: 'delete', id: r.id, name: '' }), 400, /nevedet/);
  assert.equal(await call(s, { action: 'delete', id: r.id, name: 'Alex' }), true);
  assert.equal((await call(s, { action: 'all' })).length, 0);
  const trash = await s.get(`d/${r.id}`);
  assert.equal(trash.deleted_by, 'Alex');
  await rejects(call(s, { action: 'delete', id: r.id, name: 'Alex' }), 404);
  await rejects(call(s, { action: 'update', id: r.id, version: 1, entry: entry(), name: 'Alex' }), 404);
  await rejects(call(s, { action: 'delete', id: 'nem-uuid', name: 'Alex' }), 404);
});

test('Teendőim állapota: mentés, felülírás, ellenőrzés', async () => {
  const s = memoryStore();
  assert.equal(await call(s, { action: 'todo_status' }), null);
  await rejects(call(s, { action: 'todo_status_set', status: { open: -1, starred: 0 } }), 400, /hátralévő/);
  await rejects(call(s, { action: 'todo_status_set', status: { open: 'x', starred: 0 } }), 400);
  await call(s, { action: 'todo_status_set', name: 'Alex', status: { open: 5, starred: 3, doing: [{ text: '3100.0610', spent_ms: 60000, started_at: 1793790000000 }] } });
  let st = await call(s, { action: 'todo_status' });
  assert.equal(st.open, 5); assert.equal(st.starred, 3); assert.equal(st.doing[0].text, '3100.0610');
  assert.equal(st.doing[0].started_at, 1793790000000);
  assert.equal(st.updated_at, NOW.toISOString());
  await call(s, { action: 'todo_status_set', status: { open: 4, starred: 2 } });
  st = await call(s, { action: 'todo_status' });
  assert.equal(st.open, 4); assert.deepEqual(st.doing, []);
  // az állapot nem keveredik a bejegyzések közé
  assert.equal((await call(s, { action: 'all' })).length, 0);
  await rejects(handle(JSON.stringify({ action: 'todo_status', code: 'rossz' }), ctx(s)), 401);
});

test('napi idősáv: mentés, felülírás, lekérés', async () => {
  const s = memoryStore();
  const t0 = Date.parse('2026-11-03T06:00:00Z');
  const day = (segments, date = '2026-11-03') => ({ date, segments });
  const set = (d) => call(s, { action: 'time_day_set', day: d, name: 'Alex' });
  await rejects(set(day([], '2026-11-07')), 400, /jövőbeli/);
  await rejects(set(day([{ name: 'x', kind: 'todo', start: t0, end: t0 - 1 }])), 400, /befejezés/);
  await rejects(set(day([{ name: 'x', kind: 'todo', start: t0 + 5 * 86400000, end: null }])), 400, /napra/);
  await rejects(set({ date: '2026-11-03' }), 400, /szakasz/);
  assert.equal(await set(day([
    { name: 'DPTS', kind: 'todo', start: t0 + 3600000, end: null },
    { name: 'Általános', kind: 'activity', start: t0, end: t0 + 3600000 },
    { name: '', kind: 'break', start: t0 + 1800000, end: t0 + 2400000 },
    { name: 'Furcsa', kind: 'semmi', start: t0, end: t0 },
  ])), true);
  let r = await call(s, { action: 'time_range', from: '2026-11-02', to: '2026-11-08' });
  assert.equal(r.length, 1);
  assert.deepEqual(r[0].segments.map((x) => [x.name, x.kind]), [['Általános', 'activity'], ['Furcsa', 'todo'], ['Szünet', 'break'], ['DPTS', 'todo']]);
  assert.equal(r[0].segments[3].end, null);
  // Felülírás: a teljes nap újra
  await set(day([{ name: 'Általános', kind: 'activity', start: t0, end: t0 + 60000 }]));
  await set(day([{ name: 'E-mail', kind: 'activity', start: t0, end: null }], '2026-11-04'));
  r = await call(s, { action: 'time_range', from: '2026-11-02', to: '2026-11-08' });
  assert.deepEqual(r.map((x) => [x.date, x.segments.length]), [['2026-11-03', 1], ['2026-11-04', 1]]);
  // A bejegyzések közé nem kerül
  assert.deepEqual(await call(s, { action: 'range', from: '2026-11-02', to: '2026-11-08' }), []);
  await rejects(call(s, { action: 'time_range', from: '2026-01-01', to: '2026-11-08' }), 400, /hosszú/);
});
