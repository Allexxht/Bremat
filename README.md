# BREMAT – Valk robot heti karbantartási lap

Online heti ellenőrzőlap a Valk Welding / Panasonic TAWERS TM-2000 hegesztőrobothoz.
Minden hétfőn a gépkezelő tabletről vagy telefonról kitölti. A beküldött lapok
archiválódnak, hét szerint visszakereshetők, és látszik, ha egy hét kimaradt.

A BREMAT saját, önálló eszköze. **Nincs köze az AndonWork (munkakövetés) rendszerhez**:
külön repó, külön Netlify oldal, és a táblái (`km_` előtag) sem keverednek vele.

## Mit tud

- **Új heti lap:** a 16 tétel (Valk kézikönyv 6.6 + Panasonic kiegészítések), soronként
  *Rendben* / *Beavatkozás kellett* gomb. Beavatkozásnál kötelező beírni, mit csinált.
  Hűtővíz-csere jelölése, mért gázáramlás, megjegyzés, felhasznált alkatrész, továbbjelzés.
  Ha a tablet menet közben újratölt, a félig kitöltött lap megmarad az eszközön.
- **Áttekintés:** kitöltötték-e az aktuális hetet; mikor esedékes a hűtővíz-csere (6 havonta);
  nyitott továbbjelzések, kimaradt hetek.
- **Archívum:** hetenként minden lap, kimaradt hét pirossal. Keresés, év szerinti szűrés,
  CSV-letöltés (Excelben megnyitható).
- **Lap megtekintése:** teljes tartalom, nyomtatás / mentés PDF-be, műszakvezetői jóváhagyás.
- **Nem szerkeszthető:** beküldés után a lapot nem lehet módosítani vagy törölni.
  A jóváhagyás is csak egyszer írható be.

## Felépítés

| Fájl | Mi ez |
|---|---|
| `public/index.html` | Az egész alkalmazás egy fájlban (HTML + CSS + JS, nincs build lépés). Az elején van a `CONFIG`. |
| `db/setup.sql` | Adatbázis: táblák, jogosultságok, függvények. A Supabase SQL Editorban kell futtatni, többször is futtatható. |
| `netlify.toml` | Netlify beállítás: a `public/` mappát teszi ki, biztonsági fejlécekkel. |

Üres `SUPABASE_URL` / `SUPABASE_KEY` mellett az oldal **DEMÓ módban** fut: mintaadatokkal,
a böngészőben tárolva. Így élesítés előtt is ki lehet próbálni.

## Biztonság

- A böngésző a táblákat közvetlenül nem éri el (RLS be, policy nincs, jogosultság visszavonva).
- Minden olvasás és írás a `km_*` függvényeken megy át, és mindegyik ellenőrzi a
  **hozzáférési kódot**. Az adatbázis a kódnak csak a hash-ét tárolja.
- A kódot egyszer kell beírni az eszközön, utána megjegyzi. Kényelmesebb, ha a linkben küldöd
  (`https://…/?kod=A-KÓD`). Az oldal a kódot megnyitáskor elmenti és azonnal kiveszi a címsorból.
- Új kód, ha a régi illetéktelen kézbe került (a régi azonnal érvénytelen, minden eszközön újra be kell írni):
  `select public.km_new_code();` a Supabase SQL Editorban.

## Élesítés – egyszer kell megcsinálni

1. **Adatbázis.** Supabase → a BREMAT (Valk napló) projekt → **SQL Editor** → **New query** →
   a `db/setup.sql` teljes tartalma → **Run**. Futtatás előtt bal felül a projektválasztóban
   ellenőrizd, hogy a jó projekt van kiválasztva. Az eredményben megjelenik a **hozzáférési kód**:
   írd fel, csak most látszik.
2. **Kulcsok.** Supabase → **Project Settings** → **API**: a *Project URL* és a *publishable*
   (régi projekteknél *anon public*) kulcs kerüljön a `public/index.html` `CONFIG` részébe
   (`SUPABASE_URL`, `SUPABASE_KEY`). Ez a kulcs nyilvános, a böngészőbe szánt kulcs. A
   `service_role` / *secret* kulcsot **soha** ne tedd ide.
3. **Robot és kezdőnap.** Ugyanott a `CONFIG`-ban: `ROBOTS` (a robot / cella neve, több is lehet),
   `START_DATE` (az első hétfő, ettől számít kimaradtnak egy kitöltetlen hét).
4. **Netlify.** **Add new site** → **Import an existing project** → **GitHub** → ez a repó.
   A Build command üres, a Publish directory `public`: a `netlify.toml` ezt beállítja.
   Deploy után a **Site configuration** → **Change site name** alatt adhatsz neki beszédes nevet
   (pl. `bremat-karbantartas`).
5. **Tablet.** Nyisd meg a tableten egyszer a `https://<oldal>.netlify.app/?kod=A-KÓD` linket,
   majd Chrome menü → **Add to Home screen**, hogy ikonról induljon.

## Ha valami nem megy

- *„Hibás hozzáférési kód”*: a kódot közben lecserélték, vagy elírták. Kérd el az újat.
- *„Nincs kapcsolat a szerverrel”*: nincs internet. A kitöltött lap megmarad az eszközön,
  hálózat után a **Beküldés** újra megnyomható.
- Az adatok a Supabase **Table Editor** → `km_checks` táblában is láthatók és exportálhatók.
