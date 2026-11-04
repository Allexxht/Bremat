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
