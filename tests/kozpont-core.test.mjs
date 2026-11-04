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
