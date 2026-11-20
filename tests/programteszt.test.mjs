// Robot programteszt követő: közös logika + szerver műveletek.  npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handle } from '../lib/kozpont-core.mjs';
import { memoryStore } from '../lib/km-core.mjs';
import { newProduct, applyOp, stats, findByHash, PtError } from '../public/programteszt.js';

const CODE = 'ABCDE-12345-FGHIJ-67890';
const H1 = 'a'.repeat(64), H2 = 'b'.repeat(64);
const uuid = (i) => `${String(i).padStart(8, '0')}-1111-4111-8111-111111111111`;

function harness() {
  const store = memoryStore();
  let n = 0, clock = Date.parse('2026-11-02T08:00:00Z');
  const c = (o) => handle(JSON.stringify({ code: CODE, ...o }), { accessCode: CODE, store, now: new Date(clock), newId: () => uuid(++n) });
  return { store, c, later: (days) => { clock += days * 86400000; } };
}

test('teljes menet: termék → részek → V1/V2 → körök → hibák → kész', async () => {
  const { store, c, later } = harness();
  await assert.rejects(c({ action: 'pt_create', product: { sku: ' ' } }), (e) => e.status === 400);
  let p = await c({ action: 'pt_create', product: { sku: '2950.5750', name: 'Voorraadmenger', received_at: '2026-11-01' } });
  await assert.rejects(c({ action: 'pt_create', product: { sku: '2950.5750' } }), (e) => e.status === 409);
  const op = async (o) => (p = await c({ action: 'pt_op', id: p.id, rev: p.rev, op: o }));

  await op({ type: 'status', status: 'programozas' });
  assert.equal(p.prog_start, '2026-11-02');
  await op({ type: 'part_add', name: 'Oldallemez' });
  const part = p.parts[0].id;
  await op({ type: 'version_add', part, file: { name: 'oldal.prg', size: 1234, hash: H1 }, change: 'Első változat' });
  assert.equal(p.parts[0].versions[0].v, 1);
  await assert.rejects(op({ type: 'version_add', part, file: { name: 'x', hash: H1 } }), /már megvan: V1/);
  await op({ type: 'time_add', kind: 'programozas', minutes: 90 });

  later(1);
  await op({ type: 'round_add', result: 'finomitas', minutes: 45, note: 'Varrat elcsúszott' });
  assert.equal(p.status, 'teszt'); assert.equal(p.rounds[0].n, 1);
  assert.deepEqual(p.rounds[0].versions.map((x) => x.v), [1]);
  await op({ type: 'issue_add', text: 'Tompavarrat kezdete elcsúszik', part });
  assert.equal(p.issues[0].round, 1); assert.equal(p.issues[0].status, 'nyitott');
  await op({ type: 'version_add', part, file: { name: 'oldal.prg', size: 1240, hash: H2 }, change: 'Kezdőpont javítva' });
  const [v1, v2] = p.parts[0].versions;
  assert.equal(p.parts[0].active, v2.id);
  await op({ type: 'issue_solve', issue: p.issues[0].id, solution: 'Touch sensor pont áthelyezve' });

  // régi verzió felismerése az ujjlenyomatból
  const hit = findByHash([p], H1)[0];
  assert.equal(hit.version.v, 1); assert.equal(hit.active, false);
  assert.equal(findByHash([p], H2)[0].active, true);

  // szünet, folytatás
  await op({ type: 'pause', reason: 'Nincs termék' });
  await assert.rejects(op({ type: 'pause' }), (e) => e.status === 400);
  later(30);
  await op({ type: 'resume' });
  await op({ type: 'round_add', result: 'jo', minutes: 30 });
  assert.deepEqual(p.rounds[1].versions.map((x) => x.v), [2]);
  await op({ type: 'status', status: 'fonok_ok', by: 'Főnök' });
  assert.equal(p.boss_ok_by, 'Főnök');
  later(1);
  await op({ type: 'status', status: 'automatizalt' });
  assert.ok(p.done_at);

  const s = stats(p, '2026-12-10');
  assert.equal(s.rounds, 2); assert.equal(s.issues, 1); assert.equal(s.openIssues, 0);
  assert.equal(s.byKind.programozas, 90); assert.equal(s.byKind.teszt, 75); assert.equal(s.total, 165);
  assert.equal(s.pausedDays, 30); assert.equal(s.versions, 2);
  assert.equal(s.leadDays, 33);   // 11-01 → 12-04
  assert.equal(s.stale, false);
  assert.ok(p.log.length >= 10);

  // aktív verzió visszaállítása
  await op({ type: 'version_activate', part, version: v1.id });
  assert.equal(p.parts[0].active, v1.id);

  // elavult rev → 409
  await assert.rejects(c({ action: 'pt_op', id: p.id, rev: p.rev - 1, op: { type: 'note_add', text: 'x' } }), (e) => e.status === 409);
  await assert.rejects(c({ action: 'pt_op', id: p.id, rev: p.rev, op: { type: 'mas' } }), (e) => e.status === 400);

  // lista, törlés másolattal
  assert.equal((await c({ action: 'pt_list' })).length, 1);
  await c({ action: 'pt_delete', id: p.id });
  assert.equal((await c({ action: 'pt_list' })).length, 0);
  assert.ok(await store.get(`pd/${p.id}`));
  await assert.rejects(handle(JSON.stringify({ code: 'rossz', action: 'pt_list' }), { accessCode: CODE, store }), (e) => e.status === 401);
});

test('applyOp: hibás adatot nem enged, az eredetit nem módosítja', () => {
  const ts = '2026-11-02T08:00:00.000Z';
  const p = newProduct({ id: 'x', sku: '1' }, ts);
  const ctx = { now: new Date(ts), newId: () => 'n1' };
  assert.throws(() => applyOp(p, { type: 'time_add', kind: 'programozas', minutes: 0 }, ctx), PtError);
  assert.throws(() => applyOp(p, { type: 'time_add', kind: 'rossz', minutes: 5 }, ctx), PtError);
  assert.throws(() => applyOp(p, { type: 'round_add', result: 'x' }, ctx), PtError);
  assert.throws(() => applyOp(p, { type: 'info', received_at: '2026-13-40' }, ctx), PtError);
  assert.throws(() => applyOp(p, { type: 'version_add', part: 'nincs' }, ctx), PtError);
  const q = applyOp(p, { type: 'part_add', name: 'Köztes lemez' }, ctx);
  assert.equal(p.parts.length, 0); assert.equal(q.parts.length, 1); assert.equal(q.rev, 2);
  // 14 nap mozgás nélkül: elakadt
  assert.equal(stats(q, '2026-11-20').stale, true);
  assert.equal(stats(q, '2026-11-10').stale, false);
});
