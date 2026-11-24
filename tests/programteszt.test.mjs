// Robot programteszt követő (2. változat): termék → részek, állapot, óra, jegyzet.  npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handle } from '../lib/kozpont-core.mjs';
import { memoryStore } from '../lib/km-core.mjs';
import { newProduct, applyOp, summary, partMs, clock, PtError } from '../public/programteszt.js';

const CODE = 'ABCDE-12345-FGHIJ-67890';
const uuid = (i) => `${String(i).padStart(8, '0')}-1111-4111-8111-111111111111`;

function harness() {
  const store = memoryStore();
  let n = 0, t = Date.parse('2026-11-24T08:00:00Z');
  const c = (o) => handle(JSON.stringify({ code: CODE, ...o }), { accessCode: CODE, store, now: new Date(t), newId: () => uuid(++n) });
  return { store, c, wait: (min) => { t += min * 60000; }, now: () => t };
}

test('termék → részek → állapot, óra, jegyzet; törlés másolattal', async () => {
  const { store, c, wait, now } = harness();
  await assert.rejects(c({ action: 'pt_create', product: { sku: ' ' } }), (e) => e.status === 400);
  let p = await c({ action: 'pt_create', product: { sku: '2950.5750', name: 'Voorraadmenger' } });
  await assert.rejects(c({ action: 'pt_create', product: { sku: '2950.5750' } }), (e) => e.status === 409);
  const op = async (o) => (p = await c({ action: 'pt_op', id: p.id, rev: p.rev, op: o }));

  await op({ type: 'part_add', name: 'Oldallemezek' });
  await op({ type: 'part_add', name: 'Tompavarrat' });
  const [a, b] = p.parts.map((x) => x.id);
  assert.equal(p.parts[0].status, 'programozas');

  await op({ type: 'timer_start', part: a });
  wait(30);
  await op({ type: 'timer_start', part: b });   // a másik indul → az első megáll
  assert.equal(p.parts[0].running_since, null);
  assert.equal(p.parts[0].spent_ms, 30 * 60000);
  wait(15);
  await op({ type: 'timer_stop', part: b });
  assert.equal(p.parts[1].spent_ms, 15 * 60000);
  await op({ type: 'time_fix', part: b, minutes: -5 });
  assert.equal(p.parts[1].spent_ms, 10 * 60000);

  await op({ type: 'part_status', part: a, status: 'teszt' });
  await op({ type: 'part_status', part: a, status: 'finomitas' });
  await assert.rejects(op({ type: 'part_status', part: a, status: 'rossz' }), (e) => e.status === 400);
  await op({ type: 'note_add', part: a, text: 'Kezdőpont 2 mm-rel elcsúszik' });
  assert.equal(p.parts[0].notes[0].text, 'Kezdőpont 2 mm-rel elcsúszik');
  await op({ type: 'note_delete', part: a, note: p.parts[0].notes[0].id });
  assert.equal(p.parts[0].notes.length, 0);

  // kész → a futó óra megáll
  await op({ type: 'timer_start', part: a });
  wait(10);
  await op({ type: 'part_status', part: a, status: 'kesz' });
  assert.equal(p.parts[0].running_since, null);
  assert.equal(p.parts[0].spent_ms, 40 * 60000);
  const s = summary(p, now());
  assert.equal(s.done, 1); assert.equal(s.parts, 2); assert.equal(s.total_ms, 50 * 60000); assert.equal(s.complete, false);

  // egyszerre csak egy óra – másik terméken is
  let q = await c({ action: 'pt_create', product: { sku: '3100.0610' } });
  q = await c({ action: 'pt_op', id: q.id, rev: q.rev, op: { type: 'part_add', name: 'Cső' } });
  await op({ type: 'timer_start', part: b });
  wait(5);
  q = await c({ action: 'pt_op', id: q.id, rev: q.rev, op: { type: 'timer_start', part: q.parts[0].id } });
  p = (await c({ action: 'pt_list' })).find((x) => x.id === p.id);
  assert.equal(p.parts[1].running_since, null);
  assert.equal(p.parts[1].spent_ms, 15 * 60000);
  assert.ok(q.parts[0].running_since);

  // elavult rev → 409
  await assert.rejects(c({ action: 'pt_op', id: p.id, rev: p.rev - 1, op: { type: 'part_add', name: 'x' } }), (e) => e.status === 409);
  await c({ action: 'pt_delete', id: p.id });
  assert.equal((await c({ action: 'pt_list' })).length, 1);
  assert.ok(await store.get(`pd/${p.id}`));
  await assert.rejects(handle(JSON.stringify({ code: 'rossz', action: 'pt_list' }), { accessCode: CODE, store }), (e) => e.status === 401);
});

test('applyOp: hibás adat, az eredeti nem változik, óra kijelzés', () => {
  const ts = '2026-11-24T08:00:00.000Z';
  const ctx = { now: new Date(ts), newId: () => 'n1' };
  const p = newProduct({ id: 'x', sku: '1' }, ts);
  assert.throws(() => applyOp(p, { type: 'part_add', name: '' }, ctx), PtError);
  assert.throws(() => applyOp(p, { type: 'timer_start', part: 'nincs' }, ctx), PtError);
  const q = applyOp(p, { type: 'part_add', name: 'Köztes lemez' }, ctx);
  assert.equal(p.parts.length, 0); assert.equal(q.rev, 2);
  assert.throws(() => applyOp(q, { type: 'time_fix', part: 'n1', minutes: 0 }, ctx), PtError);
  const r = applyOp(q, { type: 'timer_start', part: 'n1' }, ctx);
  assert.equal(partMs(r.parts[0], Date.parse(ts) + 65000), 65000);
  assert.equal(clock(3725000), '1:02:05');
});
