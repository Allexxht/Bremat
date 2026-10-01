// Egységtesztek a szerveroldali logikához:  node --test tests/km-core.test.mjs  (vagy: npm test)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handle, memoryStore, isoWeek, normalizeCode } from '../lib/km-core.mjs';
import { WEEKLY_KEYS, FORM_VERSION } from '../public/tasks.js';

const CODE = 'ABCDE-12345-FGHIJ-67890';
const NOW = new Date('2026-09-30T08:00:00Z');
const ctx = (store) => ({ store, accessCode: CODE, now: NOW });
const req = (o) => JSON.stringify(o);
// A heti feladatok mind, Rendben – fn(key) felülírhatja egy-egy tételét.
const items = (fn = () => ({})) => WEEKLY_KEYS.map((key) => ({ key, status: 'ok', ...fn(key) }));
const good = (extra = {}) => ({ form_version: FORM_VERSION, check_date: '2026-09-28', robot: 'Valk robot', inspector: ' Kiss Péter ', items: items(), escalate: false, ...extra });

async function rejects(p, status, re) {
  await assert.rejects(p, (e) => { assert.equal(e.status, status); if (re) assert.match(e.message, re); return true; });
}

test('ISO hét', () => {
  assert.deepEqual(isoWeek('2026-09-28'), { year: 2026, week: 40 });
  assert.deepEqual(isoWeek('2027-01-01'), { year: 2026, week: 53 });
  assert.deepEqual(isoWeek('2025-12-29'), { year: 2026, week: 1 });
});

test('kód: rossz, hiányzó, túl rövid szerveroldali kód', async () => {
  const s = memoryStore();
  await rejects(handle(req({ action: 'ping', code: 'rossz' }), ctx(s)), 401, /Hibás/);
  await rejects(handle(req({ action: 'list' }), ctx(s)), 401);
  await rejects(handle(req({ action: 'ping', code: 'x' }), { store: s, accessCode: '' }), 500, /KM_ACCESS_CODE/);
  await rejects(handle(req({ action: 'ping', code: 'short' }), { store: s, accessCode: 'short' }), 500);
});

test('kód: kisbetű, kötőjel nélkül is jó', async () => {
  assert.equal(normalizeCode('abcde 12345-fghij_67890'), 'ABCDE12345FGHIJ67890');
  assert.equal(await handle(req({ action: 'ping', code: 'abcde12345fghij67890' }), ctx(memoryStore())), true);
});

test('beküldés: hibás lapok elutasítva', async () => {
  const s = memoryStore();
  const sub = (check) => handle(req({ action: 'submit', code: CODE, check }), ctx(s));
  await rejects(sub(good({ items: [] })), 400, /Hiányoznak/);
  await rejects(sub(good({ items: items((k) => (k === 'terulet' ? { status: 'action', note: '' } : {})) })), 400, /mit csináltál: Munkaterület/);
  await rejects(sub(good({ items: items((k) => (k === 'sin' ? { status: 'skip', note: ' ' } : {})) })), 400, /miért maradt el: Sín/);
  await rejects(sub(good({ items: items((k) => (k === 's11' ? { status: null } : {})) })), 400, /Nincs kitöltve: Pisztolyhelyzet/);
  await rejects(sub(good({ items: items().filter((x) => x.key !== 'biztonsag') })), 400, /Hiányzik a lapról: Biztonsági/);
  await rejects(sub(good({ items: [...items(), { key: 'nincs-ilyen', status: 'ok' }] })), 400, /Ismeretlen feladat/);
  await rejects(sub(good({ items: [...items(), { key: 'terulet', status: 'ok' }] })), 400, /Kétszer szerepel/);
  await rejects(sub(good({ escalate: true })), 400, /kinek/);
  await rejects(sub(good({ escalate: undefined })), 400, /továbbjelzés/);
  await rejects(sub(good({ check_date: '2030-01-01' })), 400, /jövőbeli/);
  await rejects(sub(good({ check_date: '2026-02-30' })), 400, /Érvénytelen/);
  await rejects(sub(good({ inspector: '   ' })), 400, /nevének/);
  await rejects(sub(good({ gas_flow_lpm: 'sok' })), 400, /szám/);
  await rejects(sub(good({ gas_flow_lpm: 500 })), 400, /0 és 100/);
  await rejects(sub(good({ form_version: undefined })), 409, /Töltsd újra/);
  await rejects(sub(good({ form_version: 2 })), 409, /Töltsd újra/);
  assert.equal((await s.listKeys('check/')).length, 0);
});

test('beküldés, lista, lekérés, jóváhagyás egyszer', async () => {
  const s = memoryStore();
  const id = await handle(req({ action: 'submit', code: CODE, check: good({
    escalate: true, escalate_to: 'Karbantartás', gas_flow_lpm: '14.46',
    items: [...items((k) => (k === 'huto-nez' ? { status: 'action', note: 'Vízcsere' } : k === 'sin' ? { status: 'skip', note: 'Nem volt idő' } : { note: 'eldobandó' })),
      { key: 'hutoviz-csere', status: 'ok' }, { key: 'kerites', status: 'skip', note: 'Később' }],
  }) }), ctx(s));
  const list = await handle(req({ action: 'list', code: CODE }), ctx(s));
  assert.equal(list.length, 1);
  const r = list[0];
  assert.equal(r.id, id);
  assert.equal(r.inspector, 'Kiss Péter');
  assert.equal(r.iso_week, 40);
  assert.equal(r.form_version, FORM_VERSION);
  assert.equal(r.action_count, 1);
  assert.equal(r.skip_count, 2);
  assert.equal(r.cooling_water_changed, '2026-09-28', 'a hűtővíz-csere feladatból jön');
  assert.equal(r.gas_flow_lpm, 14.5);
  assert.equal(r.items.length, WEEKLY_KEYS.length + 2);
  const by = Object.fromEntries(r.items.map((x) => [x.key, x]));
  assert.equal(by.terulet.note, null, 'Rendben tételnél a megjegyzés nem tárolódik');
  assert.equal(by.terulet.title, 'Munkaterület és szerszámok', 'a címet a szerver írja a katalógusból');
  assert.equal(by['huto-nez'].note, 'Vízcsere');
  assert.equal(by.sin.status, 'skip');
  assert.equal(by.sin.note, 'Nem volt idő');

  const got = await handle(req({ action: 'get', code: CODE, id }), ctx(s));
  assert.equal(got.escalate_to, 'Karbantartás');

  const ap = await handle(req({ action: 'approve', code: CODE, id, name: ' Nagy Béla ' }), ctx(s));
  assert.equal(ap.approved_by, 'Nagy Béla');
  await rejects(handle(req({ action: 'approve', code: CODE, id, name: 'Más' }), ctx(s)), 409, /már jóváhagyták/);
  await rejects(handle(req({ action: 'approve', code: CODE, id, name: '' }), ctx(s)), 400);
  await rejects(handle(req({ action: 'get', code: CODE, id: '../../etc' }), ctx(s)), 404);
  await rejects(handle(req({ action: 'get', code: CODE, id: '00000000-0000-0000-0000-000000000000' }), ctx(s)), 404);
});

test('ismeretlen művelet és hibás kérés', async () => {
  const s = memoryStore();
  await rejects(handle(req({ action: 'delete', code: CODE }), ctx(s)), 400, /Ismeretlen/);
  await rejects(handle('nem json', ctx(s)), 400);
  await rejects(handle('x'.repeat(70000), ctx(s)), 413);
});
