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
- `public/tasks.js` – **a feladatok közös katalógusa**: a böngésző (`import` az
  index.html-ből) és a szerver (`lib/km-core.mjs`) is ezt tölti be, tiszta adat. Benne:
  `FORM_VERSION`, `LOCAL` (huzalátmérő, gáz irányérték, hűtőfolyadék, üzembe helyezés napja),
  `ROUTES` (A–E útvonal), `KINDS`, `WHO`, és a `TASKS` lista. Egy feladat mezői: `key`, `title`,
  `route`, `kind` (`look` = szemrevételezés, `do` = beavatkozás), `freq` (`{d}` vagy `{m}` +
  `label`), `who` (`karbantarto` / `szerviz`, üres = kezelő), `src`, `tools`, `steps`, `bad`,
  `more` és `figs` (a lenyitható „Bővebben” rész), `nk` (általános gyakorlat), `pending`
  (pontosítás alatt), `freqNote`, `extra: 'gas'`. A „Bővebben” szakaszok egy része a korábbi,
  ellenőrzött szövegből jön (`OLD` + `pick()`). Minden állítás mellett forrás (Valk fejezet /
  napi pont, Panasonic R/V/P); ami nem a kézikönyvből való, az `NK` jelölést kap („Általános
  gyakorlat – nem a kézikönyvből”). Ezt a szabályt tartsd meg: a felhasználó a gyártó
  előírását akarja, nem általános tanácsot.
- `public/index.html` – egyfájlos felület (vanilla JS, nincs build), a feladatokat a
  `tasks.js`-ből importálja. Elején a `CONFIG` (API, robotok, START_DATE). Adatréteg:
  `createApiAdapter()` (éles, `/api/km`) és `createDemoAdapter()` (`?demo`, localStorage)
  azonos interfésszel (`ping`, `list`, `get`, `submit`, `approve`) – új funkciót mindkettőbe.
- `public/img/*.jpg` – a kézikönyv-fotókból vágott, kiegyenesített ábrák (1200 px széles,
  JPEG 80). A zárt `<details>` miatt csak lenyitáskor töltődnek. Koppintásra nagyító ablak.
- `netlify/functions/km.mjs` – Netlify Function v2 (`/api/km`, csak POST). Vékony réteg:
  a Blobs tárolót (`km-checks`, `consistency: 'strong'`) adja át a `lib/km-core.mjs`-nek.
- `lib/km-core.mjs` – a teljes szerveroldali logika, tárolófüggetlen (`memoryStore()` a
  tesztekhez). Kódellenőrzés (sha256 + `timingSafeEqual`), `validateSubmit()` minden mezőre,
  ISO hét és „ma” Europe/Budapest szerint.
- `tests/km-core.test.mjs` – `npm test` (Node 22-ben a `node --test tests/` mappát nem fogad
  el, a fájlt kell megadni).

## A feladatok – 3. változat (2026. október 1.)
- A felhasználó által jóváhagyott lista. **Útvonal szerint** (hogy ne kelljen ide-oda
  szaladgálni): A = elöl, leállított robottal; B = hátul, leállított robottal; C = bekapcsolva
  hátul (ott van a bekapcsolás); D = bekapcsolva elöl; E = szerviz-emlékeztetők. Azon belül
  előbb a szemrevételezések, utána a beavatkozások.
- A cella: elöl a robot, a forgató jig (pozicionáló), a fénykapuk; hátul a robot sínje, a
  vízhűtés, a szűrők (vezérlő), a levegőegység, a gázpalack. Egy műszak, a vezérlő csak
  használatkor megy (kb. napi 4 óra) – ezért a Panasonic óraközeinél a naptár jön el előbb.
  1,0 mm-es huzal. Új gép (2026. szeptember), a garanciás szervizfeltételek nem ismertek.
- **Hetente 24 feladat**; a ritkábbak (kétheti, havi, 2 havi, negyedéves, féléves, éves,
  több éves) **csak akkor kerülnek a lapra, amikor esedékesek**: utolsó elvégzés (vagy, ha még
  nem volt, `LOCAL.COMMISSIONING_DATE`) + időköz, ha ez a lap hetének vasárnapjáig eljön.
  Lejárt = a hét hétfője előtt volt esedékes. Az Áttekintés „Ütemezés” fülén mind látszik.
- **Három állapot:** Rendben / Beavatkozás kellett / Nem csináltam meg. Az utóbbi kettőhöz
  kötelező megjegyzés (mit csinált / miért maradt el) – a szerver is ellenőrzi. Az elmaradt
  nem számít elvégzésnek: a ritkább feladat a következő lapon is ott marad; minden feladatnál
  „Legutóbb elmaradt” jelzés, az Áttekintésen „Elmaradt feladatok” panel.
- „Mit vigyél magaddal”: a lapon lévő feladatok `tools` mezőiből, egyszer.
- Kivéve: füstelszívás (nem férnek hozzá, a szűrő a Valk dolga – csak megjegyzés az éves
  szerviznél). A sín feladatai `nk` (nincs rá gyártói leírás, nincs adattábla, kenőpont).
- **Pontosítás alatt** (`pending`), amíg nincs fotó/adat: a huzaladagoló fedelének nyitása,
  a gas check helye a teach pendanton, a hűtővíz-csere lépései (SMC kézikönyv).
- Gáz: van gáztesztelőjük (kézi gázáramlás-mérő), hátul tartják – a hátsó körben veszik
  magukhoz, elöl a pisztolynál mérnek vele (gas check közben). Irányérték 10–12 l/min (EWM
  ökölszabály, 10–12 × huzalátmérő), `nk`, amíg nincs hegesztési utasítás szerinti érték.

## Korábbi változatok
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
- **Feladatváltoztatás: `FORM_VERSION` + 1 a `tasks.js`-ben** (a szerver is innen veszi).
  A szerver csak az aktuális változatot fogadja el (409 „Töltsd újra”). A 3. változattól a
  tételek kulccsal és címmel tárolódnak, így a régi lapok maguktól olvashatók; az 1–2.
  változatú lapok tételei sorszámmal (`no`) vannak, azok címei a `LEGACY_TITLES`-ben. A CSV-ben
  a régi lapok tételei az utolsó oszlopba kerülnek. Egy régebbi változatú piszkozatot a kliens
  eldob. Egy feladat kulcsát ne nevezd át (az esedékesség a kulcs szerinti előzményből jön).

## Adatmodell és biztonság
- Egy lap = egy blob: `check/<uuid>` kulcs, JSON: `form_version`, `check_date`, `iso_year`/`iso_week`
  (szerveren számolva), `robot`, `inspector`, `items` (3. változat: `key`, `title` – a szerver
  írja a katalógusból –, `status` = `ok`|`action`|`skip`, `note` – Rendben tételnél `null`),
  `action_count`, `skip_count`, `cooling_water_changed` (a lap dátuma, ha a „Hűtővíz cseréje”
  feladat megvolt, különben `null`), `gas_flow_lpm`, `remarks`, `parts_used`,
  `escalate`/`escalate_to`, `approved_by`/`approved_at`, `created_at`.
- A szerver ellenőrzi: minden heti feladat ott van, nincs ismeretlen vagy kétszer szereplő
  kulcs, a Beavatkozáshoz és az elmaradáshoz van megjegyzés. Hogy egy ritkább feladat épp
  esedékes-e, azt nem a szerver dönti el (a kliens teszi a lapra).
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
