// =====================================================================
// A Központ „Projektek” menüpontjának adatai: fő projektkörök és a
// hozzájuk tartozó oldalak (Claude-oldalak – csak Alex belépésével
// nyílnak meg). A szerver csak helyes belépési kóddal adja ki
// (/api/kozpont, action: 'projects'), a nyilvános oldalba nincs beégetve.
// Új oldal: egy sor a megfelelő `items` listába.
//   t: cím, u: link, d: utolsó frissítés (ÉÉÉÉ-HH-NN), k: jelölések
// =====================================================================
export const PROJECTS = [
  {
    key: 'tokmany',
    name: 'Tokmány vagy lemez',
    about: 'A befogás nagy kérdése: tokmány vagy kitolt / vastag lemez.',
    items: [
      { t: 'Lemez vagy tokmány', u: 'https://claude.ai/artifact/T8HhGQZ3sf8GQ4CH1ZaQgj', d: '2026-11-04' },
      { t: 'Nagy tokmány vagy lemez: kutatás és összehasonlítás', u: 'https://claude.ai/artifact/T4uVeuk2ct8bUKcF1SRNZa', d: '2026-11-04' },
      { t: 'Tokmány hátlap: leírás az esztergályosnak', u: 'https://claude.ai/artifact/DfU27Umigvj5AxrR33pxqh', d: '2026-11-04' },
      { t: 'Tokmányos befogás 3D', u: 'https://claude.ai/artifact/SjKFY9NJCQqbihx4EynNr1', d: '2026-11-04', k: ['3D'] },
      { t: 'Lemez vagy tokmány: összehasonlítás', u: 'https://claude.ai/artifact/TE6zkvs9dEcAYfxpWpnXdr', d: '2026-10-29' },
      { t: 'Tokmányos gyorscserélő', u: 'https://claude.ai/artifact/VEe2Mn9JQ7i2ezFnGKJoxz', d: '2026-10-29' },
      { t: 'Vastag lemez 3D', u: 'https://claude.ai/artifact/TcXTPKrecjv3cyq1tJBhBj', d: '2026-10-29', k: ['3D'] },
      { t: 'Thick Plate 3D', u: 'https://claude.ai/artifact/GraG5VrtLexizKyaW6rWkJ', d: '2026-10-28', k: ['3D', 'angol'] },
      { t: 'Kitolt lemez 3D', u: 'https://claude.ai/artifact/LBXvBXkthy58pRiYbdzs48', d: '2026-10-19', k: ['3D'] },
      { t: 'Raised Plate 3D', u: 'https://claude.ai/artifact/AQa6PzGv8k3VTkRsbiG4mN', d: '2026-10-19', k: ['3D', 'angol'] },
    ],
  },
  {
    key: 'adapter',
    name: 'Univerzális adapter és befogó',
    about: 'Tervek, rajzolói anyagok, ellenőrzések és a bemutató.',
    items: [
      { t: 'Univerzális adapter', u: 'https://claude.ai/artifact/Q8VwargJRRRizwvBkHCWci', d: '2026-10-19' },
      { t: 'Univerzális adapter (korábbi)', u: 'https://claude.ai/artifact/6jfEK8ameaBAzVceSKMbx2', d: '2026-10-18' },
      { t: 'Univerzális adapter v1 anyagai', u: 'https://claude.ai/artifact/Wvpd8KtqdpCgaTxuoAenWD', d: '2026-10-19' },
      { t: 'Robotcella és adapter rendelés', u: 'https://claude.ai/artifact/RFvv7H8rbxmEUZSrxDBQpg', d: '2026-10-19' },
      { t: 'Befogó rajzolói 3D', u: 'https://claude.ai/artifact/6Tge524R5Nz7tAM5eHpxkN', d: '2026-10-16', k: ['3D'] },
      { t: 'Befogó rajzolói leírás', u: 'https://claude.ai/artifact/Ku2NgXZm9CWhdeabGf54S4', d: '2026-10-19' },
      { t: 'Befogó önellenőrzés', u: 'https://claude.ai/artifact/7JnCDM3b3XNuEYn9Wb8Ciu', d: '2026-10-16' },
      { t: 'Végleges önellenőrzés', u: 'https://claude.ai/artifact/UXYKqrx5ZbkbJq3P1mhLrP', d: '2026-10-19' },
      { t: 'Adapter 3D látványterv', u: 'https://claude.ai/artifact/2Q1bD6SJZxtp7FZuu1rnfW', d: '2026-10-15', k: ['3D'] },
      { t: 'Adapter 3D visualisation', u: 'https://claude.ai/artifact/DLpyHi2Z4AD54ZC7ord2Sr', d: '2026-10-15', k: ['3D', 'angol'] },
      { t: 'Egylemezes hornyos tárcsa', u: 'https://claude.ai/artifact/24ZTDqZaKp9V2NAbndCnqW', d: '2026-10-14' },
      { t: 'Single-plate slotted disc', u: 'https://claude.ai/artifact/D5oQKigMqAGQuEVQmfUF6N', d: '2026-10-14', k: ['angol'] },
      { t: 'Kis tárcsa animáció', u: 'https://claude.ai/artifact/Toc9b8wut5zZ9NGh49vdKX', d: '2026-10-15' },
      { t: 'Small disc animation', u: 'https://claude.ai/artifact/NwfRw638upL9N4vcrqav8k', d: '2026-10-15', k: ['angol'] },
      { t: 'Tartó és D405 rajzok', u: 'https://claude.ai/artifact/1na4k7pEEyTRAXixBpak5w', d: '2026-10-15' },
      { t: 'Bemutató beszéd – Univerzális adapter', u: 'https://claude.ai/artifact/XdH8U4PwpzB7C8NSUKPNnu', d: '2026-10-29', k: ['bemutató'] },
      { t: 'Univerzális adapter – háttéranyag a bemutatóhoz', u: 'https://claude.ai/artifact/XWsgXmFJS1trVonYgwkRu9', d: '2026-10-19', k: ['bemutató'] },
      { t: 'Presentation speech – Universal adapter', u: 'https://claude.ai/artifact/NV3FCqvQ2rRGvWYzybRGam', d: '2026-10-29', k: ['bemutató', 'angol'] },
      { t: 'Universal adapter – speaker notes', u: 'https://claude.ai/artifact/P6gTFSb4YAnyahgniqfuZ3', d: '2026-10-28', k: ['bemutató', 'angol'] },
    ],
  },
  {
    key: 'hegesztett',
    name: 'Uitloopbuis R és Voorraadmenger',
    about: 'Hegesztett termékek: sorrend, sablon, látványterv.',
    items: [
      { t: 'Voorraadmenger hegesztési sorrend', u: 'https://claude.ai/artifact/QJXQhrksWoEYyj6PtavNoZ', d: '2026-10-26' },
      { t: 'Voorraadmenger 2950.7510 – összeállító sablon 3D', u: 'https://claude.ai/artifact/QG96qs8z3b5p65m1Q5PXiE', d: '2026-09-18', k: ['3D'] },
      { t: 'Uitloopbuis R 3D-terv', u: 'https://claude.ai/artifact/3aa2U5HwXH9JF6WPjwRuM4', d: '2026-10-12', k: ['3D'] },
      { t: 'Belső hegesztés nélkül – Uitloopbuis R', u: 'https://claude.ai/artifact/V5CRvnV3dNyFrqQN5dpoF2', d: '2026-10-01' },
      { t: 'Uitloopbuis R – hegesztési látványterv', u: 'https://claude.ai/artifact/ECUg46SinEbDWguZno7zLQ', d: '2026-10-01' },
    ],
  },
  {
    key: 'muhely',
    name: 'Műhely és eszközök',
    about: 'Kocsik, segédeszközök, műhelyi dolgok.',
    items: [
      { t: 'Robotkocsi – összeszerelési terv', u: 'https://claude.ai/artifact/4GvU7KbRy2tcHRjsPV36HE', d: '2026-10-19' },
      { t: 'Hegesztő szerelőkocsi', u: 'https://claude.ai/artifact/PfSkco5pqCvUsAXn3dVUhh', d: '2026-10-19' },
      { t: 'Méretező szerkesztő', u: 'https://claude.ai/artifact/DH7KWCUkcpZZyhaurKZpVN', d: '2026-10-02' },
      { t: 'BREMAT Lakatos álláshirdetés', u: 'https://claude.ai/artifact/6b6n4sostdo39AV7wkwD5x', d: '2026-10-02' },
      { t: 'Heti robot ellenőrzőlap (régi, ma: Valk heti lap)', u: 'https://claude.ai/artifact/76eDmafSVNoAjiwzJwtFUn', d: '2026-09-30', k: ['régi'] },
    ],
  },
];

// A személyes oldalak (Jarvis, mellékjövedelem stb.) nem ide kerülnek, hanem a
// privát Claude-oldalra (Műhelyindex) – a menüből egy linkkel érhető el.
export const PRIVATE_INDEX = 'https://claude.ai/artifact/PFjAFQubRT1fs7gy63H4aR';
