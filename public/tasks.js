/* ================================================================
   BREMAT – Valk robot karbantartási feladatok (közös katalógus)

   Ezt a fájlt a böngésző (public/index.html) ÉS a szerver
   (lib/km-core.mjs) is betölti – egy helyen vannak a feladatok.
   Tiszta adat, böngésző- és szerverfüggő kód nincs benne.

   Forrás: Valk kézikönyv (Operating instructions Robot installation,
   Bremat Holland BV) és a Panasonic kézikönyvek (R = robotkar,
   V = vezérlő, P = pozicionáló). Ami nem a kézikönyvből való, azt
   az NK jelölés mutatja („Általános gyakorlat”).

   Ha a feladatok változnak: FORM_VERSION + 1, és a régi címek a
   LEGACY_TITLES-be (régi lapok így is olvashatók maradnak).
   ================================================================ */

export const FORM_VERSION = 3;

// Helyi értékek. A gáz irányértéke általános gyakorlat (EWM: 10–12 × huzalátmérő
// l/min), amíg a hegesztési utasításból vagy a Valk-tól nincs pontos érték.
export const LOCAL = {
  WIRE_MM: '1,0',
  GAS_FLOW_TARGET: '10–12',      // l/min
  GAS_FLOW_IS_LOCAL_RULE: true,  // true = ökölszabály, nem előírt érték
  COOLANT: '',                   // a hűtő folyadéka (SMC kézikönyv / kanna szerint)
  COMMISSIONING_DATE: '2026-09-21', // üzembe helyezés: innen számol, ami még nem volt kész
};

// Útvonal: előbb elöl, aztán hátul, leállított robottal; utána bekapcsolva hátul, majd elöl.
export const ROUTES = {
  A: { title: 'A · Elöl, leállított robottal', intro: 'A robot szerelési helyzetben (pl. alaphelyzet), Teach mód, vészleállító benyomva.' },
  B: { title: 'B · Hátul, leállított robottal', intro: 'A robot továbbra is áll. Ahol a feladat kéri, főkapcsoló le.' },
  C: { title: 'C · Bekapcsolva – hátul', intro: 'Bekapcsolás: I/O vezérlő → szűrődoboz → robotvezérlő. Előtte nézd meg, hogy senki nincs a robot munkaterében.' },
  D: { title: 'D · Bekapcsolva – elöl', intro: 'A próbákat és a programokat Teach módban, a feladatnál leírt módon végezd.' },
  E: { title: 'E · Szerviz – emlékeztető', intro: 'Ezeket nem a kezelő végzi. Rendben = megtörtént vagy időpont egyeztetve.' },
};

export const KINDS = {
  look: { label: 'Szemrevételezés', hint: 'csak megnézed vagy kipróbálod' },
  do: { label: 'Beavatkozás', hint: 'tenned is kell valamit' },
};

export const WHO = { kezelo: '', karbantarto: 'Karbantartó végzi', szerviz: 'Szerviz végzi (Valk / Panasonic)' };
export const WHO_SHORT = { kezelo: 'Kezelő', karbantarto: 'Karbantartó', szerviz: 'Szerviz' };

// Gyakoriság: { d: napok } vagy { m: hónapok }.
const W1 = { d: 7, label: 'Heti' };
const W2 = { d: 14, label: 'Kétheti' };
const M1 = { m: 1, label: 'Havi' };
const M2 = { m: 2, label: '2 havi' };
const M3 = { m: 3, label: 'Negyedéves' };
const M6 = { m: 6, label: 'Féléves' };
const Y1 = { m: 12, label: 'Éves' };
const Y2 = { m: 24, label: '2 évente' };
const Y3 = { m: 36, label: '3 évente' };
const Y4 = { m: 48, label: '4 évente' };
const Y5 = { m: 60, label: '5 évente' };

export const NK = '<span class="nk">Általános gyakorlat – nem a kézikönyvből</span>';
const ol = (xs) => `<ol>${xs.map((x) => `<li>${x}</li>`).join('')}</ol>`;
const ul = (xs) => `<ul>${xs.map((x) => `<li>${x}</li>`).join('')}</ul>`;
const OLD = {
  area: {
    more: [
      ['Miért fontos', '<p>Ha huzalvég vagy alkatrész marad a pozicionálóban, a munkadarab rosszul fekszik be, és a robot nekimehet. A hulladékgyűjtők ürítése a kezelő saját feladata (Valk 6.4).</p>'],
      ['Vigyázz', '<p><b>Soha ne állj a pozicionálóban lévő munkadarab vagy a robot alá</b> – takarítás közben sem. A leeső munkadarab súlyos, akár halálos sérülést okozhat (Valk 5.2).</p>'],
      ['Hová a hulladék', '<p>A lecserélt szűrőket, hűtőfolyadékot, olajat, zsírt és kopott alkatrészeket elkülönítve kell gyűjteni, környezetkímélően (Valk 6.3, 8.1).</p>'],
    ],
    figs: [],
  },
  arm: {
    more: [
      ['A tengelyek neve', '<p>A robotkar (Panasonic TAWERS TM-2000) tengelyei a talptól a pisztoly felé: <b>RT</b> (talp), <b>UA</b> és <b>FA</b> (kar), <b>RW</b>, <b>BW</b>, <b>TW</b> (csukló). A kézikönyv ábrái és a hibaüzenetek is ezeket a neveket használják.</p>'],
      ['Hol keresd a zsírszivárgást', ul([
        '<b>UA tengely:</b> a túlnyomás-szelep (relief valve) és a sapka (cap) körül. Itt kevés zsír távozhat – ez normális, csak töröld le, utántölteni nem kell.',
        '<b>TW tengely:</b> a fogaskerék-fedél környéke (TW gear cover) és a TW kimenő tengely belseje.',
        '<b>RW tengely:</b> a tömítőlemez környéke (RW seal plate) és az RW üreges tengely belseje.',
      ]) + '<p class="small">Panasonic R 8.1.1. A kép felső sorában a jobb oldali fotó a mi robotunk típusa (TM-1800/TM-2000). A TW és RW ábráknál a kézikönyv nem írja ki a típust – a gépen érdemes megnézni, melyik egyezik.</p>'],
      ['Tisztítás', '<p><b>Sűrített levegő és víz tilos:</b> a fröccs, a por és a víz bejut a robotba, és kárt tesz benne (R 8.1.1).</p>'],
      ['Mikor hívj szervizt', '<p>Ha a letörölt zsír újra megjelenik, vagy laza részt találsz, aminek nem tudod az okát: Panasonic szerviz. A laza csavart meghúzhatod (R 8.1.1).</p>'],
    ],
    figs: [['grease-points.jpg', 'Zsírszivárgás ellenőrzési pontjai. Felül: UA tengely – sapka és túlnyomás-szelep, jobbra a TM-1800/TM-2000 típusé; középen: TW; alul: RW.', 'Panasonic R 8.1.1']],
  },
  torch: {
    more: [
      ['Részei', '<p>A pisztoly gyorscserélővel (quick exchange) ül az ütközésvédőn (safety holder). Kopóalkatrészei: áramátadó (current conductor), gázfúvóka, O-gyűrűk, gázcső. Ezek cseréje a kezelő feladata (Valk 6.4).</p>'],
      ['Áramátadó', '<p>A Valk heti listája szerint hetente cserélni kell. Csere után mindig húzd meg. A napi ellenőrzés szerint naponta legalább egyszer nézd meg, kopott-e, és tisztítsd kézzel a gázfúvókát és az áramátadót (Valk napi B5).</p>'],
      ['Hogyan működik az ütközésvédő', '<p>Levegővel működik. Ha a pisztoly nekimegy valaminek, a tömítése elenged, levegő áramlik ki, a vezérlő ezt érzékeli, és azonnal megállítja a robotot; a pisztoly elenged, hogy a robotfej ne sérüljön. Utána a robot elmozgatható, és az ütközésvédő egyszerűen visszatolható a helyére (Valk 3.1.2).</p>'],
      ['Ütközés után', '<p>Az ütközésvédő helyreállítását és a kalibráló programot a műszakban lévő kezelő maga elvégezheti (Valk 6.4). Utána futtasd az S11 programot (a „Pisztolyhelyzet (S11)” feladat): ha a pisztoly nem áll pontosan a referenciaponton, a robotot kalibrálni kell.</p>'],
      ['A pisztoly levétele (Valk 6.8)', ol([
        'Vidd a robotot olyan helyzetbe, ahol a pisztoly kényelmesen hozzáférhető.',
        'Kapcsold ki a hűtőt (kapcsoló a hűtő hátoldalán), és zárd el a sűrített levegőt (a levegőegység piros elzárója) – képek a „Sűrített levegő” és a „Hűtő: vízszint, szivárgás” feladatnál.',
        'Fordítsd el a fekete sapkát, és húzd le a kart: a pisztoly leválik.',
        'Vigyázz, hogy az O-gyűrűk ne essenek ki, és épek legyenek. Visszaszerelés előtt a pisztolyt és a gyorscserélőt mindig szárítsd meg (Valk 6.8, 6.10). Visszaszerelés fordított sorrendben.',
      ])],
      ['Hibás pisztoly', '<p>A Valk javítja és teszteli. A Valk azt javasolja, hogy mindig legyen tartalék pisztoly (Valk 6.8).</p>'],
    ],
    figs: [
      ['torch-unlock.jpg', 'A pisztoly levétele: a fekete sapka elfordítva, a kar lehúzva – a pisztoly leválik.', 'Valk 6.8'],
      ['shock-sensor.jpg', 'Az ütközésvédő (safety holder) a robotfejen.', 'Valk 3.1.2'],
    ],
  },
  hose: {
    more: [
      ['Mi ez', '<p>A kábelköteg (QE cable assembly) köti össze a pisztolyt a robottal; a robotfejen gyorscserélővel csatlakozik az ütközésvédőhöz (Valk 6.9). Cseréjekor hűtővíz-, levegő- és gázcsatlakozásokat kell bontani – lásd lent.</p>'],
      ['Mire nézz', ul([
        '<b>Nedvesség:</b> a hűtővíz-gyorscsatlakozóknál (kék és piros tömlő, lásd a képet) nincs csöpögés.',
        '<b>Megtörés:</b> a köteg sehol nem hajlik élesen.',
        '<b>Égés- vagy melegedésnyom:</b> elszíneződés, megolvadt burkolat – rossz áramcsatlakozásra utal, tűzveszély (Valk 6.5).',
      ])],
      ['Spirál (coil)', '<p>A Valk heti listájában „change coil inside” szerepel – a köteg belső spiráljának (huzalvezetőjének) cseréje. Ez a lap állapot szerint kérdez: ha a huzal akad, ugrál, vagy sok a forgács, cseréld. A spirálcsere pontos módját (hossz, típus) a kézikönyv nem írja le – ezt a Valk-tól kell megkérdezni.</p>'],
      ['Ha a köteget cserélni kell (Valk 6.9)', '<p>A kezelő maga cserélheti (Valk 6.4).</p>' + ol([
        'Vidd a robotot kényelmes szerelési helyzetbe.',
        'Tedd a robotrendszert feszültségmentessé, kapcsold ki a hűtőt, zárd el a sűrített levegőt.',
        'Ha a robot gázfúvókás vagy huzalos keresővel (touch sense) dolgozik, bontsd a piros csatlakozót.',
        'Bontsd a gyorscsatlakozókat: hűtővíz (2×), a pisztoly-gyorscserélő levegője (2×), a fúvató levegő; a huzalrögzítő (wire blocking) henger levegőjét csak lazítsd.',
        'Lazítsd a gáz gyorscsatlakozóját (GAS/AIR felirat, a kézikönyv képén a robotkaron, a huzaladagoló alatt – kép a „Gáz: szivárgás” feladatnál).',
        'Lazítsd a csatlakozó alján a nagy imbuszcsavart és a mérőkábelt.',
        'Vedd le a pisztolyt. Elöl lazítsd a 2 imbuszcsavart, és vedd le a félholdat. Nyisd ki a fekete sapkát a gyorscserélőn. A csatlakozó imbuszcsavarját fordítsd negyed fordulatot – a kézikönyv szerint <b>óramutató irányába lazít, ellene húz meg</b>. Ezután a köteg kézzel kivehető.',
        'A köteget egyenes védőhüvelyben küldd javításra a Valk-nak.',
      ])],
      ['Visszaszerelés', '<p>Fordított sorrendben. A légvezetékek a mélyedésbe kerüljenek, hogy a robot mozgása ne csíphesse be őket (Valk 6.9). A Valk javasolja, hogy mindig legyen tartalék köteg.</p>'],
    ],
    figs: [
      ['hose-couplings.jpg', 'Gyorscsatlakozók. Felül: hűtővíz (2×). Alul: téglalap – a pisztoly-gyorscserélő levegője (2×); bal kör – a huzalrögzítő (wire blocking) henger levegője (csak lazítani); jobb kör – fúvató levegő.', 'Valk 6.9'],
      ['hose-airlines.jpg', 'Visszaszereléskor a légvezetékek a mélyedésbe kerüljenek. Jobbra lent a félhold.', 'Valk 6.9'],
    ],
  },
  feeder: {
    more: [
      ['Mielőtt hozzányúlsz', '<p><b>Minden tápot kapcsolj le, az elosztószekrényt is</b> – bekapcsolt állapotban áramütés veszélye (Panasonic R 8.7).</p>'],
      ['Részei (a kép számai)', ul([
        '① nyomóanya · ② nyomókar',
        '③ görgőrögzítő csavar · ④ adagológörgő',
        '⑤ rozsdamentes cső (stainless tube) – itt megy be a huzal',
        '⑥ csavar · ⑦ huzalvezető lemez · ⑧ csavar · ⑨ központi cső (center tube)',
      ])],
      ['Hetente (R 8.7.1)', '<p>A rozsdamentes cső és a központi cső bemenete, valamint a görgők környéke legyen tiszta – a huzalforgácsot távolítsd el. A csövek illjenek a huzalátmérőhöz, és a furatuk legyen a görgőhorony közepén. Rossz cső vagy rossz igazítás: több forgács, eltömődő spirál, instabil ív.</p>'],
      ['Görgők – 2–3 havonta (R 8.7.1)', '<p>A görgő a huzalátmérőhöz illik, és a horonya nem kopott, nem repedt. Kopott vagy repedt görgőt cserélj.</p>'],
      ['Görgő és csövek cseréje (R 8.7.2)', ol([
        'Húzd magad felé a nyomóanyákat ①, hogy a nyomókarok ② kioldjanak, és emeld fel a nyomókarokat.',
        'Csavard ki a görgők rögzítőcsavarjait ③, és vedd le a görgőket ④.',
        'Húzd ki jobbra a rozsdamentes csövet ⑤, és tedd be a megfelelőt.',
        'Tedd fel a görgőket úgy, hogy a huzalátmérő jelölése elöl legyen.',
        'Csavard ki a csavarokat ⑥, vedd le a huzalvezető lemezt ⑦.',
        'Lazítsd meg a csavart ⑧, húzd ki a központi csövet ⑨, és tedd be a megfelelőt.',
        'Visszaszerelés fordított sorrendben.',
      ]) + '<div class="mini-wrap"><table class="mini"><thead><tr><th>Huzal (mm)</th><th>Görgő</th><th>Rozsdamentes cső</th><th>Központi cső</th></tr></thead><tbody><tr><td>0,9 / 1,2</td><td>MDR00051</td><td>MGT00004</td><td>MGW00012</td></tr><tr><td>1,0 / 1,2</td><td>MDR00053</td><td>MGT00004</td><td>MGW00012</td></tr><tr><td>1,2 / 1,4</td><td>MDR00055</td><td>MGT00011</td><td>MGW00010</td></tr></tbody></table></div>'],
      ['Szigetelt rögzítés', '<p>A huzaladagoló szigetelt rögzítését alaposan tisztán kell tartani: az itt kialakuló testzárlat károsíthatja a berendezést. Sűrített levegő és víz itt is tilos (R 8.1.1).</p>'],
      ['PFA', '<p>A PFA (Pneumatic Feed Assist) pneumatikus huzalelőtoló-segéd. Napi pontjai: nyomás, görgők tisztítása, olajszint. Kenőolaj: <b>WWPFAOIL</b> (Valk napi B3).</p>'],
      ['Nem heti, de ide tartozik', ul([
        'Évente: a csigahajtásra 5 g Alvania S2 zsír a GREASE INLET nyíláson (R 8.7.1).',
        'Huzalvágó programok: S60 / S61 / S62 – 17 / 22 / 26 mm kinyúlás (Valk 5.8).',
      ])],
    ],
    figs: [
      ['feeder-parts.jpg', 'A huzaladagoló részei – a számok a „Részei” listában.', 'Panasonic R 8.7.2'],
      ['feeder-insulation.jpg', 'A szigetelt rögzítés (szaggatott kör): itt ne maradjon por, fröccs.', 'Panasonic R 8.1.1'],
    ],
  },
  cleaner: {
    more: [
      ['Hogyan működik', '<p>A robot a pisztolyt a tisztító bejáratába viszi, egy pneumatikus henger rögzíti, a forgó kaparókések kitisztítják a gázfúvóka belsejét; amikor a kések visszaállnak, két fúvóka tapadásgátló szert fúj be. Utána a befogó elenged, és a robot kiviszi a pisztolyt (Valk 3.1.5).</p>'],
      ['Programok', '<p>S21 Mech Cleaning Tool 1 – tisztító program; S31 Outside cleaning tool1 – a pisztoly külső tisztítása (Valk 5.8). Hogy termékenként hányszor tisztít, azt a vezérlőben lehet beállítani (3.1.5).</p>'],
      ['Biztonság', '<p>Munka előtt olvasd el a Thielmann saját kézikönyvét. Védőeszköz (védőszemüveg) kötelező (Valk 6.7.2).</p>'],
      ['Hiba esetén', '<p>A tisztító hibáinál a Thielmann kézikönyve az irányadó (Valk 7.2).</p>'],
    ],
    figs: [['cleaner.jpg', 'A mechanikus pisztolytisztító a cellában.', 'Valk 3.1.5']],
  },
  jigs: {
    more: [
      ['Mire figyelj', '<p>Minden ciklus előtt: a munkadarab biztosan be van fogva, a szorítóerő és a pozíció megfelelő. A mechanikus részeket rendszeresen ellenőrizni kell kopásra, sérülésre, hibás működésre (Valk 5.2).</p>'],
      ['Napi pontok', '<p>Szorítás és pozicionáló lapok ellenőrzése – ha nem jó, karbantartás (Valk napi A4).</p>'],
      ['Vigyázz', '<p><b>Soha ne állj a pozicionálóban lévő munkadarab alá</b> (Valk 5.2).</p>'],
      ['Pozicionálók', '<p>A készülékek Panasonic Panadice pozicionálókon ülnek (Valk 3.1.3). A pozicionáló kézikönyve szerint a felhasználói készülékről a fröccsöt el kell távolítani, vagy a részt cserélni (Panasonic P 12.1).</p>'],
    ],
    figs: [],
  },
  controller: {
    more: [
      ['Főkapcsolók – melyik mit kapcsol', ul([
        '<b>I/O vezérlő</b> (szürke szekrény, Valk logóval): középen a fekete főkapcsoló. <b>Kikapcsolt (vízszintes) állásban is 230 V van a főkapcsoló alsó oldalán!</b> (Valk 4.1)',
        '<b>Robotvezérlő</b> (fekete Panasonic szekrény): a kézikönyv ábráján felül a robotvezérlő főkapcsolója, alul a szűrődoboz (filter box) főkapcsolója. A szűrődoboz főkapcsolója csak a robotvezérlőt választja le (Valk 4.1).',
      ])],
      ['Mielőtt hozzányúlsz', '<p>Főkapcsoló le, és várd meg, hogy a belső kondenzátorok kisüljenek és a meleg alkatrészek lehűljenek (Panasonic V 7). A vezérlőt belül ne nyisd ki – a belső tisztítás a karbantartás dolga, nem ennek a lapnak a része.</p>'],
      ['Légszűrő (Panasonic V 7.2)', '<p>A beépített hegesztő áramforrás oldalpaneljein a légbeszívó ventilátort szűrő fedi. Eltömődve rontja a hűtést és a robot teljesítményét, és „Temperature error” (W1210, W1220) jelenhet meg.</p>' + ol([
        'Lazítsd meg a szűrőtartó rögzítőcsavarját, nyisd ki a tartót, és vedd ki a szűrőt.',
        'Tisztítsd ki, vagy tegyél be újat; zárd be a tartót, és húzd meg a csavart.',
      ])],
      ['A ventilátorok nem indulnak azonnal', '<p>Bekapcsolás után kb. 25 mp múlva indulnak, 7 perc készenlét után leállnak. Készenlétben három ventilátor (FAN1, FAN2, FAN6) 50 perc állás / 10 perc forgás ciklusban megy; hegesztéskor mind elindul. Ez nem hiba (V 7.2).</p>'],
      ['Kábelek – tűzveszély', '<p>A laza vagy rossz csatlakozás tüzet okozhat. A hegesztő áramkábeleket, a kábelköteget, a pisztolycsatlakozást, a kábelcsatlakozókat és az áramcsatlakozókat rendszeresen ellenőrizni kell, sérülés esetén cserélni (Valk 6.5).</p>'],
    ],
    figs: [
      ['controller-filter.jpg', 'A vezérlő légszűrői az oldalpanelen: a szűrőtartó (filter metal) egy csavarral nyílik.', 'Panasonic V 7.2'],
      ['main-switches.jpg', 'A robotvezérlő főkapcsolói: felül a robotvezérlő, alul a szűrődoboz (filter box) főkapcsolója.', 'Valk 4.1'],
    ],
  },
  fence: {
    more: [
      ['Fénysorompók', '<p>Minden állomás elején optikai fénysorompó van. Ha valaki az állomás felszabadítása után áthalad rajta, doorstop történik, a hegesztés azonnal leáll (Valk 3.1.9, 4.2.2).</p>'],
      ['Ha az I/O vezérlő feszültségmentes volt', '<p>Minden állomáson meg kell szakítani a fénysorompót, és az adott állomás fehér gombjával resetelni (Valk 3.2.2).</p>'],
      ['Szervizajtó', '<p>A bal oldalon van. Mellette belül a BKS4 (vészleállító + fekete PRE-RESET SERVICE DOOR gomb), kívül a BKS5 (fehér RESET SERVICE DOOR gomb) – kép a „Biztonsági eszközök próbája” feladatnál. Üzem közben kinyitni tilos, csak Teach módban és karbantartáskor (Valk 3.2.1, 4.2.3).</p>'],
      ['Szabály', '<p>Sérült, hibás, áthidalt vagy némított biztonsági eszközzel a cellát üzemeltetni tilos. A kezelő felelős azért, hogy a biztonsági eszközök hibáit jelentse (Valk 4.2.3).</p>'],
      ['Fényvédelem', '<p>A Valk heti listája csak ennyit ír: a sérült hegesztési fényvédőt cserélni kell (6.6/14).</p>'],
    ],
    figs: [],
  },
  exhaust: {
    more: [
      ['A kézikönyvből', '<p>A Valk heti listája a füstelszívásnál ennyit ír: tisztítás, sérülések ellenőrzése (6.6/12). Minden továbbira az elszívó saját dokumentációja az irányadó.</p>'],
      ['Szűrők', '<p>A lecserélt szűrőket elkülönítve, környezetkímélően kell kezelni (Valk 6.3).</p>'],
    ],
    figs: [],
  },
  air: {
    more: [
      ['Hol van', '<p>A levegőegység (karbantartó egység): főelzáró, nyomásmérő, nyomásszabályzók. A képen pirossal bekarikázva a főelzáró – a pisztoly vagy a köteg levétele előtt ezt kell elzárni (Valk 6.8).</p>'],
      ['Elzárás karbantartáshoz', '<p>Karbantartás előtt a sűrített levegőt el kell zárni és visszanyitás ellen biztosítani, majd ellenőrizni, hogy a vezetékek légtelenítve vannak. Pneumatikus csövekhez van külön lezáró (lockout) eszköz – a kézikönyv példaként mutatja (Valk 6., 6.1).</p>'],
      ['Szivárgáskeresés', NK + '<p>Nyitott levegőnél hallgasd meg a csatlakozókat. Gyanús helyre fújj szappanos vizet vagy szivárgáskereső sprayt – ahol buborékol, ott szivárog.</p>'],
    ],
    figs: [['air-unit.jpg', 'A levegőegység. Pirossal bekarikázva a főelzáró.', 'Valk 6.8']],
  },
  cool: {
    more: [
      ['Mi ez, hol van', '<p>Valk VWK 7/1 kompresszoros vízhűtő, SMC gyártmány. A be/ki kapcsolója a hűtő hátoldalán van (Valk 3.1.4, 6.8).</p>'],
      ['Biztonság', '<p>Munka előtt olvasd el a hűtő saját (SMC) kézikönyvét. Védőeszköz kötelező (a kézikönyv jelzése: védőszemüveg); a hűtőfolyadék egészségre gyakorolt veszélye nagyon kicsi (Valk 6.7.1). Pisztoly- vagy kötegszerelés előtt a hűtőt ki kell kapcsolni (Valk 6.8, 6.9).</p>'],
      ['Utántöltés', `<p>Csak a hűtő saját folyadékával${LOCAL.COOLANT ? ` (${LOCAL.COOLANT})` : ''}. A Valk lista „water”-t ír; a pontos típus a hűtő SMC kézikönyvében vagy a kannán van.</p>` + NK + '<p>Különböző hűtőfolyadékokat ne keverj.</p>'],
      ['Rézszemcse', '<p>Vízhűtéses áramkábelnél (contact wire) nézd meg, van-e rézszemcse a hűtővízben a kábel szálaiból – főleg kötegcsere után, ha a kábel hibás volt (Valk 6.6/3).</p>'],
      ['Csere 6 havonta', '<p>A hűtővizet 6 havonta cserélni kell (Valk 6.6/3) – a lap a „Hűtővíz cseréje” feladatnál jelzi, mikor esedékes. A lecserélt folyadékot elkülönítve kell kezelni (Valk 6.3, 8.1).</p>'],
      ['Hiba esetén', '<p>A hűtő hibáinál az SMC kézikönyve az irányadó (Valk 7.2).</p>'],
    ],
    figs: [['cooler.jpg', 'A hűtő (balra) és a hátoldali be/ki kapcsoló (jobbra, bekarikázva).', 'Valk 6.8']],
  },
  robot: {
    more: [
      ['Bekapcsolás sorrendje (Valk 4.1, 5.1)', ol([
        'I/O vezérlő főkapcsoló függőleges (ON) állásba.',
        'Szűrődoboz főkapcsoló függőleges ON állásba.',
        'Robotvezérlő főkapcsoló függőleges ON állásba.',
        'A teach pendant kulcsos kapcsolóját fordítsd auto állásba; a robot kéri az üzemi mód megerősítését.',
        'Nyomd meg a kezelőpult fehér gombját: a biztonsági eszközök resetelnek, üzemi mód, szervók be. Folyamatos fény = minden jel aktív; villogás = nyomd meg újra.',
      ]) + '<p class="small">Indításkor ezen felül: a szervizajtót mindig ki kell nyitni, és a BKS4/BKS5 eljárással bezárni (Valk 3.2.1 – lásd a „Biztonsági eszközök próbája” feladatot); ha az I/O vezérlő feszültségmentes volt, minden állomáson meg kell szakítani a fénysorompót, és az állomás fehér gombjával resetelni (Valk 3.2.2).</p>'],
      ['Az I/O vezérlő jelzőlámpái', '<p>1 vészleállítás · 2 doorstop · 3 üzemi mód · 4 szervó be (Valk 3.2.3).</p>'],
      ['Hibaüzenet', ul([
        'Írd fel a hibakódot, az alkódot (sub code) és a teljes szöveget (Valk 7.1).',
        'Képernyőkép a teach pendantról: R-Shift + Window change (alapbeállítás). Alapból a belső memóriába ment – legfeljebb 5 képet, és kikapcsoláskor törlődnek. USB-re vagy SD-kártyára: SET → Advanced settings → File storage location (kikapcsoláskor visszaáll alapra). Riasztás közben a funkció nem mindig érhető el – akkor fotózd le a kijelzőt (Panasonic V 17.2).',
        'Hiba esetén belépés előtt a robotot mindig Teach módba kell kapcsolni (Valk 7).',
        'A hibák jelentése: Panasonic OM1009082E kézikönyv, 16. fejezet (Valk 7.1).',
      ])],
      ['Origó-jelölések (Panasonic R 8.2)', '<p>Alaphelyzetbe állás után a jelöléseknek egybe kell esniük az RT, UA, FA, RW, BW és TW tengelyen. Közel csak benyomott vészleállítóval, kikapcsolt szervóval menj. Ha nem esnek egybe: Panasonic. Normál üzemben az origó-beállító tüskék a TW kivételével teljesen behúzva, a TW tüske kivéve (R 8.5).</p>'],
      ['Akku', '<p>„E8000 Encoder battery is consumed” üzenet: a robotkar akkuját cserélni kell – Panasonic szerviz (R 8.4).</p>'],
      ['Kit hívj', '<p>Valk szerviz: <b>0031 78-7503811</b>, hétfőtől szombatig 7:00–23:00 (Valk 7).</p>'],
    ],
    figs: [
      ['match-marks.jpg', 'Origó-jelölések a TM-1800/TM-2000 tengelyein (szaggatott körrel jelölve).', 'Panasonic R 8.2.2'],
      ['io-controller.jpg', 'Az I/O vezérlő: középen a fekete főkapcsoló, felette a 4 jelzőlámpa.', 'Valk 4.1'],
    ],
  },
  safety: {
    more: [
      ['Vészleállítók', '<p>Van a kezelőpulton, a teach pendanton, minden állomás safety console-ján és a szervizajtó melletti BKS4-en. <b>Nem ideiglenes megállításra való</b> – arra a piros STOP (hold) gomb szolgál (Valk 4.2.1, 5.4).</p>'],
      ['Újraindítás vészleállítás után (Valk 5.7)', ol([
        'Gondold végig, miért nyomták meg a vészleállítót, és jelentsd.',
        'Oldd ki kézzel a vészleállítót – csak ha szabad.',
        'Nyugtázd az üzenetet: OK a teach pendanton (Enter).',
        'Győződj meg róla, hogy senki nincs az állomásban.',
        'Nyomd meg a kezelőpult fehér reset gombját; ha a rendszer újra aktív, a lámpa folyamatosan világít.',
        'Győződj meg róla, hogy az újraindítás biztonságos, és nyomd meg a zöld gombot.',
      ])],
      ['Újraindítás doorstop után (Valk 5.6)', ol([
        'Gondold végig, miért történt a doorstop.',
        'Nyugtázd az üzenetet: OK a teach pendanton (Enter).',
        'Ellenőrizd, hogy a szervizajtó zárva van, és hagyd el az állomást.',
        'Győződj meg róla, hogy senki nincs az állomásban.',
        'Nyomd meg a kezelőpult fehér reset gombját; ha a rendszer újra aktív, a lámpa folyamatosan világít.',
        'Győződj meg róla, hogy az újraindítás biztonságos, és nyomd meg a zöld gombot.',
      ])],
      ['Szervizajtó zárása (Valk 3.2.1)', ol([
        'Zárás előtt nyomd meg belül a BKS4 fekete PRE-RESET SERVICE DOOR gombját.',
        'Menj ki, és zárd be a szervizajtót.',
        '10 másodpercen belül nyomd meg kívül a BKS5 fehér, világító RESET SERVICE DOOR gombját.',
      ]) + '<p class="small">A cella indításakor a szervizajtót mindig először ki kell nyitni, és ezzel az eljárással bezárni.</p>'],
      ['Állomás resetelése (Valk 3.2.1, 5.3)', '<p>Nyomd meg az állomásban lógó safety console fekete PRE-RESET gombját, hagyd el az állomást, és 10 mp-en belül nyomd meg a kezelőpult fehér reset gombját. Ha letelik a 10 mp, vagy valaki a fekete gomb nélkül próbál resetelni, a biztonsági funkciók nem állnak vissza. Ez azt hivatott megakadályozni, hogy resetkor valaki bent legyen – <b>reset előtt mindig győződj meg róla, hogy senki nincs az állomásban.</b></p>'],
    ],
    figs: [
      ['service-door-buttons.jpg', 'A szervizajtónál: BKS4 belül (vészleállító + fekete PRE-RESET SERVICE DOOR), BKS5 kívül (fehér RESET SERVICE DOOR).', 'Valk 3.2.1'],
      ['safety-console.jpg', 'Safety console minden állomásban: vészleállító és fekete PRE-RESET gomb.', 'Valk 3.2.1'],
    ],
  },
  ref: {
    more: [
      ['Mire való', '<p>Az S11 Reference Tool 1 program a pisztoly helyzetét ellenőrzi a kalibráló jig referenciapontján (Valk 5.8). Ez napi pont is: ha a pozíció nem jó, a robotot kalibrálni kell – szólj a felelősnek (a kézikönyvben: „call operator”, Valk napi B7).</p>'],
      ['Automatikus ellenőrzés (ATC)', '<p>Az S25 ATC Tool 1 csak automata módban fut. A huzalvég vagy a gázfúvóka alapján számolja a pisztoly eltérését, és határérték felett megállítja a robotot (Valk 3.1.7, 5.8).</p>'],
      ['Kalibrálás (PPS)', '<p>A PPS (Program Protection System) tengelyenként ellenőrzi, és ha kell, javítja a robot nullpontját – például ütközés után (Valk 3.1.8).</p>' + ul([
        'S05 Calibration robot – gyors kalibrálás, kalibráló tüskével.',
        'Auto PPS: S01 Home to pin Position – a robot a megfelelő helyzetbe az auto PPS előtt; S99 Pin Position – a robot a tüskepozíciókba; S02 Pin to Home Position – vissza alaphelyzetbe az auto PPS után.',
        'TW tengely: S03 kalibrálás, S04 vissza alaphelyzetbe.',
      ]) + '<p class="small">A részletes eljárás a külön „Manual Calibration TL-TM robots and external axes” kézikönyvben van (Valk 6.4.1).</p>'],
      ['Huzalkinyúlás', NK + '<p>Ha a huzalvéggel ellenőrzöl, előtte vágd a huzalt mindig ugyanakkora kinyúlásra: S60 / S61 / S62 – 17 / 22 / 26 mm (Valk 5.8).</p>'],
    ],
    figs: [],
  },
  gas: {
    more: [
      ['Hol van', '<p>A gáz gyorscsatlakozója a kézikönyv képe szerint a robotkaron, a huzaladagoló alatt van (GAS/AIR felirat) – lásd a képet (Valk 6.9).</p>'],
      ['Előírt érték', '<p>A kézikönyv nem adja meg.</p>'],
      ['Mérés', NK + '<p>Tedd a mérőcsövet (gázáramlás-mérőt) a gázfúvókára, engedd a gázt a teach pendant gázellenőrző (gas check) funkciójával, és olvasd le az értéket. Írd be a lap alján.</p>'],
      ['Ha kevesebb a mért érték', NK + '<p>Ha jóval kevesebb a beállítottnál, valahol szivárog vagy eltömődött az út: gázcső a pisztolyban, O-gyűrű, tömlő, csatlakozás. Szivárgáskeresés szappanos vízzel vagy sprayjel – ahol buborékol, ott szivárog.</p>'],
    ],
    figs: [['gas-coupling.jpg', 'Felül: a huzaladagoló a robotkaron, bekarikázva a gázcsatlakozás. Alul: a GAS/AIR feliratú gyorscsatlakozó közelről.', 'Valk 6.9']],
  },
};

// A korábbi (ellenőrzött) részletekből a megadott címsorú szakaszok.
const pick = (key, ...heads) => heads.map((h) => {
  const s = OLD[key].more.find(([t]) => t === h);
  if (!s) throw new Error(`Hiányzó szakasz: ${key} / ${h}`);
  return s;
});
const fig = (key, file) => {
  const f = OLD[key].figs.find(([n]) => n === file);
  if (!f) throw new Error(`Hiányzó kép: ${key} / ${file}`);
  return f;
};

/* ================================================================
   A feladatok. Sorrend = útvonal (A, B, C, D, E), azon belül előbb a
   szemrevételezések (look), aztán a beavatkozások (do).
   Mezők: key, title, route, kind, freq, who, src, tools, steps, bad,
   more, figs, nk (általános gyakorlat), pending (pontosítás alatt),
   extra ('gas' = gázáramlás mező).
   ================================================================ */
export const TASKS = [
  // ---------------- A · Elöl, leállított robottal – szemrevételezés
  { key: 'kar-nez', title: 'Robotkar', route: 'A', kind: 'look', freq: W1,
    src: 'Panasonic R 8.1.1 (naponta) · Valk 6.6/1', tools: ['zseblámpa'],
    steps: ['Nézd végig a tengelyeket: szivárgott-e ki zsír. Az UA tengely túlnyomás-szelepénél kevés zsír normális.',
      'A kábelek körüli gumilapok nem repedtek.',
      'Nincs laza csavar vagy rész.'],
    bad: 'A kifolyt zsírt a „Robotkar letörlése” feladatnál töröld le. Ha a szivárgás visszatér, repedt a gumilap, vagy laza rész van, aminek nem tudod az okát: jelezd (Panasonic szerviz).',
    more: pick('arm', 'A tengelyek neve', 'Hol keresd a zsírszivárgást', 'Mikor hívj szervizt'),
    figs: [fig('arm', 'grease-points.jpg')] },
  { key: 'pisztoly-nez', title: 'Pisztoly, ütközésvédő, kábelköteg', route: 'A', kind: 'look', freq: W1,
    src: 'Valk 6.6/1, 6.6/4, 6.6/5 · napi B4–B5', tools: ['zseblámpa'],
    steps: ['Az O-gyűrűk épek (nem repedtek, nem laposak), a gázcső ép és nincs eltömődve.',
      'A pisztolyon nincs égés- vagy melegedésnyom.',
      'Az ütközésvédő (safety holder) ép, a pisztoly szilárdan, lötyögés nélkül ül benne, a levegőcsatlakozása ép.',
      'A kábelköteg száraz (a hűtővíz-csatlakozásoknál nem csöpög), nincs élesen megtörve, nincs rajta égésnyom.',
      'A huzal egyenletesen, akadás nélkül fut a spirálban (coil).'],
    bad: 'Kopott vagy sérült alkatrész: csere. Lötyögő vagy sérült ütközésvédővel ne indítsd a robotot – jelezd. Nedves, megtört vagy égett köteg: csere, a hibás köteg javításra a Valk-hoz megy. Ha a huzal akad vagy ugrál: spirálcsere.',
    more: [...pick('torch', 'Részei', 'Hogyan működik az ütközésvédő', 'Ütközés után', 'A pisztoly levétele (Valk 6.8)', 'Hibás pisztoly'),
      ...pick('hose', 'Mi ez', 'Spirál (coil)', 'Ha a köteget cserélni kell (Valk 6.9)', 'Visszaszerelés')],
    figs: [fig('torch', 'shock-sensor.jpg'), fig('torch', 'torch-unlock.jpg'), fig('hose', 'hose-couplings.jpg'), fig('hose', 'hose-airlines.jpg')] },
  { key: 'kabelek-nez', title: 'Földkábel és hegesztőkábelek', route: 'A', kind: 'look', freq: W1,
    src: 'Panasonic V 7.2 (naponta) · Valk 6.5, napi A2', tools: ['zseblámpa'],
    steps: ['A földkábel és a hegesztő áramkábelek csatlakozása szoros, nem lötyög.',
      'Nincs rajtuk sérülés, égés- vagy melegedésnyom.'],
    bad: 'Laza csatlakozást húzz meg (Beavatkozás kellett). Égett vagy sérült kábel: karbantartás – tűzveszély.',
    more: pick('controller', 'Kábelek – tűzveszély'), figs: [] },
  { key: 'jig-nez', title: 'Forgató jig és készülékek', route: 'A', kind: 'look', freq: W1,
    src: 'Valk 6.6/11 · napi A4', tools: ['zseblámpa'],
    steps: ['Minden szorító rendesen zár és tart.',
      'Nincs laza, törött vagy hiányzó elem; a pozicionáló lapok épek.'],
    bad: 'Amit nem tudsz megjavítani, jelezd a karbantartásnak – rosszul befogott munkadarabbal nem szabad hegeszteni.',
    more: pick('jigs', 'Mire figyelj', 'Napi pontok', 'Vigyázz'), figs: [] },
  { key: 'vedelem-nez', title: 'Fénykapuk, kerítés, fényvédő függöny', route: 'A', kind: 'look', freq: W1,
    src: 'Valk 6.6/8–10, 6.6/14 · napi A3', tools: [],
    steps: ['A fénykapuk szilárdan rögzítve vannak, nincsenek elmozdulva vagy sérülve.',
      'A kerítéselemek és a szervizajtó épek, stabilak, nincs rés.',
      'A hegesztési fényvédő függöny vagy lemez ép: nincs rajta szakadás, égett lyuk, rés.'],
    bad: 'Sérült fényvédő: csere. Sérült kerítés, ajtó vagy fénykapu: karbantartás. Hibás biztonsági eszközzel a cellát használni tilos.',
    more: pick('fence', 'Fénysorompók', 'Ha az I/O vezérlő feszültségmentes volt', 'Szervizajtó', 'Szabály', 'Fényvédelem'), figs: [] },
  { key: 'tisztito-nez', title: 'Pisztolytisztító: kés és folyadék', route: 'A', kind: 'look', freq: W1,
    src: 'Valk 6.6/15 · napi B8', tools: ['zseblámpa'],
    steps: ['A kaparókés ép, nem kopott.', 'Van elég fröccsgátló folyadék.'],
    bad: 'Kopott kés vagy kevés folyadék: a „Pisztolytisztító kitakarítása” feladatnál cseréld, töltsd utána, és ott jelöld Beavatkozásként.',
    more: pick('cleaner', 'Hogyan működik', 'Biztonság'), figs: [fig('cleaner', 'cleaner.jpg')] },
  { key: 'gorgo', title: 'Huzaladagoló görgői', route: 'A', kind: 'look', freq: M2,
    src: 'Panasonic R 8.7.1 (2–3 havonta)', tools: ['zseblámpa', 'tartalék görgő MDR00053 (ha kopott)'],
    pending: 'A huzaladagoló fedelének nyitása és a görgők elérése a fotók alapján kerül ide.',
    steps: ['Mielőtt hozzányúlsz: minden tápot kapcsolj le, az elosztószekrényt is.',
      `A görgők a ${LOCAL.WIRE_MM} mm-es huzalhoz valók – a görgőn a huzalátmérő jelölése elöl látszik.`,
      'A görgők hornya nem kopott, nem repedt.'],
    bad: `Kopott vagy repedt görgő: csere (${LOCAL.WIRE_MM} mm-es huzalhoz: MDR00053) – a lépések a „Bővebben” részben. Jelöld Beavatkozásként.`,
    more: pick('feeder', 'Mielőtt hozzányúlsz', 'Részei (a kép számai)', 'Görgők – 2–3 havonta (R 8.7.1)', 'Görgő és csövek cseréje (R 8.7.2)'),
    figs: [fig('feeder', 'feeder-parts.jpg')] },

  // ---------------- A · Elöl, leállított robottal – beavatkozás
  { key: 'terulet', title: 'Munkaterület és szerszámok', route: 'A', kind: 'do', freq: W1,
    src: 'Valk 6.6/7 · napi A5–A6', tools: ['seprű és lapát', 'ipari porszívó', 'kesztyű'],
    steps: ['Szedd össze a huzalvégeket, a fröccsöt és a leesett alkatrészeket az állomásokból és a robot körül.',
      'Ürítsd ki a hulladékgyűjtőket.',
      'A szerszámok tiszták, épek, és a helyükön vannak.'],
    bad: 'Hiányzó vagy sérült szerszám: pótold, vagy írd be.',
    more: pick('area', 'Miért fontos', 'Vigyázz', 'Hová a hulladék'), figs: [] },
  { key: 'kar-tisztit', title: 'Robotkar letörlése', route: 'A', kind: 'do', freq: W1,
    src: 'Valk 6.6/1 · Panasonic R 8.1.1', tools: ['tiszta rongy'],
    steps: ['Töröld le a port és a fröccsöt ronggyal. <b>Sűrített levegő és víz tilos</b> – bejut a robotba.',
      'A kifolyt zsírt töröld le.'],
    bad: 'Ha a letörölt zsír a következő héten megint ott van: jelezd (Panasonic szerviz).',
    more: pick('arm', 'Tisztítás'), figs: [] },
  { key: 'aramatado', title: 'Áramátadó csere, gázfúvóka tisztítása', route: 'A', kind: 'do', freq: W1,
    src: 'Valk 6.6/5 · napi B5', tools: ['tartalék áramátadó (current conductor)', 'gázfúvóka-tisztító kaparó', 'tartalék gázfúvóka és O-gyűrű (ha kell)'],
    steps: ['Cseréld ki az áramátadót – a Valk szerint hetente, akkor is, ha még jónak látszik. Csere után húzd meg.',
      'Tisztítsd ki a gázfúvókát; ha deformált, vagy nem jön le róla a fröccs, cseréld.'],
    bad: 'Ha a gázfúvókát vagy O-gyűrűt is cserélni kellett: Beavatkozás kellett, és írd be.',
    more: pick('torch', 'Részei', 'Áramátadó'), figs: [] },
  { key: 'adagolo', title: 'Huzaladagoló: forgács, PFA-olaj', route: 'A', kind: 'do', freq: W1,
    src: 'Panasonic R 8.7.1 (hetente) · Valk napi B3', tools: ['ecset', 'ipari porszívó', 'WWPFAOIL kenőolaj'],
    pending: 'A huzaladagoló fedelének nyitása a fotók alapján kerül ide.',
    steps: ['Mielőtt hozzányúlsz: minden tápot kapcsolj le, az elosztószekrényt is.',
      'Szedd ki a huzalforgácsot a görgők környékéről, a rozsdamentes cső és a központi cső bemenetéből – ecsettel vagy porszívóval, <b>sűrített levegő tilos</b>.',
      'PFA: van elég olaj – ha kevés, töltsd utána (WWPFAOIL).'],
    bad: 'Ha a forgács feltűnően sok: rossz görgő vagy cső a huzalhoz, vagy rossz az igazítás – jelezd.',
    more: pick('feeder', 'Mielőtt hozzányúlsz', 'Részei (a kép számai)', 'Hetente (R 8.7.1)', 'Szigetelt rögzítés', 'PFA'),
    figs: [fig('feeder', 'feeder-parts.jpg'), fig('feeder', 'feeder-insulation.jpg')] },
  { key: 'tisztito', title: 'Pisztolytisztító kitakarítása', route: 'A', kind: 'do', freq: W1,
    src: 'Valk 6.6/15 · napi B8', tools: ['ecset', 'védőszemüveg', 'fröccsgátló folyadék (ha kell)', 'tartalék kaparókés (ha kell)'],
    steps: ['Védőszemüvegben takarítsd ki a forgácsot és a fröccsöt a tisztítóból.',
      'Ha a kés kopott vagy kevés a folyadék (lásd a szemrevételezésnél): cseréld, töltsd utána.'],
    bad: 'Ha a tisztító nem működik rendesen: a Thielmann kézikönyve az irányadó – jelezd.',
    more: pick('cleaner', 'Programok', 'Biztonság', 'Hiba esetén'), figs: [] },
  { key: 'jig-tisztit', title: 'Jigek fröccstelenítése', route: 'A', kind: 'do', freq: W1,
    src: 'Valk 6.6/11', tools: ['drótkefe', 'kaparó (a fröccshöz)'],
    steps: ['Szedd le a fröccsöt a befogókról, az ütközőkről és a pozicionáló lapokról.'],
    bad: 'Ha sérülést találsz: jelezd a karbantartásnak.',
    more: pick('jigs', 'Vigyázz', 'Pozicionálók'), figs: [] },
  { key: 'fenykapu-tisztit', title: 'Fénykapuk tisztítása', route: 'A', kind: 'do', freq: W1,
    src: 'Valk 6.6/8', tools: ['tiszta rongy'],
    steps: ['Töröld tisztára a fénykapuk tükreit és lencséit.'],
    bad: 'Ha sérült vagy elmozdult: karbantartás.',
    more: pick('fence', 'Fénysorompók', 'Szabály'), figs: [] },
  { key: 'kerites', title: 'Kerítés letörlése', route: 'A', kind: 'do', freq: M1,
    src: 'Valk 6.6/9', freqNote: 'A Valk hetente írja; a sérülést hetente nézed a „Fénykapuk, kerítés, fényvédő függöny” feladatnál.',
    tools: ['tiszta rongy'],
    steps: ['Töröld le a kerítéselemeket és a szervizajtót.'],
    bad: 'Sérülést találsz: karbantartás.', more: [], figs: [] },
  { key: 'kar-500', title: 'Panasonic 500 órás ellenőrzés', route: 'A', kind: 'do', freq: M3, who: 'karbantarto',
    src: 'Panasonic R 8.3, V 7.3, P 12.2', tools: ['csavarkulcs-készlet', 'csavarhúzó'],
    steps: ['Robot: rögzítőcsavarok és fedélcsavarok ellenőrzése, ha kell, utánhúzás; az összekötő kábelek csatlakozói (tapintással).',
      'Huzaladagoló: adagológörgő, adagoló- és hajtófogaskerék – a horony és a fogak kopása, deformációja; jelentős sérülésnél csere.',
      'Vezérlő (hátul): fedélcsavarok, kábelcsatlakozók; kopóalkatrészek (mágneskapcsolók, hűtőventilátorok) – csere, ha kell.',
      'Forgató jig: rögzítő- és fedélcsavarok; az asztalt kézzel forgatva nincs-e lazaság.'],
    bad: 'Ha az ok nem világos: Panasonic szerviz.',
    more: [['Időköz', '<p>A Panasonic 500 óránként vagy 3 havonta írja, amelyik előbb eljön. Az üzemóra a vezérlő bekapcsolt ideje (R 8., V 7.1). Nálatok a vezérlő csak használatkor megy (kb. napi 4 óra), így a 3 hónap jön el előbb.</p>']],
    figs: [] },
  { key: 'zsirzas', title: 'Huzaladagoló zsírzása és csavarnyomatékai', route: 'A', kind: 'do', freq: Y1, who: 'karbantarto',
    src: 'Panasonic R 8.6, 8.7.1', tools: ['Alvania S2 zsír', 'nyomatékkulcs', 'védőszemüveg', 'vastag kesztyű'],
    steps: ['A csigahajtásra (worm gear, worm wheel) 5 g Alvania S2 zsír a GREASE INLET nyíláson.',
      'A huzaladagoló csavarjainak nyomatéka: M8×15 (1 db, a másik oldalon is) – 23 N·m; M5×55 (3 db) – 5,5 N·m; M6×15 (4 + 4 db) – 7,3 N·m.'],
    bad: 'Rosszul meghúzott csavarnál a huzaladagoló leeshet, vagy a hegesztőkábel csatlakozása túlmelegedhet, kigyulladhat (R 8.6).',
    more: [['Zsírzáskor', '<p>Használat előtt olvasd el a zsír saját leírását. Védőszemüveg és vastag kesztyű kötelező; ha szembe vagy szájba kerül, azonnal öblítsd ki vízzel, és menj orvoshoz (R 8.3).</p>']],
    figs: [] },

  // ---------------- B · Hátul, leállított robottal – szemrevételezés
  { key: 'sin-nez', title: 'Robot sínje', route: 'B', kind: 'look', freq: W1, nk: true,
    src: 'Általános gyakorlat – a kapott kézikönyvek nem írnak a sínről', tools: ['zseblámpa'],
    steps: ['Nézd végig a sínt: nincs-e rajta fröccs, huzaldarab, csavar vagy más idegen tárgy, ami a robot útjába kerülhet.',
      'A sínen és a végeinél nincs látható sérülés, deformáció.',
      'A robothoz menő kábelek és tömlők vezetése rendben van: nem lógnak a sín útjába, nincsenek becsípődve, kidörzsölve.'],
    bad: 'Idegen tárgyat távolíts el (csak álló robotnál). Sérülés, deformáció, becsípődött kábel: ne indítsd a robotot, jelezd a Valk-nak – a sín beállítása, kenése, javítása az ő dolguk.',
    more: [['Honnan van ez', NK + '<p>A sínre nincs gyártói leírás nálunk, és a sínen nincs adattábla vagy kenőpont. Ha a Valk ad hozzá előírást, az felülírja ezt.</p>']],
    figs: [] },
  { key: 'huto-nez', title: 'Hűtő: vízszint, szivárgás', route: 'B', kind: 'look', freq: W1,
    src: 'Valk 6.6/3 · napi B6', tools: ['zseblámpa', 'hűtőfolyadék (a hűtő sajátja)'],
    steps: ['A vízszint a jelölésig ér.', 'Nincs szivárgás a hűtőn, a tömlőkön és a csatlakozásoknál.'],
    bad: 'Kevés víz: töltsd utána – csak a hűtő saját folyadékával (Beavatkozás kellett). Szivárgás: karbantartás.',
    more: pick('cool', 'Mi ez, hol van', 'Biztonság', 'Utántöltés', 'Hiba esetén'), figs: [fig('cool', 'cooler.jpg')] },
  { key: 'szuro-nez', title: 'Vezérlő légszűrői', route: 'B', kind: 'look', freq: W1,
    src: 'Panasonic V 7.2 (naponta)', tools: ['zseblámpa'],
    steps: ['Nézd meg a vezérlő oldalpaneljein lévő légszűrőket: nincsenek-e eltömődve porral, fröccsel.'],
    bad: 'Eltömődött szűrő: tisztítsd ki most is (lásd a „Vezérlő légszűrőinek tisztítása” feladatot), és jelöld Beavatkozásként.',
    more: pick('controller', 'Légszűrő (Panasonic V 7.2)'), figs: [fig('controller', 'controller-filter.jpg')] },
  { key: 'levego', title: 'Sűrített levegő', route: 'B', kind: 'look', freq: M1,
    src: 'Valk 6.6/13', freqNote: 'A Valk hetente írja.', tools: ['szivárgáskereső spray vagy szappanos víz'],
    steps: ['A levegőegység nyomásmérője a megszokott értéket mutatja.',
      'Nincs szivárgás (sziszegés) a csatlakozásoknál és a tömlőknél. Gyanús helyen: szappanos víz vagy szivárgáskereső spray.'],
    bad: 'Szivárgó csatlakozás: meghúzás vagy csere; ha nem megy, karbantartás.',
    more: pick('air', 'Hol van', 'Elzárás karbantartáshoz', 'Szivárgáskeresés'), figs: [fig('air', 'air-unit.jpg')] },

  // ---------------- B · Hátul, leállított robottal – beavatkozás
  { key: 'sin', title: 'Sín átsöprése', route: 'B', kind: 'do', freq: W1, nk: true,
    src: 'Általános gyakorlat – a kapott kézikönyvek nem írnak a sínről', tools: ['seprű és lapát', 'ipari porszívó', 'kesztyű'],
    steps: ['Csak álló robotnál (vészleállító benyomva) lépj a sín közelébe.',
      'Söpörd vagy porszívózd le a sínt és a környékét: fröccs, huzalvég, por.',
      'A sínt ne fúvasd sűrített levegővel: a port és a fröccsöt a mozgó részek közé fújhatod.',
      'Olajat, zsírt ne tegyél rá – a kenés, ha kell, a Valk dolga.'],
    bad: 'Ha olyan szennyeződést találsz, ami nem jön le (pl. ráolvadt fröccs), vagy sérülést: jelezd a Valk-nak.',
    more: [['Honnan van ez', NK + '<p>A sínre nincs gyártói leírás nálunk. Ha a Valk ad hozzá előírást, az felülírja ezt.</p>']],
    figs: [] },
  { key: 'szuro', title: 'Vezérlő légszűrőinek tisztítása', route: 'B', kind: 'do', freq: W2,
    src: 'Valk 6.6/1–2 · Panasonic V 7.2', freqNote: 'A Valk hetente írja. Ha W1210 / W1220 hibaüzenet jön, azonnal.',
    tools: ['csavarhúzó', 'ecset', 'tartalék szűrő (ha sérült)'],
    steps: ['Kapcsold le a robotvezérlő főkapcsolóját, és várj, amíg lehűl.',
      'Lazítsd meg a szűrőtartó rögzítőcsavarját, nyisd ki a tartót, vedd ki a szűrőt.',
      'Tisztítsd ki (vagy tegyél be újat), zárd be a tartót, húzd meg a csavart.',
      'A vezérlőszekrényeket kívülről töröld le – sűrített levegő tilos.'],
    bad: 'Ha a „Temperature error” (W1210, W1220) a szűrő tisztítása után is visszajön: Panasonic.',
    more: pick('controller', 'Főkapcsolók – melyik mit kapcsol', 'Mielőtt hozzányúlsz', 'A ventilátorok nem indulnak azonnal'),
    figs: [fig('controller', 'controller-filter.jpg'), fig('controller', 'main-switches.jpg')] },
  { key: 'radiator', title: 'Hűtő radiátorának kifúvatása', route: 'B', kind: 'do', freq: M1,
    src: 'Valk 6.6/3', freqNote: 'A Valk hetente írja.', tools: ['sűrített levegő pisztoly', 'védőszemüveg'],
    steps: ['Kapcsold ki a hűtőt (kapcsoló a hátoldalán).',
      'Fúvasd ki a radiátort és a ventilátort – a hűtőt szabad sűrített levegővel. Védőszemüveg.'],
    bad: 'Sérült lamellák vagy ventilátor: karbantartás.',
    more: pick('cool', 'Mi ez, hol van', 'Biztonság'), figs: [fig('cool', 'cooler.jpg')] },
  { key: 'hutoviz-csere', title: 'Hűtővíz cseréje', route: 'B', kind: 'do', freq: M6,
    src: 'Valk 6.6/3', tools: ['hűtőfolyadék (a hűtő sajátja)', 'gyűjtőedény', 'tölcsér', 'védőszemüveg', 'kesztyű'],
    pending: 'A leeresztés és a feltöltés lépései a hűtő SMC kézikönyvéből kerülnek ide.',
    steps: ['A cserét a hűtő saját (SMC) kézikönyve szerint végezd.',
      'Csak a hűtő saját folyadékát használd.',
      'A lecserélt folyadékot elkülönítve gyűjtsd, környezetkímélően kell kezelni.'],
    bad: 'Ha a víz a csere után is zavaros, vagy nem kering: karbantartás.',
    more: pick('cool', 'Biztonság', 'Utántöltés', 'Csere 6 havonta'), figs: [] },

  // ---------------- C · Bekapcsolva – hátul
  { key: 'huto-kering', title: 'Hűtő: keringés, víz tisztasága', route: 'C', kind: 'look', freq: W1,
    src: 'Valk 6.6/3 · napi B6', tools: [],
    steps: ['Bekapcsolt hűtőnél a víz kering.',
      'Bekapcsolva sem szivárog sehol.',
      'A víz tiszta: nincs benne rézszemcse vagy zavarosság (főleg köteg- vagy kábelcsere után).'],
    bad: 'Nincs keringés, szivárog, vagy rézszemcse van a vízben: karbantartás.',
    more: pick('cool', 'Rézszemcse', 'Hiba esetén'), figs: [] },
  { key: 'vezerlo-be', title: 'Vezérlő bekapcsolás után', route: 'C', kind: 'look', freq: W1,
    src: 'Panasonic V 7.2 (naponta)', tools: [],
    steps: ['A vezérlő ventilátorai forognak (bekapcsolás után kb. 25 mp-cel indulnak).',
      'Nincs rendellenes rezgés, zaj vagy szag a beépített hegesztő áramforrásból.'],
    bad: 'Rendellenes zaj, rezgés vagy szag, aminek nem világos az oka: a robot nem használható – Panasonic.',
    more: pick('controller', 'A ventilátorok nem indulnak azonnal'), figs: [] },
  { key: 'gaz-szivarog', title: 'Gáz: szivárgás a palacknál és a tömlőknél', route: 'C', kind: 'look', freq: W1,
    src: 'Valk 6.6/16', tools: ['szivárgáskereső spray vagy szappanos víz'],
    steps: ['Nyitott palacknál a nyomáscsökkentő, a gáztömlők és a csatlakozások nem szivárognak – gyanús helyen szappanos víz vagy spray.',
      'Vedd magadhoz a gáztesztelőt (hátul van) – elöl, a pisztolynál mérsz vele.'],
    bad: 'Szivárgás: jelezd a karbantartásnak.',
    more: [...pick('gas', 'Hol van'), ['Szivárgáskeresés', NK + '<p>Gyanús helyre fújj szappanos vizet vagy szivárgáskereső sprayt – ahol buborékol, ott szivárog.</p>']],
    figs: [fig('gas', 'gas-coupling.jpg')] },

  // ---------------- D · Bekapcsolva – elöl
  { key: 'robot-be', title: 'Robot bekapcsolás után', route: 'D', kind: 'look', freq: W1,
    src: 'Valk napi C1, C8 · Panasonic R 8.1.2', tools: [],
    steps: ['A teach pendanton nincs hibaüzenet.',
      'Kézi mozgatásnál és programfutás közben egyik tengely sem zajos, nem rezeg, nem ránt.',
      'Alaphelyzetben (S80) az origó-jelölések egybeesnek – közel csak benyomott vészleállítóval menj.',
      'A szervó kikapcsolásakor a kar nem esik le (fék).'],
    bad: 'Hibaüzenetnél írd fel a kódot, az alkódot és a teljes szöveget. Zaj, rezgés, leeső kar vagy el nem tűnő hiba: a robot nem használható – Valk szerviz (0031 78-7503811) vagy Panasonic.',
    more: pick('robot', 'Bekapcsolás sorrendje (Valk 4.1, 5.1)', 'Az I/O vezérlő jelzőlámpái', 'Hibaüzenet', 'Origó-jelölések (Panasonic R 8.2)', 'Akku', 'Kit hívj'),
    figs: [fig('robot', 'match-marks.jpg'), fig('robot', 'io-controller.jpg')] },
  { key: 'biztonsag', title: 'Biztonsági eszközök próbája', route: 'D', kind: 'look', freq: W1,
    src: 'Valk napi C2–C3, C6 · 3.2.1', tools: [],
    steps: ['Vészleállító: megnyomásra a szervó azonnal kikapcsol.',
      'Fénykapuk: megszakításra a robot megáll, a szervók kikapcsolnak.',
      'Szervizajtó: nyitásra a robot megáll, a szervók kikapcsolnak. Zárás: belül a fekete PRE-RESET SERVICE DOOR, kint 10 mp-en belül a fehér RESET SERVICE DOOR gomb.'],
    bad: 'Ha bármelyik nem állítja meg a robotot, a cella nem használható: ne indítsd, azonnal jelezd.',
    more: pick('safety', 'Vészleállítók', 'Újraindítás vészleállítás után (Valk 5.7)', 'Újraindítás doorstop után (Valk 5.6)', 'Szervizajtó zárása (Valk 3.2.1)', 'Állomás resetelése (Valk 3.2.1, 5.3)'),
    figs: [fig('safety', 'service-door-buttons.jpg'), fig('safety', 'safety-console.jpg')] },
  { key: 's11', title: 'Pisztolyhelyzet (S11)', route: 'D', kind: 'look', freq: W1,
    src: 'Valk napi B7 · 5.8', tools: [],
    steps: ['Futtasd az S11 Reference Tool 1 programot: a pisztoly pontosan a kalibráló jig referenciapontjára áll.'],
    bad: 'Ha eltér: ne hegessz vele, szólj a kalibrálásért felelősnek – a robotot kalibrálni kell (PPS).',
    more: pick('ref', 'Mire való', 'Automatikus ellenőrzés (ATC)', 'Kalibrálás (PPS)', 'Huzalkinyúlás'), figs: [] },
  { key: 'gazaramlas', title: 'Gázáramlás a pisztolynál', route: 'D', kind: 'look', freq: W1, extra: 'gas',
    src: 'Valk 6.6/16', tools: ['gáztesztelő (hátul van)'],
    pending: 'Hogy a teach pendanton hol indul a gázellenőrzés (gas check), a fotó alapján kerül ide.',
    steps: ['Tedd a gáztesztelőt a gázfúvókára.',
      'Indítsd el a gázellenőrzést (gas check) a teach pendanton – ez hegesztés nélkül kinyitja a gázszelepet.',
      `Olvasd le az értéket, és írd be lent. Irányérték ${LOCAL.WIRE_MM} mm-es huzalhoz: <b>${LOCAL.GAS_FLOW_TARGET} l/min</b>${LOCAL.GAS_FLOW_IS_LOCAL_RULE ? ' (általános ökölszabály, lásd Bővebben)' : ''}.`],
    bad: 'Ha jóval kevesebb az irányértéknél: szivárgás vagy dugulás van (gázcső a pisztolyban, O-gyűrű, tömlő, csatlakozás) – keresd meg, vagy jelezd.',
    more: [
      ['Mivel mérd', '<p>A gáztesztelővel (kézi gázáramlás-mérő), amit hátul tartotok: a gázfúvókára tartod, amíg a gázellenőrzés fut, és leolvasod. A robot gyári anyagaiban nem találtunk gázáramlás-kijelzést, ezért kell hozzá a gáztesztelő.</p>'],
      ['Irányérték', NK + `<p>A Valk- és Panasonic-anyagok nem adnak értéket. Az EWM ökölszabálya: 10–12 × huzalátmérő (mm) liter/perc – ${LOCAL.WIRE_MM} mm-es huzalnál ${LOCAL.GAS_FLOW_TARGET} l/min. A pontos érték a hegesztési utasításban vagy a Valk üzembe helyezési beállításában van; ha megvan, ez kerül ide.</p>`],
      ['Gázellenőrzés (gas check)', '<p>A Panasonic teach pendanton van gázellenőrző funkció: hegesztés nélkül kinyitja a gázszelepet, így mérni lehet. Mér viszont nem – a mérést a gáztesztelő adja.</p>'],
      ...pick('gas', 'Ha kevesebb a mért érték'),
    ],
    figs: [] },
  { key: 'mentes', title: 'Robot biztonsági mentése', route: 'D', kind: 'do', freq: M1,
    src: 'Valk 5.9 („rendszeresen”)', tools: ['SD-kártya vagy USB-meghajtó'],
    steps: ['Első alkalommal hozz létre mappát: SET → Advanced settings → Folder settings → Edit folder → F1 (new), név (pl. ROB 1), Enter; utána Cancel, amíg vissza nem érsz a főképernyőre.',
      'SET → Back-up → Save.',
      'Válaszd a helyet (SD Memory vagy USB Memory) és a mappát (pl. ROB 1).',
      'Válaszd az All data lehetőséget.',
      '„Verify?” → Yes. Ha minden csoport OK, kész.'],
    bad: 'Ha valamelyik csoport hibás: ismételd meg, és ments másik memóriára vagy kártyára.',
    more: [['Visszatöltésnél vigyázz (Valk 5.9)', '<p>Az All data visszatöltése az origin adatokat is visszatölti – ha a mentés a kalibrálás előtt készült, a robot vagy a külső tengely pozíciója elcsúszhat. Egy-egy elveszett fájl visszaállítása: File → Transfer.</p>']],
    figs: [] },

  // ---------------- E · Szerviz – emlékeztető
  { key: 'szerviz-eves', title: 'Éves szerviz (Valk / Panasonic)', route: 'E', kind: 'do', freq: Y1, who: 'szerviz',
    src: 'Panasonic R 8.3, V 7.3, P 12.2', tools: [],
    steps: ['Egyeztesd a Valk-kal vagy a Panasonic-kal az éves (2000 órás) átvizsgálást: motorrögzítő csavarok, forgó és hajtó részek, hajtóművek, a tengelyek zsírszivárgása, kábelezés, a huzaladagoló fogasszíjai, a pozicionáló belső kábelezése.',
      'A Panasonic az éves ellenőrzéstől teljes átvizsgálást (nagyjavítással) javasol.',
      'A füstelszívó szűrőjét a Valk cseréli – kérdezd meg tőlük az időközt.'],
    bad: 'Ha nincs időpont: jelezd a vezetőnek.', more: [], figs: [] },
  { key: 'szerviz-2ev', title: '2 éves szerviz: akkuk', route: 'E', kind: 'do', freq: Y2, who: 'szerviz',
    src: 'Panasonic R 8.3, 8.4 · P 12.2', tools: [],
    steps: ['A robotkar akkuinak cseréje (4000 óra / 2 év) – Panasonic által feljogosított szerviz.',
      'A huzaladagoló fogasszíjainak cseréje (4000 óra).',
      'A pozicionáló akkuja és munkadarab-földkábele: csere szükség szerint.'],
    bad: 'Ha közben „E8000 Encoder battery is consumed” üzenet jön: azonnal szólj a szerviznek.', more: [], figs: [] },
  { key: 'szerviz-3ev', title: '3 éves szerviz: hajtóművek, fogasszíjak', route: 'E', kind: 'do', freq: Y3, who: 'szerviz',
    src: 'Panasonic R 8.3 · P 12.2', tools: [],
    steps: ['A robotkar hajtóműveinek zsírozása vagy cseréje (6000 óra).',
      'A robotkar fogasszíjainak húzóereje, ha kell, beállítás.',
      'A pozicionáló hajtóműve (zsír) és fogasszíja (feszesség).'],
    bad: 'Ha nincs időpont: jelezd a vezetőnek.', more: [], figs: [] },
  { key: 'szerviz-4ev', title: '4 éves szerviz: kábelek, szénkefe', route: 'E', kind: 'do', freq: Y4, who: 'szerviz',
    src: 'Panasonic R 8.3 · P 12.2', tools: [],
    steps: ['A robotkar tápkábele és belső kábelezése: csere (8000 óra).',
      'A pozicionáló szénkeféje: új 17 mm, határ 13 mm – ennél vagy ez alatt csere.'],
    bad: 'Ha nincs időpont: jelezd a vezetőnek.', more: [], figs: [] },
  { key: 'szerviz-5ev', title: '5 éves szerviz: fogasszíjak, fékoldó', route: 'E', kind: 'do', freq: Y5, who: 'szerviz',
    src: 'Panasonic R 8.3 · P 12.2', tools: [],
    steps: ['A robotkar fogasszíjainak cseréje (10 000 óra).',
      'Fékoldó kapcsoló, belső nyomtatott áramkör, gumiburkolat, nejlon bilincs, gumilap: csere, beállítás.',
      'A pozicionáló fogasszíja: csere szükség szerint.'],
    bad: 'Ha nincs időpont: jelezd a vezetőnek.', more: [], figs: [] },
];

export const TASK_BY_KEY = Object.fromEntries(TASKS.map((t) => [t.key, t]));
export const isWeekly = (t) => t.freq.d === 7;
export const WEEKLY_KEYS = TASKS.filter(isWeekly).map((t) => t.key);

// A lap korábbi változatainak tételcímei – a régi lapok megjelenítéséhez
// (azoknál a tételek sorszámmal, „no” mezővel vannak tárolva).
export const LEGACY_TITLES = {
  1: ['Robot és vezérlő', 'Hegesztő áramforrás (welding trafo)', 'Hűtőegység (VWK 7/1, SMC)', 'Kábelköteg (QE cable assembly)',
    'Hegesztőpisztoly (torch)', 'Huzaladagoló (wire feeder)', 'Munkaterület', 'Fénysorompók (light barriers)', 'Kerítések',
    'Szervizajtók', 'Készülékek (jigek)', 'Füstelszívás (air exhaust)', 'Sűrítettlevegő-egység (air unit)',
    'Hegesztési fényvédelem', 'Mechanikus pisztolytisztító (Thielmann)', 'Gázegység'],
  2: ['Munkaterület és szerszámok', 'Robotkar', 'Pisztoly és ütközésvédő', 'Kábelköteg és spirál', 'Huzaladagoló',
    'Pisztolytisztító (Thielmann)', 'Készülékek (jigek)', 'Vezérlő és hegesztőkábelek', 'Kerítés, ajtók, fényvédelem, fénysorompók',
    'Füstelszívás', 'Sűrített levegő', 'Hűtőegység (VWK 7/1)', 'Robot bekapcsolás után', 'Biztonsági eszközök működéspróbája',
    'Pisztolyhelyzet (S11)', 'Gáz'],
};
