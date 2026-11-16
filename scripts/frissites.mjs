// A Teendőim és a helyi BREMAT Központ önfrissítő csomagja.
//
// public/frissites/manifest.json – a fájlok listája SHA-256 ellenőrző összeggel,
// public/frissites/f/<sha256>      – a fájlok tartalma (a név a tartalom összege, így a
//                                    gyorsítótár sosem ad régi változatot).
// A Teendőim induláskor és 3 óránként letölti a manifestet, és azt cseréli, ami változott.
// Csak programkód kerül ide (a repó nyilvános): titok, Valk fájl soha.
//
// Futtatás:  node scripts/frissites.mjs            – a public/frissites/ frissítése
//            node scripts/frissites.mjs --out DIR  – a fájlok kiírása DIR/<út> alá (zip-hez)
// A tests/frissites.test.mjs elbukik, ha a public/frissites/ elavult.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const OUT = join(ROOT, 'public', 'frissites');

// [út a gépen (a Teendoim / BrematKozpont mappán belül), forrás a repóban, átalakítás]
export const FILES = [
  ['Teendoim/Teendoim.ps1', 'teendoim/Teendoim.ps1', 'ps1'],
  ['Teendoim/Teendoim.bat', 'teendoim/Teendoim.bat', 'bat'],
  ['Teendoim/OLVASS.txt', 'teendoim/OLVASS.txt', 'txt'],
  ['BrematKozpont/Kozpont.ps1', 'helyi/Kozpont.ps1', 'ps1'],
  ['BrematKozpont/Kozpont.bat', 'helyi/Kozpont.bat', 'bat'],
  ['BrematKozpont/OLVASS.txt', 'helyi/OLVASS.txt', 'txt'],
  ['BrematKozpont/web/index.html', 'helyi/web/index.html', 'raw'],
];

const BOM = Buffer.from([0xef, 0xbb, 0xbf]);
const sha = (b) => createHash('sha256').update(b).digest('hex');

// A Windows PowerShell 5.1 csak BOM-mal olvassa jól az ékezeteket; a .bat és az OLVASS CRLF.
export function transform(buf, kind) {
  if (kind === 'raw') return buf;
  let s = buf.toString('utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n');
  if (kind === 'bat' || kind === 'txt') s = s.replace(/\n/g, '\r\n');
  const body = Buffer.from(s, 'utf8');
  return kind === 'bat' ? body : Buffer.concat([BOM, body]);
}

export function build() {
  const files = FILES.map(([p, src, kind]) => {
    const data = transform(readFileSync(join(ROOT, src)), kind);
    const h = sha(data);
    return { p, sha256: h, size: data.length, u: `f/${h}`, data };
  });
  const version = sha(files.map((f) => `${f.p}:${f.sha256}`).join('\n')).slice(0, 12);
  const manifest = { version, files: files.map(({ data, ...f }) => f) };
  return { manifest, files };
}

export const manifestText = (manifest) => JSON.stringify(manifest, null, 2) + '\n';

function writeSite() {
  const { manifest, files } = build();
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(join(OUT, 'f'), { recursive: true });
  for (const f of files) writeFileSync(join(OUT, f.u), f.data);
  writeFileSync(join(OUT, 'manifest.json'), manifestText(manifest));
  console.log(`public/frissites: ${manifest.version} (${files.length} fájl)`);
}

function writeTree(dir) {
  const { manifest, files } = build();
  for (const f of files) { const t = join(dir, f.p); mkdirSync(dirname(t), { recursive: true }); writeFileSync(t, f.data); }
  console.log(`${dir}: ${manifest.version}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const i = process.argv.indexOf('--out');
  if (i > 0) writeTree(process.argv[i + 1]); else writeSite();
}
