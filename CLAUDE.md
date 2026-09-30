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
  `ITEMS` (a 16 tétel: `key`, `group` A/B, `title`, `steps`, `bad`, `src`). Adatréteg: `createApiAdapter()` (éles, `/api/km`) és
  `createDemoAdapter()` (`?demo`, localStorage) azonos interfésszel
  (`ping`, `list`, `get`, `submit`, `approve`) – új funkciót mindkettőbe.
- `DETAILS` (ugyanott, a tételek után) – tételenként a lenyitható „Bővebben” rész: `more`
  (címsor + HTML szakaszok) és `figs` (kép, felirat, forrás). Minden állítás mellett forrás
  (Valk fejezet / napi pont, Panasonic R/V/P); ami nem a kézikönyvből való, az `NK` jelölést
  kap („Általános gyakorlat – nem a kézikönyvből”). Ezt a szabályt tartsd meg: a felhasználó a
  gyártó előírását akarja, nem általános tanácsot.
- `public/img/*.jpg` – a kézikönyv-fotókból vágott, kiegyenesített ábrák (1200 px széles,
  JPEG 80). A zárt `<details>` miatt csak lenyitáskor töltődnek. Koppintásra nagyító ablak.
- `netlify/functions/km.mjs` – Netlify Function v2 (`/api/km`, csak POST). Vékony réteg:
  a Blobs tárolót (`km-checks`, `consistency: 'strong'`) adja át a `lib/km-core.mjs`-nek.
- `lib/km-core.mjs` – a teljes szerveroldali logika, tárolófüggetlen (`memoryStore()` a
  tesztekhez). Kódellenőrzés (sha256 + `timingSafeEqual`), `validateSubmit()` minden mezőre,
  ISO hét és „ma” Europe/Budapest szerint.
- `tests/km-core.test.mjs` – `npm test` (Node 22-ben a `node --test tests/` mappát nem fogad
  el, a fájlt kell megadni).

## A heti tételek
- **2. változat (2026. szeptember 30.)**: a Valk 6.6 heti lista szó szerinti fordítása
  (1. változat) a felhasználónak zavaros és értelmetlen volt. Most minden tétel egy konkrét,
  hétfőn elvégezhető feladat: lépések + „Ha nincs rendben”. Sorrend: A = leállított cellánál,
  B = bekapcsolás után. Forrás minden tételnél (`src`): Valk 6.6 / napi 6.5 A–C, Panasonic
  R (robotkar) / V (vezérlő).
- **Rendben** = elvégezte, a leírt rutinmunkán (tisztítás, heti áramátadó-csere) felül nem kellett
  semmi. **Beavatkozás** = ezen felül csere, javítás, utántöltés vagy hiba.
- **2026. szeptember 30., „Bővebben”:** a szöveget egy külön ellenőrző kör vetette össze a
  kézikönyv-fotókkal (~170 állítás); a talált eltérések javítva. Kiemelt tanulság: a gáz
  gyorscsatlakozója a kézikönyv képe szerint **a robotkaron, a huzaladagoló alatt** van
  (GAS/AIR felirat), nem a robot talpán, ahogy a korábbi papíros útmutató írta.
- Tudatos eltérések a Valk listától: a vezérlő **belső** kifúvatása kimaradt (lakat + kondenzátor
  kisülés kell hozzá, karbantartói munka); a „change coil inside” állapot szerinti spirálcsere
  lett; a 6 havi hűtővízcsere nem tétel, hanem külön pipa + Áttekintés-kártya.
- **Tételváltoztatás: `FORM_VERSION` + 1 a kliensben ÉS a `lib/km-core.mjs`-ben**, a régi címek a
  `LEGACY_TITLES`-be. A szerver csak az aktuális változatot fogadja el (409 „Töltsd újra”), a lap
  eltárolja a `form_version`-t, a régi lapok a saját címeikkel jelennek meg, a CSV-ben az utolsó
  oszlopba kerülnek. Egy régebbi változatú piszkozatot a kliens eldob.

## Adatmodell és biztonság
- Egy lap = egy blob: `check/<uuid>` kulcs, JSON: `form_version`, `check_date`, `iso_year`/`iso_week`
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
