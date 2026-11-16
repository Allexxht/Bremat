// Az önfrissítő csomag (public/frissites/) naprakész-e, és jó-e a formátuma.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { build, manifestText, transform, OUT } from '../scripts/frissites.mjs';

test('a public/frissites naprakész (különben: node scripts/frissites.mjs)', () => {
  const { manifest, files } = build();
  assert.equal(readFileSync(join(OUT, 'manifest.json'), 'utf8'), manifestText(manifest));
  for (const f of files) assert.ok(readFileSync(join(OUT, f.u)).equals(f.data), f.p);
  assert.deepEqual(readdirSync(join(OUT, 'f')).sort(), files.map((f) => f.u.slice(2)).sort(), 'nincs fölösleges fájl');
});

test('a manifest útjai és összegei olyanok, amilyet a Teendőim elfogad', () => {
  const { manifest, files } = build();
  assert.match(manifest.version, /^[0-9a-f]{12}$/);
  for (const f of manifest.files) {
    assert.match(f.p, /^(Teendoim|BrematKozpont)\/[A-Za-z0-9][A-Za-z0-9._/-]*$/);
    assert.ok(!f.p.includes('..'));
    assert.match(f.u, /^f\/[0-9a-f]{64}$/);
    assert.equal(f.u, 'f/' + f.sha256);
  }
  for (const f of files) assert.equal(createHash('sha256').update(f.data).digest('hex'), f.sha256);
});

test('a PowerShell fájlok BOM-mal, a .bat CRLF-fel megy ki', () => {
  const { files } = build();
  const by = Object.fromEntries(files.map((f) => [f.p, f.data]));
  for (const p of ['Teendoim/Teendoim.ps1', 'BrematKozpont/Kozpont.ps1']) assert.deepEqual([...by[p].subarray(0, 3)], [0xef, 0xbb, 0xbf], p);
  assert.ok(by['Teendoim/Teendoim.bat'].includes('\r\n'));
  assert.ok(!/(^|[^\r])\n/.test(by['Teendoim/Teendoim.bat'].toString()));
  assert.ok(transform(Buffer.from('a\r\nb\n'), 'txt').equals(Buffer.from('﻿a\r\nb\r\n')));
});

