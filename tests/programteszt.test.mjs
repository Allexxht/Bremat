// Robot programok (3. változat): DTPS mappa szinkron → termék / rész / verzió,
// teszt (minden tökéletes / észrevételek), pontok, új verzió → tesztre vár.  npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handle } from '../lib/kozpont-core.mjs';
import { memoryStore } from '../lib/km-core.mjs';
import { parseProgram, parseFolder, syncProduct, applyOp, visibleParts, summary, latestOf, openPoints, notesByVersion, dtpsLink, stateOf, usedCustoms, pstateOf, PtError } from '../public/programteszt.js';

const CODE = 'ABCDE-12345-FGHIJ-67890';
const NAPLO = 'NAPLO-12345-FGHIJ-00000';
const uuid = (i) => `${String(i).padStart(8, '0')}-1111-4111-8111-111111111111`;
const F7510 = '2950.7510      -     Voorraadmenger S-series  - kad extra';

function harness() {
  const store = memoryStore();
  let n = 0, t = Date.parse('2026-11-26T08:00:00Z');
  const c = (o, code = CODE) => handle(JSON.stringify({ code, ...o }), { accessCode: CODE, syncCode: NAPLO, store, now: new Date(t), newId: () => uuid(++n) });
  return { store, c, wait: (min) => { t += min * 60000; } };
}
const progs = (...names) => names.map((n, i) => ({ n, m: `2026-11-${String(10 + i).padStart(2, '0')}T08:00:00Z` }));

test('névszabály: verzió, UJ, cikkszám, rész', () => {
  assert.deepEqual(parseFolder(F7510), { sku: '2950.7510', name: 'Voorraadmenger S-series - kad extra' });
  assert.deepEqual(parseFolder('3100.611-610 R - Konténer cső'), { sku: '3100.611-610 R', name: 'Konténer cső' });
  const a = parseProgram('R001_V7-UJ_2950_7510_OLDAL-L_BEL.rp4', '2950.7510');
  assert.equal(a.v, 'V7-UJ'); assert.equal(a.n, 7); assert.equal(a.uj, true); assert.equal(a.part, 'OLDAL-L_BEL');
  assert.equal(a.key, 'OLDAL_L_BEL'); assert.equal(a.file, 'V7-UJ_2950_7510_OLDAL-L_BEL.rp4'); assert.equal(a.robot, 1);
  assert.equal(parseProgram('R001_2950_7510_SZOGVAS.rp4', '2950.7510').v, 'Alap');
  assert.equal(parseProgram('R001_V2_UJ_2950_7510_VALASZFAL_B.rp4', '2950.7510').v, 'V2_UJ');
  assert.equal(parseProgram('R001_KIVETELES TOMPA.rp4', '2950.7510').part, 'KIVETELES TOMPA');
  assert.equal(parseProgram('program.rp4', 'x'), null);
  assert.equal(parseProgram('R001_V1_2950_7510_OLDAL_LEMEZ_B.rp4', '2950.7510').key, parseProgram('R001_2950_7510_OLDAL_LEMEZ_B.rp4', '2950.7510').key);
});

test('szinkron → teszt → észrevétel → új verzió → tesztre vár → kész', async () => {
  const { store, c, wait } = harness();
  await c({ action: 'pt_sync', products: [
    { folder: F7510, programs: progs('R001_2950_7510_OLDAL_LEMEZ_B.rp4', 'R001_V1_2950_7510_OLDAL_LEMEZ_B.rp4', 'R001_2950_7510_SZOGVAS.rp4', 'R001_KIVETELES TOMPA.rp4') },
    { folder: '2950.5750 - Mokus Kerek', programs: [] },
  ] }, NAPLO);   // a Munkanapló kódjával is megy
  let { products, synced_at } = await c({ action: 'pt_list' });
  assert.ok(synced_at);
  assert.equal(products.length, 2);
  let p = products.find((x) => x.sku === '2950.7510');
  assert.equal(p.name, 'Voorraadmenger S-series - kad extra');
  assert.equal(visibleParts(p).length, 3);
  const lemez = p.parts.find((x) => x.key === 'OLDAL_LEMEZ_B');
  assert.equal(latestOf(lemez).v, 'V1');
  assert.equal(lemez.versions.length, 2);
  assert.equal(lemez.status, 'wait');
  assert.equal(dtpsLink(p, latestOf(lemez)), `http://localhost:47801/dtps.html#t=${encodeURIComponent(F7510)}&p=R001_V1_2950_7510_OLDAL_LEMEZ_B.rp4`);

  const op = async (o) => (p = await c({ action: 'pt_op', id: p.id, op: o }));
  await op({ type: 'test_fix', part: lemez.id, text: 'Sarokvarrat túl hosszú\n\n  Pisztoly ütközik a fülnél  ' });
  let L = p.parts.find((x) => x.id === lemez.id);
  assert.equal(L.status, 'fix');
  assert.deepEqual(L.points.map((x) => [x.text, x.v]), [['Sarokvarrat túl hosszú', 'V1'], ['Pisztoly ütközik a fülnél', 'V1']]);
  await op({ type: 'point_toggle', part: lemez.id, point: L.points[0].id });
  assert.equal(openPoints(p.parts.find((x) => x.id === lemez.id)).length, 1);
  await assert.rejects(op({ type: 'test_fix', part: lemez.id, text: '  \n ' }), (e) => e.status === 400);

  // ugyanaz a mappa még egyszer: nincs változás, nincs írás
  const rev = p.rev;
  wait(5);
  const r0 = await c({ action: 'pt_sync', products: [
    { folder: F7510, programs: progs('R001_2950_7510_OLDAL_LEMEZ_B.rp4', 'R001_V1_2950_7510_OLDAL_LEMEZ_B.rp4', 'R001_2950_7510_SZOGVAS.rp4', 'R001_KIVETELES TOMPA.rp4') },
    { folder: '2950.5750 - Mokus Kerek', programs: [] },
  ] });
  assert.equal(r0.changed, 0);

  // Alex megírta a V2-t → tesztre vár, a nyitott pont megmarad
  wait(5);
  await c({ action: 'pt_sync', products: [
    { folder: F7510, programs: progs('R001_2950_7510_OLDAL_LEMEZ_B.rp4', 'R001_V1_2950_7510_OLDAL_LEMEZ_B.rp4', 'R001_2950_7510_SZOGVAS.rp4', 'R001_KIVETELES TOMPA.rp4', 'R001_V2_2950_7510_OLDAL_LEMEZ_B.rp4') },
  ] });
  ({ products } = await c({ action: 'pt_list' }));
  assert.equal(products.length, 1, 'a Mokus Kerek mappája eltűnt → elrejtve');
  p = products[0];
  assert.ok(p.rev > rev);
  L = p.parts.find((x) => x.id === lemez.id);
  assert.equal(latestOf(L).v, 'V2'); assert.equal(L.status, 'wait'); assert.equal(openPoints(L).length, 1);
  assert.equal(visibleParts(p)[0].id, L.id, 'tesztre vár elöl');

  // minden tökéletes → kész, a pontok kipipálva; sorrend: kész a végén
  await op({ type: 'test_ok', part: L.id });
  L = p.parts.find((x) => x.id === lemez.id);
  assert.equal(L.status, 'ok'); assert.equal(openPoints(L).length, 0); assert.equal(L.tests.length, 2);
  assert.equal(visibleParts(p).at(-1).id, L.id);
  const s = summary(p);
  assert.equal(s.ok, 1); assert.equal(s.wait, 2); assert.equal(s.parts, 3); assert.equal(s.complete, false);

  // a rész programja eltűnik a mappából → rejtett
  await c({ action: 'pt_sync', products: [{ folder: F7510, programs: progs('R001_2950_7510_SZOGVAS.rp4') }] });
  p = (await c({ action: 'pt_list' })).products[0];
  assert.equal(visibleParts(p).length, 1);

  await assert.rejects(c({ action: 'pt_list' }, NAPLO), (e) => e.status === 401, 'a napló kódja csak a szinkronhoz jó');
  await assert.rejects(c({ action: 'pt_sync', products: 'x' }), (e) => e.status === 400);
  await assert.rejects(c({ action: 'pt_op', id: 'rossz', op: {} }), (e) => e.status === 404);
});

test('applyOp: hibás adat, az eredeti nem változik', () => {
  const ctx = { now: new Date('2026-11-26T08:00:00Z'), newId: (() => { let i = 0; return () => `n${++i}`; })() };
  const p = syncProduct(null, { folder: '1 - x', programs: progs('R001_1_A.rp4') }, ctx);
  const a = p.parts[0].id;
  assert.equal(p.parts[0].name, 'A');
  assert.throws(() => applyOp(p, { type: 'rossz', part: a }, ctx), PtError);
  assert.throws(() => applyOp(p, { type: 'test_ok', part: 'nincs' }, ctx), PtError);
  assert.throws(() => applyOp(p, { type: 'status', part: a, status: 'x' }, ctx), PtError);
  const q = applyOp(p, { type: 'status', part: a, status: 'ok' }, ctx);
  assert.equal(p.parts[0].status, 'wait');
  assert.equal(q.parts[0].status, 'ok');
  assert.equal(applyOp(q, { type: 'status', part: a, status: 'ok' }, ctx), q);
  assert.equal(syncProduct(q, { folder: '1 - x', programs: progs('R001_1_A.rp4') }, ctx), q, 'nincs változás → ugyanaz');
});

test('verziónkénti infó, összesítő infó, kis finomítás', async () => {
  const ctx = { now: new Date('2026-11-26T10:00:00Z'), newId: (() => { let i = 0; return () => `n${++i}`; })() };
  let p = syncProduct(null, { folder: F7510, programs: progs('R001_2950_7510_SZOGVAS.rp4') }, ctx);
  const a = p.parts[0].id;
  p = applyOp(p, { type: 'note_add', part: a, text: 'Alap: lassú' }, ctx);
  p = applyOp(p, { type: 'info_set', part: a, text: 'Mindig 2 db-ot fogunk be.' }, ctx);
  p = applyOp(p, { type: 'status', part: a, status: 'tweak' }, ctx);
  assert.equal(p.parts[0].status, 'tweak');
  // átírja V1-re: az Alap programmappa eltűnik, a V1 megjelenik → az infók megmaradnak
  p = syncProduct(p, { folder: F7510, programs: progs('R001_V1_2950_7510_SZOGVAS.rp4') }, ctx);
  assert.equal(p.parts[0].id, a);
  assert.equal(p.parts[0].status, 'wait');
  p = applyOp(p, { type: 'note_add', part: a, text: 'V1: jobb' }, ctx);
  const g = notesByVersion(p.parts[0]);
  assert.deepEqual(g.map((x) => [x.v, x.notes.map((n) => n.text)]), [['V1', ['V1: jobb']], ['Alap', ['Alap: lassú']]]);
  assert.equal(p.parts[0].info, 'Mindig 2 db-ot fogunk be.');
  p = applyOp(p, { type: 'note_delete', part: a, note: g[1].notes[0].id }, ctx);
  assert.equal(p.parts[0].notes.length, 1);
  assert.throws(() => applyOp(p, { type: 'note_add', part: a, text: ' ' }, ctx), PtError);
  assert.equal(applyOp(p, { type: 'info_set', part: a, text: 'Mindig 2 db-ot fogunk be.' }, ctx), p);
  const s = summary(applyOp(p, { type: 'status', part: a, status: 'tweak' }, ctx));
  assert.equal(s.tweak, 1);
});

test('saját állapot: bármilyen szöveg + szín, sorrend, összesítés', () => {
  const ctx = { now: new Date('2026-11-26T12:00:00Z'), newId: (() => { let i = 0; return () => `n${++i}`; })() };
  let p = syncProduct(null, { folder: F7510, programs: progs('R001_2950_7510_A.rp4', 'R001_2950_7510_B.rp4', 'R001_2950_7510_C.rp4') }, ctx);
  const [a, b, c] = p.parts.map((x) => x.id);
  assert.throws(() => applyOp(p, { type: 'status_custom', part: a, text: '  ', color: 'violet' }, ctx), PtError);
  assert.throws(() => applyOp(p, { type: 'status_custom', part: a, text: 'Jigre vár', color: 'red;}' }, ctx), PtError);
  p = applyOp(p, { type: 'status_custom', part: a, text: '  Jigre vár  ', color: 'violet' }, ctx);
  p = applyOp(p, { type: 'status', part: b, status: 'ok' }, ctx);
  const A = p.parts.find((x) => x.id === a);
  assert.deepEqual([A.status, A.custom], ['custom', { t: 'Jigre vár', c: 'violet' }]);
  assert.deepEqual([stateOf(A).t, stateOf(A).color], ['Jigre vár', '#7b3fe4']);
  assert.equal(applyOp(p, { type: 'status_custom', part: a, text: 'Jigre vár', color: 'violet' }, ctx), p, 'ugyanaz → nincs változás');
  assert.equal(applyOp(p, { type: 'status_custom', part: a, text: 'x'.repeat(60), color: 'grey' }, ctx).parts.find((x) => x.id === a).custom.t.length, 40);
  // sorrend: Tesztre vár → saját → Kész
  assert.deepEqual(visibleParts(p).map((x) => x.id), [c, a, b]);
  const s = summary(p);
  assert.deepEqual([s.wait, s.custom, s.ok], [1, 1, 1]);
  assert.deepEqual(s.customs.map((x) => [x.t, x.n]), [['Jigre vár', 1]]);
  assert.deepEqual(usedCustoms([p]).map((x) => x.t), ['Jigre vár']);
  // beépített állapotra vissza
  p = applyOp(p, { type: 'status', part: a, status: 'fix' }, ctx);
  assert.equal(stateOf(p.parts.find((x) => x.id === a)).t, 'Javítani kell');
});

test('jelölés: kihúzva / csak teszt / ideiglenes', () => {
  const ctx = { now: new Date('2026-11-26T13:00:00Z'), newId: (() => { let i = 0; return () => `n${++i}`; })() };
  let p = syncProduct(null, { folder: F7510, programs: progs('R001_2950_7510_A.rp4', 'R001_2950_7510_B.rp4', 'R001_2950_7510_C.rp4') }, ctx);
  const [a, b, c] = p.parts.map((x) => x.id);
  assert.throws(() => applyOp(p, { type: 'mark', part: a, mark: 'x' }, ctx), PtError);
  p = applyOp(p, { type: 'mark', part: a, mark: 'strike' }, ctx);
  p = applyOp(p, { type: 'mark', part: b, mark: 'test' }, ctx);
  assert.equal(applyOp(p, { type: 'mark', part: b, mark: 'test' }, ctx), p);
  assert.equal(visibleParts(p).at(-1).id, a, 'a kihúzott a végére kerül');
  const s = summary(p);
  assert.deepEqual([s.parts, s.wait, s.struck], [2, 2, 1], 'a kihúzott nem számít bele');
  p = applyOp(p, { type: 'mark', part: a, mark: null }, ctx);
  assert.equal(p.parts.find((x) => x.id === a).mark, null);
  assert.equal(summary(p).parts, 3);
  // új verzió: a jelölés megmarad
  p = syncProduct(p, { folder: F7510, programs: progs('R001_2950_7510_A.rp4', 'R001_V1_2950_7510_B.rp4', 'R001_2950_7510_C.rp4') }, ctx);
  assert.equal(p.parts.find((x) => x.id === b).mark, 'test');
  void c;
});

test('automatizálva rész + termékállapot', () => {
  const ctx = { now: new Date('2026-11-27T09:00:00Z'), newId: (() => { let i = 0; return () => `n${++i}`; })() };
  let p = syncProduct(null, { folder: F7510, programs: progs('R001_2950_7510_A.rp4', 'R001_2950_7510_B.rp4') }, ctx);
  const [a, b] = p.parts.map((x) => x.id);
  assert.equal(pstateOf(p), 'idle', 'alapból: Áll');
  p = applyOp(p, { type: 'status', part: a, status: 'auto' }, ctx);
  p = applyOp(p, { type: 'test_ok', part: b }, ctx);
  const s = summary(p);
  assert.deepEqual([s.auto, s.ok, s.done, s.complete], [1, 1, 2, true]);
  assert.equal(stateOf(p.parts.find((x) => x.id === a)).t, 'Automatizálva');
  assert.throws(() => applyOp(p, { type: 'pstate', pstate: 'x' }, ctx), PtError);
  const r = p.rev;
  p = applyOp(p, { type: 'pstate', pstate: 'test' }, ctx);
  assert.equal(pstateOf(p), 'test');
  assert.equal(p.rev, r + 1);
  assert.equal(applyOp(p, { type: 'pstate', pstate: 'test' }, ctx), p, 'ugyanaz: nincs változás');
  p = applyOp(p, { type: 'pstate', pstate: 'off' }, ctx);
  assert.equal(pstateOf(p), 'off');
});
