// =====================================================================
// BREMAT Központ – szerveroldal. Nem tárol semmit: belépési kód
// ellenőrzése és a projektkörök listájának kiadása. (A Munkanapló és a
// Valk lap adatait a Központ a saját függvényeiktől kéri: /api/naplo, /api/km.)
// =====================================================================
import { checkCode, KmError } from './km-core.mjs';
import { PROJECTS, PRIVATE_INDEX } from './projektek.mjs';

export { KmError };

export async function handle(rawBody, { accessCode }) {
  if (typeof rawBody !== 'string' || rawBody.length > 4096) throw new KmError('Túl nagy kérés', 413);
  let body;
  try { body = JSON.parse(rawBody); } catch { throw new KmError('Hibás kérés'); }
  if (!body || typeof body !== 'object') throw new KmError('Hibás kérés');

  checkCode(body.code, accessCode);   // rossz kódnál itt megáll (401)

  switch (body.action) {
    case 'ping':
      return true;
    case 'projects':
      return { projects: PROJECTS, private_index: PRIVATE_INDEX };
    default:
      throw new KmError('Ismeretlen művelet');
  }
}
