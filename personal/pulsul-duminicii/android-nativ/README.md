# Pulsul Duminicii — aplicația Android nativă

Aplicație scrisă în **Kotlin + Jetpack Compose**, separată de TWA-ul din `../android/` (acela doar
deschide site-ul). Aceleași ecrane, aceleași roluri și aceleași date ca site-ul, desenate nativ:
bun venit, login, Acasă, Duminici (slideshow / toate deodată), Categorii (matrice de corelații,
intervale), Predicatori, Prezență (parteneri/musafiri/procent, grafic + interval), „Statisticile
mele", Program duminică (editor, fișiere, linkuri), conturi.

| | |
|---|---|
| Pachet | `ro.bisericalogos.pulsul.nativ` (stă **alături** de TWA, nu îl înlocuiește) |
| Nume pe telefon | „Pulsul nativ" |
| Android minim | 8.0 (API 26), țintă API 36 |
| Semnare | cheia de debug a calculatorului (`~/.android/debug.keystore`) — doar instalare directă, nu Google Play |
| Server | `BuildConfig.BASE_URL`: implicit site-ul live; `-PbaseUrl=http://localhost:8788` pentru date de test |

## Cum ia datele

Din Worker, prin `/api/app/…` (`../src/appApi.js`): pentru fiecare pagină a site-ului există o rută
JSON cu **aceeași cale** care întoarce exact obiectul pe care îl primește pagina (`PAYLOAD`).
Modificările merg prin API-urile existente (`/api/program…`, `/api/resurse…`, `/api/conturi…`,
`/api/parola`). Login: `POST /api/app/login` → token, trimis apoi ca `Authorization: Bearer`.
Aplicația trimite și `Origin: <site>` la scrieri, fiindcă Worker-ul verifică Origin (CSRF).

Calculele pe care site-ul le face în browser sunt portate în Kotlin, cu teste:
`domain/CategoryRange.kt` (intervalele de pe pagina unei categorii) și `domain/DayStats.kt`.

## Build

Uneltele sunt în `D:\android-tools` (vezi `personal/telegram-assistant/README.md`); nu e nevoie de
Android Studio.

```bash
export JAVA_HOME=D:/android-tools/jdk21/jdk-21.0.12.1+1
export ANDROID_HOME=D:/android-tools/sdk
./gradlew.bat testDebugUnitTest          # logica portată (intervale, statisticile zilei, formatări)
./gradlew.bat assembleDebug              # APK pentru site-ul live
# → app/build/outputs/apk/debug/app-debug.apk
```

Instalare: `adb install -r app/build/outputs/apk/debug/app-debug.apk`, sau trimiți APK-ul pe
telefon și îl deschizi („instalează din această sursă").

## Pe date de test (fără să atingi producția)

```bash
cd ..            # personal/pulsul-duminicii
npm run dev:app  # site-ul de test pe 8788, cu date sintetice (lasă-l pornit)
adb reverse tcp:8788 tcp:8788
cd android-nativ && ./gradlew.bat assembleDebug -PbaseUrl=http://localhost:8788
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Conturi de test: `BisericaLogos` / `test-admin-parola`, `marius` / `parola-marius-test`.
HTTP necriptat e permis doar spre `localhost` (`res/xml/network_security_config.xml`).

## Unde e ce

| Cauți | Fișier |
|---|---|
| rețea, erori, urcare cu progres, descărcare | `data/Api.kt` |
| încărcarea unei pagini + copia offline (reguli ca `public/sw.js`) | `data/PageVM.kt`, `data/OfflineCache.kt` |
| token, utilizator, temă, preferințe ținute minte | `data/Session.kt` |
| formele datelor (1:1 cu `render.js`) | `data/Models.kt` |
| culori, fonturi (Sora / Manrope / IBM Plex Mono, TTF din Google Fonts, `OFL-fonts.txt`) | `ui/theme/Theme.kt` |
| bara de sus / de jos, benzile offline, pull-to-refresh, schelete | `ui/components/Shell.kt` |
| panouri, dialoguri, toast, tooltip | `ui/components/Overlays.kt` |
| grafice (Canvas) | `ui/charts/Charts.kt` |
| ecranele | `ui/screens/` |
| rute, tranziții, panoul „Contul meu" | `ui/Nav.kt`, `ui/AppRoot.kt` |
