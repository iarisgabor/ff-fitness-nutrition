# Pulsul Duminicii — aplicația Android

Un **Trusted Web Activity** (TWA): aplicația Android deschide site-ul live
(`https://pulsul-duminicii.iarisgabor.workers.dev`) pe tot ecranul, prin Chrome, fără bara de
adrese. Nu există cod de aplicație separat — tot ce se schimbă pe site apare imediat și în
aplicație, fără actualizare din magazin. Proiectul e generat cu
[Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap) (`twa-manifest.json` = sursa lui).

| | |
|---|---|
| Pachet | `ro.bisericalogos.pulsul` (nu se mai poate schimba după prima publicare pe Google Play) |
| Nume | „Pulsul Duminicii" (pe ecranul principal: „Pulsul") |
| Android minim | 5.0 (API 21), țintă API 36 |
| Scurtături (apăsare lungă pe iconiță) | Program, Statistici |
| Cheia de semnare | alias `pulsul`, amprenta SHA-256 `20:50:C5:65:…:1A:D4` (completă în `../public/.well-known/assetlinks.json`) |

## De unde iei APK-ul

Build-ul se face în **GitHub Actions** (`.github/workflows/android-pulsul-duminicii.yml`) — acolo
e SDK-ul Android. Pe GitHub: **Actions → Android Pulsul Duminicii** → ultima rulare → secțiunea
**Artifacts** → `pulsul-duminicii-android-lansare` (un .zip cu `.apk` și `.aab`). Pornește singur la
orice schimbare în acest folder; manual, din același loc → **Run workflow**.

### O singură dată: secretele de semnare

Repo → **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Valoare |
|---|---|
| `PULSUL_ANDROID_KEYSTORE_BASE64` | conținutul fișierului `pulsul-duminicii-android.jks.base64.txt` (tot, pe un rând) |
| `PULSUL_ANDROID_KEYSTORE_PASSWORD` | parola cheii |

Fără ele, workflow-ul construiește doar un APK **de TEST** (cheie de unică folosință): se poate
încerca pe un telefon, dar nu se dă oamenilor — o versiune semnată cu cheia reală nu se mai
instalează peste el, și se deschide cu bara de adrese.

> **Cheia (`.jks`) și parola se păstrează în afara repo-ului** (manager de parole + o copie de
> rezervă). Fără ele nu se mai poate publica nicio actualizare a aplicației cu același pachet.
> `.gitignore` refuză orice `.jks` din acest folder.

## Instalare pe telefon (fără Google Play)

1. Trimite `pulsul-duminicii-….apk` (WhatsApp, e-mail, Drive).
2. Pe telefon îl deschizi → Android cere voie să instaleze „din această sursă" → **Permite** →
   **Instalează**.
3. Prima deschidere: login ca pe site. Sesiunea ține 30 de zile.

Pentru ca aplicația să se deschidă **fără bara de adrese**, site-ul trebuie să servească
`/.well-known/assetlinks.json` cu amprenta cheii — e în `../public/.well-known/`, ajunge live la
următorul deploy (merge pe `main`). Până atunci aplicația merge, dar cu bara de sus a Chrome.

## Google Play (opțional)

1. Cont de dezvoltator Google Play (taxă unică). Conturile **personale noi** trebuie, înainte de
   publicarea publică, să treacă printr-un test închis (la data scrierii: minim 12 testeri, 14
   zile) — verifică regulile curente în Play Console. Pentru un grup mic, un test **intern** (până
   la 100 de oameni, fără review) ajunge și e cel mai simplu.
2. Urci `.aab`-ul. Cu *Play App Signing* (implicit), Google re-semnează aplicația cu cheia lui:
   Play Console → **Test and release → App integrity → App signing** → copiază amprenta SHA-256 a
   „App signing key" și **adaug-o** în `../public/.well-known/assetlinks.json` (lângă cea
   existentă, nu în locul ei), apoi deploy.
3. Politica de confidențialitate cerută de Play: o pagină publică despre ce date se strâng
   (login, feedback, program).

## Versiune nouă a aplicației

Rar e nevoie — conținutul vine din site. Doar la schimbări de nume, iconiță, culori, scurtături:

1. Crește `appVersionCode` (și `appVersionName`) în `twa-manifest.json` și `versionCode` /
   `versionName` în `app/build.gradle` — sau, cu Bubblewrap instalat,
   `npx @bubblewrap/cli update` (le face pe amândouă și regenerează proiectul).
2. Push → workflow-ul construiește noul APK/AAB, semnat cu aceeași cheie → se instalează peste
   cel vechi.

**Dacă site-ul se mută pe alt domeniu:** `host` în `twa-manifest.json` + `hostName` în
`app/build.gradle` (sau `bubblewrap update`), `assetlinks.json` servit și de pe noul domeniu,
versiune nouă a aplicației.

## iPhone

Nu există APK pentru iPhone. Pe iPhone, aplicația se instalează din Safari (Share → Adaugă pe
ecranul principal) — aceeași experiență pe tot ecranul, inclusiv offline. O aplicație în App
Store ar cere cont Apple Developer (anual), un Mac cu Xcode și trecerea prin review-ul Apple.
