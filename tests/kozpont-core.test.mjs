// A Központ szerveroldalának tesztjei:  npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handle } from '../lib/kozpont-core.mjs';
import { PROJECTS } from '../lib/projektek.mjs';

const CODE = 'ABCDE-12345-FGHIJ-67890';
const call = (o, code = CODE) => handle(JSON.stringify({ code, ...o }), { accessCode: CODE });

test('rossz kóddal semmit nem ad ki', async () => {
  await assert.rejects(call({ action: 'projects' }, 'rossz'), (e) => e.status === 401);
  await assert.rejects(call({ action: 'projects' }, ''), (e) => e.status === 401);
});

test('jó kóddal a projektköröket adja', async () => {
  assert.equal(await call({ action: 'ping' }), true);
  const r = await call({ action: 'projects' });
  assert.ok(r.projects.length >= 1);
  assert.match(r.private_index, /^https:\/\/claude\.ai\/artifact\//);
  await assert.rejects(call({ action: 'mas' }), (e) => e.status === 400);
});

test('a projektlista adatai rendben vannak', () => {
  const keys = new Set();
  for (const g of PROJECTS) {
    assert.ok(g.key && g.name && Array.isArray(g.items) && g.items.length, g.name);
    assert.ok(!keys.has(g.key), `kétszer: ${g.key}`); keys.add(g.key);
    for (const it of g.items) {
      assert.match(it.u, /^https:\/\//, it.t);
      if (it.d) assert.match(it.d, /^\d{4}-\d{2}-\d{2}$/, it.t);
    }
  }
});

test('ötletek: felvétel, állapot, miért, törlés (másolattal)', async () => {
  const { memoryStore } = await import('../lib/km-core.mjs');
  const store = memoryStore();
  let n = 0;
  const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];
  const c = (o, now = new Date('2026-11-06T08:00:00Z')) => handle(JSON.stringify({ code: CODE, ...o }), { accessCode: CODE, store, now, newId: () => ids[n++] });
  await assert.rejects(c({ action: 'idea_add', text: '   ' }), (e) => e.status === 400);
  const a = await c({ action: 'idea_add', text: 'Új befogó a 3100-hoz' });
  assert.equal(a.status, 'nyitott');
  await c({ action: 'idea_add', text: 'Második' }, new Date('2026-11-06T09:00:00Z'));
  let list = await c({ action: 'idea_list' });
  assert.deepEqual(list.map((x) => x.text), ['Második', 'Új befogó a 3100-hoz']);
  const done = await c({ action: 'idea_update', id: a.id, status: 'kesz' });
  assert.equal(done.status, 'kesz'); assert.ok(done.done_at);
  const no = await c({ action: 'idea_update', id: ids[1], status: 'elvetve', reason: 'Túl drága' });
  assert.equal(no.reason, 'Túl drága');
  await assert.rejects(c({ action: 'idea_update', id: a.id, status: 'rossz' }), (e) => e.status === 400);
  await assert.rejects(c({ action: 'idea_update', id: 'nem-uuid', status: 'kesz' }), (e) => e.status === 404);
  const back = await c({ action: 'idea_update', id: a.id, status: 'nyitott' });
  assert.equal(back.done_at, null);
  await c({ action: 'idea_delete', id: a.id });
  list = await c({ action: 'idea_list' });
  assert.equal(list.length, 1);
  assert.ok(await store.get(`d/${a.id}`), 'törlés előtt másolat');
  await assert.rejects(handle(JSON.stringify({ code: 'rossz', action: 'idea_list' }), { accessCode: CODE, store }), (e) => e.status === 401);
});
