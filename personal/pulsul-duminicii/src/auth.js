// Poartă de acces, ținută intenționat ca o singură funcție, ușor de schimbat din
// wrangler.toml fără să atingi restul codului.
//
// AUTH_MODE = "accounts" -> (implicit) login cu cont: BisericaLogos vede tot,
//                            fiecare predicator își vede statisticile și programul.
//                            Vezi src/session.js.
// AUTH_MODE = "none"     -> fără nicio verificare; toată lumea e tratată ca admin
//                            (inclusiv la editarea programului — doar pentru teste).
// AUTH_MODE = "password" -> Basic Auth simplu, o singură parolă comună (SITE_PASSWORD);
//                            cine trece e tratat ca admin.
// AUTH_MODE = "access"   -> nimic de făcut aici; Cloudflare Access blochează la
//                            marginea rețelei, înainte ca cererea să ajungă la Worker
//                            (configurat din dashboard Zero Trust, gratuit până la 50 useri).

import { getSession } from './session.js';

const LEGACY_ADMIN = { role: 'admin', username: 'admin', displayName: 'Admin', legacy: true };

// Întoarce { user } dacă cererea poate continua, sau { response } dacă trebuie oprită.
// `user` e null în modul "accounts" când nu există sesiune — index.js decide atunci
// ce rute sunt publice (/login) și unde redirecționează.
export async function authenticate(request, env) {
  const mode = env.AUTH_MODE || 'accounts';
  if (mode === 'password') {
    const header = request.headers.get('Authorization') || '';
    const expected = 'Basic ' + btoa(`puls:${env.SITE_PASSWORD || ''}`);
    if (header !== expected) {
      return {
        response: new Response('Acces restricționat.', {
          status: 401,
          headers: { 'WWW-Authenticate': 'Basic realm="Pulsul Duminicii"' },
        }),
      };
    }
    return { user: LEGACY_ADMIN };
  }
  if (mode === 'none' || mode === 'access') return { user: LEGACY_ADMIN };
  return { user: await getSession(env, request) };
}
