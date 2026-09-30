# BREMAT – Valk robot heti karbantartási lap – projektjegyzet

## Mi ez
A BREMAT saját, belső eszköze: online heti karbantartási ellenőrzőlap a Valk Welding /
Panasonic TAWERS TM-2000WGH4 hegesztőrobothoz. A gépkezelő minden hétfőn tabletről tölti ki,
a lapok archiválódnak és visszakereshetők.

**Teljesen külön van az AndonWork (munkakövetés) terméktől** – a felhasználó kifejezett kérése.
Semmilyen kódot, táblát, Supabase projektet vagy Netlify oldalt ne ossz meg vele, és ne
hivatkozz rá. Az AndonWork a `Allexxht/astro-platform-starter` repóban él, ahhoz ebből a
projektből nem nyúlunk.

**Nincs Supabase** – a felhasználónak nem lehet több Supabase projektje. Az adatok a Netlify
oldal saját Netlify Blobs tárolójában vannak. Új külső szolgáltatást csak kérésre vezess be.

## Fájlok
- `public/index.html` – egyfájlos felület (vanilla JS, nincs build). Elején a `CONFIG` és az
  `ITEMS` (a 16 tétel). Adatréteg: `createApiAdapter()` (éles, `/api/km`) és
  `createDemoAdapter()` (`?demo`, localStorage) azonos interfésszel
  (`ping`, `list`, `get`, `submit`, `approve`) – új funkciót mindkettőbe.
- `netlify/functions/km.mjs` – Netlify Function v2 (`/api/km`, csak POST). Vékony réteg:
  a Blobs tárolót (`km-checks`, `consistency: 'strong'`) adja át a `lib/km-core.mjs`-nek.
- `lib/km-core.mjs` – a teljes szerveroldali logika, tárolófüggetlen (`memoryStore()` a
  tesztekhez). Kódellenőrzés (sha256 + `timingSafeEqual`), `validateSubmit()` minden mezőre,
  ISO hét és „ma” Europe/Budapest szerint.
- `tests/km-core.test.mjs` – `npm test` (Node 22-ben a `node --test tests/` mappát nem fogad
  el, a fájlt kell megadni).

## Adatmodell és biztonság
- Egy lap = egy blob: `check/<uuid>` kulcs, JSON: `check_date`, `iso_year`/`iso_week`
  (szerveren számolva), `robot`, `inspector`, `items` (16 elem: `no`, `status` = `ok`|`action`,
  `note` – Rendben tételnél `null`), `action_count`, `cooling_water_changed` (a lap dátuma vagy
  `null`), `gas_flow_lpm`, `remarks`, `parts_used`, `escalate`/`escalate_to`,
  `approved_by`/`approved_at`, `created_at`.
- Beküldés `onlyIfNew`, jóváhagyás `onlyIfMatch` (etag) – így két eszköz egyszerre sem tud
  kétszer jóváhagyni. Beküldött lap nem módosítható és nem törölhető – ez szándékos
  (ellenőrzési napló), törlés művelet nincs.
- Hozzáférési kód: `KM_ACCESS_CODE` Netlify env var, normalizálva (csak betű/szám, nagybetűsítve)
  legalább 12 karakter, különben a function 500-at ad. A kliens localStorage-ban tárolja
  (`km-kod`), `?kod=` linkből átveszi és kiveszi a címsorból. `Referrer-Policy: no-referrer`.
- A `list` minden lapot teljes tartalommal ad vissza (hetente egy lap, évente ~52 blob –
  sok év után is kicsi). Ha valaha lassú lenne, akkor jöhet egy összesítő index-blob.

## Munkamódszer
- A magyarázatok magyarul szóljanak, de a menü- és beállításneveket angolul írd
  (az eszközök angol felületűek).
- Közvetlenül a `main`-re megy (a felhasználó így kérte); a Netlify a pusht azonnal kiteszi.
- Módosítás után: `npm test`, majd DEMÓ módban (`?demo`) végigkattintani: új lap üresen beküldve
  (hibák jelennek meg) → kitöltés beavatkozással → újratöltés (piszkozat megmarad) → beküldés →
  jóváhagyás → áttekintés (a hét kitöltve, hűtővíz-kártya frissült). Telefon-szélességen is.
- Szerveroldali változásnál a valódi functiont is érdemes helyben futtatni a
  `@netlify/blobs` `BlobsServer`-ével (a `NETLIFY_BLOBS_CONTEXT` env varral irányítva rá).
