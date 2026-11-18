// A Valk heti lap kártyáinak „nagy része”: minden feladatnál rövid, lényegretörő utasítás.
import test from 'node:test';
import assert from 'node:assert/strict';
import { TASKS } from '../public/tasks.js';

test('minden feladatnak van rövid utasítása (todo), legfeljebb 80 karakter', () => {
  for (const t of TASKS) {
    assert.equal(typeof t.todo, 'string', `${t.key}: nincs todo`);
    assert.ok(t.todo.trim().length > 0, `${t.key}: üres todo`);
    assert.ok(t.todo.length <= 80, `${t.key}: túl hosszú todo (${t.todo.length} karakter)`);
    assert.ok(!/[<>]/.test(t.todo), `${t.key}: a todo sima szöveg legyen (nincs HTML)`);
  }
});

test('a figyelmeztetés (warn), ha van, rövid sima szöveg', () => {
  for (const t of TASKS.filter((x) => x.warn !== undefined)) {
    assert.ok(t.warn.trim().length > 0 && t.warn.length <= 80, `${t.key}: rossz warn`);
    assert.ok(!/[<>]/.test(t.warn), `${t.key}: a warn sima szöveg legyen`);
  }
});
