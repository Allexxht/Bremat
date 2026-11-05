# BREMAT – projektjegyzet (rövid)

A teljes háttér a `docs/jegyzet.md`-ben van, szakaszonként. Csak azt a szakaszt olvasd el,
amelyik részhez nyúlsz (Fájlok, Feladatok, Adatmodell, Munkanapló, Központ, Nyitó animáció,
Teendőim, Napi idősáv, Kinézet, Munkamódszer).

## Mi ez
- A BREMAT belső eszközei egy Netlify oldalon (`https://bremat-stuff.netlify.app`, saját
  Netlify fiók, Free keret: 300 kredit/hó, egy éles deploy 15 kredit):
  - `/` – **Központ** (`public/index.html`, `/api/kozpont`): kezdőlap, menü, Munkanapló és Valk sziget.
  - `/valk/` – heti karbantartási lap a Valk Welding / Panasonic TAWERS TM-2000WGH4 robothoz.
  - `/naplo/` – Alex munkanaplója (Teendőim állapot, napi idősáv). Szándékosan külön a Valk laptól.
- **Semmi köze az AndonWork-höz** (`Allexxht/astro-platform-starter`): nem osztunk meg vele
  kódot, táblát, Supabase-t, Netlify oldalt, és nem hivatkozunk rá.
- **Nincs Supabase, nincs új külső szolgáltatás kérés nélkül.** Az adatok a Netlify Blobs-ban:
  `km-checks` (heti lap), `naplo` (napló).
- A Teendőim (PowerShell asztali program) forrása nincs a repóban:
  `/mnt/project-files/teendoim/Teendoim.zip`.

## Fájlok
- `public/tasks.js` – a feladatok katalógusa (böngésző és szerver is ezt tölti).
- `public/valk/index.html`, `public/naplo/index.html`, `public/index.html` – egyfájlos felületek, vanilla JS, nincs build.
- `netlify/functions/{km,naplo,kozpont}.mjs` – vékony réteg; a logika a `lib/*-core.mjs`-ben (tárolófüggetlen, `memoryStore()` a tesztekhez).
- `tests/*.test.mjs` – `npm test` (a `package.json` sorolja fel a fájlokat).

## Szabályok, amiket ne szegj meg
- **Forrás minden állításnál** (Valk fejezet / napi pont, Panasonic R/V/P). Ami nem a
  kézikönyvből van, `nk` jelölést kap („Általános gyakorlat – nem a kézikönyvből”).
- **Ami a cellában nincs, az a lapon sem szerepel.**
- Feladatkör vagy ellenőrzési szabály változik → `FORM_VERSION` + 1 a `tasks.js`-ben.
  Csak szövegváltozásnál nem kell. Feladat **kulcsát ne nevezd át**.
- Az adatréteg két adapterből áll (`createApiAdapter()` éles, `createDemoAdapter()` `?demo`):
  új funkciót **mindkettőbe**.
- Beküldött lap nem módosítható; törlés előtt másolat (`deleted/`, napló: `d/`).
- Hozzáférési kód: `KM_ACCESS_CODE` (napló: `NAPLO_ACCESS_CODE`, ha van). Titkot ne írj a repóba – **a repó nyilvános**.

## Munkamódszer
- **Előbb terv, Alex jóváhagyja. A `main`-re soha nem pusholunk és nem merge-elünk**
  (2026. november 5. óta): külön ág + PR, a merge Alexé. Minden `main`-push éles deploy és keretet fogyaszt.
- Magyarul magyarázz, de a menü- és beállításneveket angolul írd.
- Módosítás után: `npm test`, majd demó módban (`/valk/?demo`, `/naplo/?demo`, `/?demo`)
  végigkattintani, telefon-szélességen is. A teljes lista: `docs/jegyzet.md` → Munkamódszer.
