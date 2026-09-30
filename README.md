# BREMAT – Valk robot heti karbantartási lap

Online heti ellenőrzőlap a Valk Welding / Panasonic TAWERS TM-2000 hegesztőrobothoz.
Minden hétfőn a gépkezelő tabletről vagy telefonról kitölti. A beküldött lapok
archiválódnak, hét szerint visszakereshetők, és látszik, ha egy hét kimaradt.

A BREMAT saját, önálló eszköze. **Nincs köze az AndonWork (munkakövetés) rendszerhez**:
külön repó, külön Netlify oldal, és külső adatbázist sem használ. Az adatok ennek a
Netlify oldalnak a saját tárolójában (Netlify Blobs) vannak.

## Mit tud

- **Új heti lap:** 16 tétel abban a sorrendben, ahogy a cellánál haladni érdemes: előbb
  leállított cellánál (A), utána bekapcsolva (B). Minden tételnél ott van, mit kell csinálni,
  és mi a teendő, ha nincs rendben. Forrás: Valk kézikönyv 6.6 (heti) és 6.5 (napi), Panasonic
  robotkar- és vezérlőkézikönyv. Soronként *Rendben* / *Beavatkozás kellett* gomb;
  beavatkozásnál kötelező beírni, mit csinált. Minden tételnél lenyitható **Bővebben** rész:
  hol találod, hogyan csináld, mire figyelj – a kézikönyv ábráival (koppintásra nagyíthatók).
  Hűtővíz-csere jelölése, mért gázáramlás, megjegyzés, felhasznált alkatrész, továbbjelzés.
  Ha a tablet menet közben újratölt, a félig kitöltött lap megmarad az eszközön.
- **Áttekintés:** kitöltötték-e az aktuális hetet; mikor esedékes a hűtővíz-csere (6 havonta);
  nyitott továbbjelzések, kimaradt hetek.
- **Archívum:** hetenként minden lap, kimaradt hét pirossal. Keresés, év szerinti szűrés,
  CSV-letöltés (Excelben megnyitható, tételenként külön oszlopokkal).
- **Lap megtekintése:** teljes tartalom, nyomtatás / mentés PDF-be, műszakvezetői jóváhagyás.
- **Nem szerkeszthető:** beküldés után a lapot nem lehet módosítani vagy törölni.
  A jóváhagyás is csak egyszer írható be (két eszközről egyszerre sem).

## Felépítés

| Fájl | Mi ez |
|---|---|
| `public/index.html` | Az egész felület egy fájlban (HTML + CSS + JS, nincs build lépés). Az elején van a `CONFIG`. |
| `netlify/functions/km.mjs` | Netlify Function a `/api/km` címen: ez olvas és ír a tárolóba (Netlify Blobs, `km-checks`). |
| `public/img/` | A kézikönyvből vágott ábrák a Bővebben részekhez. |
| `lib/km-core.mjs` | A szerveroldali logika: kódellenőrzés, a beküldött lap teljes újraellenőrzése, jóváhagyás egyszer. Tárolófüggetlen, ezért tesztelhető. |
| `tests/km-core.test.mjs` | Egységtesztek: `npm test`. |
| `netlify.toml` | Netlify beállítás: a `public/` mappa, a function, biztonsági fejlécek. |

**DEMÓ mód:** a cím végére `?demo` (pl. `https://…/?demo`). Mintaadatokkal fut, a böngészőben
tárolva, az éles adatokhoz nem nyúl. Kipróbálásra és betanításra.

## Biztonság

- Minden olvasás és írás a `/api/km` functionön megy át, és mindegyik kérés ellenőrzi a
  **hozzáférési kódot**. A kód csak a Netlify környezeti változójában van (`KM_ACCESS_CODE`),
  a repóban soha.
- A kódot egyszer kell beírni az eszközön, utána megjegyzi. Kényelmesebb, ha a linkben küldöd
  (`https://…/?kod=A-KÓD`). Az oldal a kódot megnyitáskor elmenti és azonnal kiveszi a címsorból.
  Kis- és nagybetű, kötőjel nem számít.
- **Új kód**, ha a régi illetéktelen kézbe került: Netlify → **Site configuration** →
  **Environment variables** → `KM_ACCESS_CODE` átírása, majd **Deploys** → **Trigger deploy** →
  **Deploy site**. A régi kód ettől kezdve sehol nem működik, minden eszközön újra be kell írni.
- A szerver minden mezőt újraellenőriz; a böngészőben futó ellenőrzés csak kényelmi.

## Élesítés – egyszer kell megcsinálni

1. **Netlify oldal.** **Add new site** → **Import an existing project** → **GitHub** → ez a repó.
   A beállításokat a `netlify.toml` adja, a mezőket hagyd, ahogy vannak → **Deploy**.
   Utána **Site configuration** → **Change site name**: pl. `bremat-karbantartas`.
2. **Hozzáférési kód.** **Site configuration** → **Environment variables** → **Add a variable** →
   **Add a single variable**: Key `KM_ACCESS_CODE`, Value egy legalább 12 karakteres, véletlen kód
   (betűk és számok) → **Create variable**. Majd **Deploys** → **Trigger deploy** → **Deploy site**,
   mert a változót csak az új deploy látja.
3. **Tablet.** Nyisd meg a tableten egyszer a `https://<oldal>.netlify.app/?kod=A-KÓD` linket,
   majd Chrome menü (⋮) → **Add to Home screen**, hogy ikonról induljon.
4. **Robot, kezdőnap, helyi értékek** (ha kell): a `public/index.html` `CONFIG` részében
   `ROBOTS` (a robot / cella neve, több is lehet), `START_DATE` (az első hétfő, ettől számít
   kimaradtnak egy kitöltetlen hét), és ha megvannak: `GAS_FLOW_LPM` (előírt gázáramlás),
   `AIR_PRESSURE_BAR` (megszokott levegőnyomás), `COOLANT` (a hűtő folyadéka). Ezeket a lap
   kiírja a megfelelő tételnél.

## Ahol az adat van – fontos

- Az adatok **ennek a Netlify oldalnak** a tárolójában vannak (Netlify → a site → **Blobs**,
  `km-checks`). Új deploy, repó-módosítás nem érinti őket.
- **A Netlify oldalt ne töröld**, mert vele együtt a lapok is törlődnek. Átnevezni lehet.
- Mentés: az Archívum **CSV letöltés** gombja minden lapot, minden tétellel kiad. Érdemes
  negyedévente letölteni és elrakni.

## Ha valami nem megy

- *„Hibás hozzáférési kód”*: a kódot közben lecserélték, vagy elírták. Kérd el az újat.
- *„A szerveren nincs beállítva megfelelő hozzáférési kód”*: hiányzik vagy 12 karakternél
  rövidebb a `KM_ACCESS_CODE`, vagy beállítás után elmaradt az új deploy (2. pont).
- *„Nincs kapcsolat a szerverrel”*: nincs internet. A kitöltött lap megmarad az eszközön,
  hálózat után a **Beküldés** újra megnyomható.
