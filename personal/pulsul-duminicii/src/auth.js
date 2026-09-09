// Poartă de acces, ținută intenționat ca o singură funcție, ușor de schimbat din
// wrangler.toml fără să atingi restul codului.
//
// AUTH_MODE = "none"     -> fără nicio verificare (alegerea implicită acum: link
//                            neafișat public, fără parolă — decizia explicită a
//                            utilizatorului).
// AUTH_MODE = "password" -> Basic Auth simplu, o singură parolă comună (SITE_PASSWORD).
// AUTH_MODE = "access"   -> nimic de făcut aici; Cloudflare Access blochează la
//                            marginea rețelei, înainte ca cererea să ajungă la Worker
//                            (configurat din dashboard Zero Trust, gratuit până la 50 useri).

export function checkAccess(request, env) {
  if (env.AUTH_MODE === 'password') {
    const header = request.headers.get('Authorization') || '';
    const expected = 'Basic ' + btoa(`puls:${env.SITE_PASSWORD || ''}`);
    if (header !== expected) {
      return new Response('Acces restricționat.', {
        status: 401,
        headers: { 'WWW-Authenticate': 'Basic realm="Pulsul Duminicii"' },
      });
    }
  }
  return null; // null = acces permis, continuă către randare
}
