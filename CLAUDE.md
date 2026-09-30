# BREMAT – Valk robot heti karbantartási lap – projektjegyzet

## Mi ez
A BREMAT saját, belső eszköze: online heti karbantartási ellenőrzőlap a Valk Welding /
Panasonic TAWERS TM-2000WGH4 hegesztőrobothoz. A gépkezelő minden hétfőn tabletről tölti ki,
a lapok archiválódnak és visszakereshetők.

**Teljesen külön van az AndonWork (munkakövetés) terméktől** – a felhasználó kifejezett kérése.
Semmilyen kódot, táblát, Supabase projektet vagy Netlify oldalt ne ossz meg vele, és ne
hivatkozz rá. Az AndonWork a `Allexxht/astro-platform-starter` repóban él, ahhoz ebből a
projektből nem nyúlunk.

## Fájlok
- `public/index.html` – egyfájlos app (vanilla JS, nincs build). Elején a `CONFIG` és az `ITEMS`
  (a 16 tétel). Adatréteg: `createSupabaseAdapter()` és `createDemoAdapter()` azonos
  interfésszel (`ping`, `list`, `get`, `submit`, `approve`) – új funkciót mindkettőbe.
- `db/setup.sql` – teljes séma, idempotens, a Supabase SQL Editorban fut.
- `netlify.toml` – publish: `public`, biztonsági fejlécek (`Referrer-Policy: no-referrer` a
  linkben érkező hozzáférési kód miatt).

## Adatmodell és biztonság
- `km_checks`: egy beküldött heti lap. `items` jsonb (16 elem: `no`, `status` = `ok`|`action`,
  `note`), `iso_year`/`iso_week` a szerveren számolva, `approved_by`/`approved_at` egyszer írható.
- `km_access`: egyetlen sor, a hozzáférési kód sha256 hash-e.
- Tábla közvetlenül nem érhető el (RLS, policy nélkül, `revoke all`). Minden a
  `km_ping` / `km_submit` / `km_list` / `km_get` / `km_approve` security definer függvényeken
  megy, mind ellenőrzi a kódot. `km_new_code()` csak SQL Editorból hívható.
- Beküldött lap nem módosítható és nem törölhető a felületről – ez szándékos (ellenőrzési napló).
- A szerver minden mezőt újraellenőriz (`km_submit`), a kliens ellenőrzése csak kényelmi.

## Munkamódszer
- A magyarázatok magyarul szóljanak, de a menü- és beállításneveket angolul írd
  (az eszközök angol felületűek).
- Módosítás után DEMÓ módban (üres Supabase kulcsok) végigkattintani: új lap üresen beküldve
  (hibák jelennek meg) → kitöltés beavatkozással → újratöltés (piszkozat megmarad) → beküldés →
  jóváhagyás → áttekintés (a hét kitöltve, hűtővíz-kártya frissült). Telefon-szélességen is.
- SQL-változás: a `db/setup.sql` maradjon többször futtatható, és próbáld ki `anon` szerepkörből.
