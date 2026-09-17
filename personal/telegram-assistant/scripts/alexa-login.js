// Logare Alexa (o dată, și din nou când Amazon invalidează sesiunea). Rulează LOCAL, nu în Worker.
//
//   npm run alexa-login              → deschide http://localhost:3456, te loghezi pe Amazon,
//                                       apoi scriptul pune ALEXA_REFRESH_TOKEN în Cloudflare
//   npm run alexa-login -- --dry-run → doar afișează id-urile, fără să atingă secretele
//
// Parola merge direct la Amazon prin proxy-ul local; tokenul nu se afișează și nu se scrie pe
// disc — trece direct în `wrangler secret put` prin stdin.
const { spawnSync } = require('child_process');
const Alexa = require('alexa-remote2');

const DEVICE_NAME = process.env.ALEXA_AC_NAME || 'AC';
const AMAZON_PAGE = process.env.ALEXA_AMAZON_PAGE || 'amazon.de';
const dryRun = process.argv.includes('--dry-run');

const alexa = new Alexa();
let done = false;

alexa.init(
  {
    proxyOnly: true,
    proxyOwnIp: 'localhost',
    proxyPort: 3456,
    proxyLogLevel: 'warn',
    amazonPage: AMAZON_PAGE,
    acceptLanguage: 'en-GB',
    useWsMqtt: false,
    bluetooth: false,
    cookieRefreshInterval: 0,
    logger: () => {},
  },
  (err) => {
    if (err) {
      if (/localhost:3456/.test(err.message)) {
        console.log('Deschide http://localhost:3456/ în browser și loghează-te cu contul Amazon al Alexei.');
      } else {
        console.error('Eroare:', err.message);
      }
      return;
    }
    if (done) return;
    done = true;

    alexa.getSmarthomeDevicesV2((e, devices) => {
      if (e) {
        console.error('Nu am putut citi dispozitivele:', e.message);
        process.exit(1);
      }
      const ac = (devices || []).find((d) => d.friendlyName === DEVICE_NAME)?.legacyAppliance;
      console.log('\nPune în wrangler.toml ([vars]):');
      console.log(`ALEXA_AMAZON_PAGE = "${AMAZON_PAGE}"`);
      console.log(`ALEXA_API_HOST = "${alexa.baseUrl}"`);
      console.log(`ALEXA_DEVICE_APP_NAME = "${alexa.cookieData.deviceAppName}"`);
      if (ac) {
        console.log(`ALEXA_AC_ENTITY_ID = "${ac.entityId}"`);
        console.log(`ALEXA_AC_APPLIANCE_ID = "${ac.applianceId}"`);
      } else {
        console.log(`(nu am găsit niciun dispozitiv Alexa numit "${DEVICE_NAME}" — setează ALEXA_AC_NAME)`);
      }

      if (dryRun) {
        console.log('\n--dry-run: secretul ALEXA_REFRESH_TOKEN NU a fost modificat.');
        process.exit(0);
      }
      const put = spawnSync('npx', ['wrangler', 'secret', 'put', 'ALEXA_REFRESH_TOKEN'], {
        input: alexa.cookieData.refreshToken,
        stdio: ['pipe', 'inherit', 'inherit'],
        shell: true,
      });
      console.log(put.status === 0 ? '\nALEXA_REFRESH_TOKEN actualizat în Cloudflare.' : '\nwrangler secret put a eșuat.');
      process.exit(put.status ?? 1);
    });
  }
);
