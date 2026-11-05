#!/usr/bin/env bash
# A helyi BREMAT Központ csomagja: dist/BrematKozpont/ és dist/BrematKozpont.zip.
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
cp web/index.html "$OUT/web/"
# A Windows PowerShell 5.1 csak BOM-mal olvassa jól az ékezetes szöveget; a .bat és az OLVASS CRLF.
printf '\xEF\xBB\xBF' > "$OUT/Kozpont.ps1"; cat Kozpont.ps1 >> "$OUT/Kozpont.ps1"
sed 's/$/\r/' Kozpont.bat > "$OUT/Kozpont.bat"
{ printf '\xEF\xBB\xBF'; sed 's/$/\r/' OLVASS.txt; } > "$OUT/OLVASS.txt"
rm -rf "$TMP"
( cd dist && zip -qr BrematKozpont.zip BrematKozpont )
ls -la dist/BrematKozpont.zip
