#!/usr/bin/env bash
# A helyi BREMAT Központ csomagja: dist/BrematKozpont/, dist/Teendoim/ és a zipek
# (dist/Teendoim-es-BrematKozpont.zip = a kézi telepítéshez).
# A könyvtárakat (three.js, occt-import-js, Lucide) az npm-ből veszi, pontos változattal,
# így a csomag net nélkül is működik, és nem kell a repóba tenni a ~10 MB-ot.
set -euo pipefail
cd "$(dirname "$0")"
OUT=dist/BrematKozpont
TMP=$(mktemp -d)
rm -rf dist && mkdir -p "$OUT/web/lib"
( cd "$TMP" && npm init -y >/dev/null && npm i --no-audit --no-fund --silent occt-import-js@0.0.23 three@0.160.0 lucide@0.460.0 )
M="$TMP/node_modules"
cp "$M/three/build/three.module.js" "$M/three/examples/jsm/controls/OrbitControls.js" "$M/three/examples/jsm/loaders/STLLoader.js" "$OUT/web/lib/"
cp "$M/occt-import-js/dist/occt-import-js.js" "$M/occt-import-js/dist/occt-import-js.wasm" "$M/occt-import-js/dist/occt-import-js-worker.js" "$OUT/web/lib/"
cp "$M/lucide/dist/umd/lucide.min.js" "$OUT/web/lib/"
cp "$M/occt-import-js/LICENSE.md" "$OUT/web/lib/LICENSE-occt-import-js.txt"
cp "$M/occt-import-js/dist/license.occt.txt" "$OUT/web/lib/LICENSE-occt.txt"
cp "$M/three/LICENSE" "$OUT/web/lib/LICENSE-three.txt"
cp "$M/lucide/LICENSE" "$OUT/web/lib/LICENSE-lucide.txt" 2>/dev/null || true
rm -rf "$TMP"
# A kód (Teendoim + BrematKozpont) ugyanazzal az átalakítással, mint az önfrissítő csomag
# (BOM, CRLF) – így a frissen kicsomagolt változat ellenőrző összege egyezik a manifesttel.
node ../scripts/frissites.mjs --out dist
( cd dist && zip -qr BrematKozpont.zip BrematKozpont && zip -qr Teendoim-es-BrematKozpont.zip Teendoim BrematKozpont )
ls -la dist/*.zip
