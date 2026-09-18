package dev.workers.iarisgabor.asistentnativ;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.util.Log;

import androidx.annotation.NonNull;

import org.json.JSONObject;
import org.vosk.Model;
import org.vosk.Recognizer;
import org.vosk.android.RecognitionListener;
import org.vosk.android.SpeechService;
import org.vosk.android.StorageService;

import java.util.concurrent.TimeUnit;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.WebSocket;
import okhttp3.WebSocketListener;

/**
 * Serviciul care ține aplicația vie și face cele trei lucruri pe care un site nu le poate face:
 *
 *   1. FUNDAL          — procesul nu e oprit când ieși din aplicație, deci apelul continuă.
 *   2. TE POATE SUNA   — ține deschisă o legătură cu Worker-ul (/voice-listen). Când asistentul
 *                        vrea să te caute, trimite prin ea și telefonul sună. Fără Firebase.
 *   3. CUVÂNT DE TREZIRE — ascultă local după „Jarvis", complet offline.
 *
 * Toate trei într-un singur serviciu, deliberat: fiecare ar avea nevoie oricum de un serviciu
 * de prim-plan, iar trei ar însemna trei notificări permanente și de trei ori bateria.
 *
 * Ce NU face: nu capturează el sunetul conversației. Apelul rămâne în WebView, cu același cod
 * ca pe web — o singură implementare, nu două care pot diverge.
 */
public class VoiceService extends Service {

    private static final String TAG = "VoiceService";

    // Serviciul are TREI stari, nu doua actiuni independente. Asta conteaza: intr-un apel,
    // microfonul e al WebView-ului, iar cuvantul de trezire TREBUIE oprit — daca amandoua ar
    // deschide microfonul in acelasi timp, una din ele pierde, imprevizibil, in functie de telefon.
    //
    //   VEGHE — fara apel: asculta dupa "Jarvis" + tine legatura prin care poate fi sunat
    //   APEL  — apel in curs: trezirea OPRITA, legatura ramane
    //   STOP  — oprit de tot (butonul din notificare)
    public static final String ACTION_APEL = "dev.workers.iarisgabor.asistentnativ.APEL";
    public static final String ACTION_VEGHE = "dev.workers.iarisgabor.asistentnativ.VEGHE";
    public static final String ACTION_STOP = "dev.workers.iarisgabor.asistentnativ.STOP";
    public static final String EXTRA_TOKEN = "token";
    public static final String EXTRA_AUTO_APEL = "auto_apel";

    private static final String CANAL_APEL = "apel_vocal";
    private static final String CANAL_SUNA = "apel_intrat";
    private static final int NOTIFICARE_ID = 4711;
    private static final int NOTIFICARE_SUNA_ID = 4712;

    private static final String GAZDA = "telegram-assistant.iarisgabor.workers.dev";

    // Cuvântul de trezire. Modelul e englezesc, deci variantele apropiate fonetic se acceptă și
    // ele — altfel s-ar rata de fiecare dată când pronunția alunecă puțin.
    private static final String[] TREZIRE = { "jarvis", "jarvis's", "charvis", "javis", "jarvi" };

    private PowerManager.WakeLock wakeLock;
    private OkHttpClient client;
    private WebSocket socketAscultare;
    private String token;
    private boolean opresteVoit = false;

    private Model model;
    private SpeechService speechService;
    // Despachetarea modelului e asincrona: fara steagul asta, doua comenzi apropiate pornesc
    // doua motoare, amandoua cer microfonul, si una primeste liniste. Verificarea pe
    // `speechService != null` nu ajunge - la a doua comanda, prima inca nu l-a creat.
    private boolean trezireInCurs = false;
    private final Handler handler = new Handler(Looper.getMainLooper());

    @Override
    public void onCreate() {
        super.onCreate();
        creeazaCanale();
        client = new OkHttpClient.Builder()
            // Ping automat la 30 de secunde: fără el, routerele și operatorul taie o conexiune
            // tăcută după câteva minute, iar telefonul ar părea conectat fără să fie.
            .pingInterval(30, TimeUnit.SECONDS)
            .readTimeout(0, TimeUnit.MILLISECONDS)
            .build();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String actiune = intent != null ? intent.getAction() : null;

        if (ACTION_STOP.equals(actiune)) {
            opresteVoit = true;
            opreste();
            return START_NOT_STICKY;
        }

        if (intent != null && intent.hasExtra(EXTRA_TOKEN)) {
            token = intent.getStringExtra(EXTRA_TOKEN);
        }
        opresteVoit = false;

        if (ACTION_APEL.equals(actiune)) {
            porneFundal(false);
            conecteazaAscultarea();
            // Apel pornit: eliberam microfonul pentru WebView. Doua capturi simultane in acelasi
            // proces nu merg — una din ele primeste liniste, si nu se stie dinainte care.
            opresteTrezirea();
        } else {
            treciInVeghe();
        }

        return START_STICKY; // omorât sub presiune de memorie → sistemul îl repornește
    }

    // ─── Prim-plan ──────────────────────────────────────────────────────────────────────────

    private void porneFundal(boolean veghe) {
        Notification notificare = construiesteNotificarePermanenta(veghe);

        // De la Android 10 tipul se declară și la pornire, nu doar în manifest, altfel sistemul
        // aruncă o excepție și serviciul nu pornește deloc.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICARE_ID,
                notificare,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
                    | ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
            );
        } else {
            startForeground(NOTIFICARE_ID, notificare);
        }

        if (wakeLock == null) {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "asistent:apel");
            wakeLock.setReferenceCounted(false);
        }
        if (!wakeLock.isHeld()) {
            // Ține procesorul treaz (nu ecranul). Fără el, adormirea profundă rupe WebSocket-ul.
            // Plafon de 3 ore ca plasă de siguranță, dacă ceva uită să oprească serviciul.
            wakeLock.acquire(3 * 60 * 60 * 1000L);
        }
    }

    private void opreste() {
        inchideAscultarea();
        opresteTrezirea();
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        stopForeground(true);
        stopSelf();
    }

    /**
     * Aplicatia a fost trasa afara din aplicatiile recente. Apelul nu mai are rost — dar
     * vegherea da, altfel "Jarvis" ar functiona doar cat timp aplicatia e deschisa, adica
     * exact cand nu ai nevoie de el.
     */
    @Override
    public void onTaskRemoved(Intent rootIntent) {
        treciInVeghe();
        super.onTaskRemoved(rootIntent);
    }

    /** Starea de repaus: asculta dupa "Jarvis" si ramane accesibil pentru a fi sunat. */
    private void treciInVeghe() {
        porneFundal(true);
        conecteazaAscultarea();
        pornesteTrezirea();
    }

    @Override
    public void onDestroy() {
        inchideAscultarea();
        opresteTrezirea();
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        super.onDestroy();
    }

    // ─── Legătura prin care poate suna ─────────────────────────────────────────────────────

    private void conecteazaAscultarea() {
        if (socketAscultare != null || token == null || token.isEmpty()) return;

        Request cerere = new Request.Builder()
            .url("wss://" + GAZDA + "/voice-listen?token=" + token)
            .build();

        socketAscultare = client.newWebSocket(cerere, new WebSocketListener() {
            @Override
            public void onOpen(@NonNull WebSocket ws, @NonNull Response response) {
                Log.i(TAG, "Ascultare conectata");
            }

            @Override
            public void onMessage(@NonNull WebSocket ws, @NonNull String text) {
                try {
                    JSONObject ev = new JSONObject(text);
                    String tip = ev.optString("tip", "notificare");
                    String titlu = ev.optString("titlu", "Asistent");
                    String mesaj = ev.optString("text", "");
                    handler.post(() -> aratraApelIntrat(titlu, mesaj, "apel".equals(tip)));
                } catch (Exception e) {
                    Log.e(TAG, "Eveniment necitibil", e);
                }
            }

            @Override
            public void onFailure(@NonNull WebSocket ws, @NonNull Throwable t, Response r) {
                Log.w(TAG, "Ascultare cazuta: " + t.getMessage());
                socketAscultare = null;
                // Reîncercare după 10 secunde. Rețeaua se pierde des pe telefon (tunel, lift,
                // trecerea de pe wifi pe date) — o legătură care nu se reface singură e inutilă.
                if (!opresteVoit) handler.postDelayed(VoiceService.this::conecteazaAscultarea, 10000);
            }

            @Override
            public void onClosed(@NonNull WebSocket ws, int code, @NonNull String reason) {
                socketAscultare = null;
                if (!opresteVoit) handler.postDelayed(VoiceService.this::conecteazaAscultarea, 10000);
            }
        });
    }

    private void inchideAscultarea() {
        if (socketAscultare != null) {
            socketAscultare.close(1000, "serviciu oprit");
            socketAscultare = null;
        }
    }

    // ─── Apel pe ecranul de blocare ────────────────────────────────────────────────────────

    private void aratraApelIntrat(String titlu, String text, boolean caApel) {
        Intent deschide = new Intent(this, MainActivity.class);
        deschide.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        deschide.putExtra(EXTRA_AUTO_APEL, true);

        PendingIntent intentie = PendingIntent.getActivity(
            this, 2, deschide, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
        );

        Notification.Builder b = new Notification.Builder(this, caApel ? CANAL_SUNA : CANAL_APEL)
            .setContentTitle(titlu)
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setContentIntent(intentie)
            .setAutoCancel(true)
            .setCategory(Notification.CATEGORY_CALL)
            .setVisibility(Notification.VISIBILITY_PUBLIC);

        if (caApel) {
            // `setFullScreenIntent` e ce transformă o notificare într-un apel: aprinde ecranul
            // și se deschide peste ecranul de blocare, în loc să aștepte cuminte în bară.
            b.setFullScreenIntent(intentie, true);
            b.setOngoing(false);
        }

        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null) nm.notify(NOTIFICARE_SUNA_ID, b.build());
    }

    // ─── Cuvânt de trezire ─────────────────────────────────────────────────────────────────

    private void pornesteTrezirea() {
        if (speechService != null || trezireInCurs) return;
        trezireInCurs = true;

        StorageService.unpack(this, "model-en", "model", (Model m) -> {
            model = m;
            try {
                // Gramatică închisă: recunoaștem DOAR cuvântul de trezire, restul cade în [unk].
                // Asta e diferența dintre a rula un dicționar de zeci de mii de cuvinte și a
                // căuta unul singur — de zeci de ori mai puțin procesor, deci și baterie.
                String gramatica = "[\"jarvis\", \"[unk]\"]";
                Recognizer rec = new Recognizer(model, 16000.0f, gramatica);
                speechService = new SpeechService(rec, 16000.0f);
                speechService.startListening(new AscultatorTrezire());
                Log.i(TAG, "Cuvant de trezire pornit");
            } catch (Exception e) {
                Log.e(TAG, "Nu pot porni trezirea", e);
            } finally {
                trezireInCurs = false;
            }
        }, (java.io.IOException e) -> {
            trezireInCurs = false;
            Log.e(TAG, "Model indisponibil", e);
        });
    }

    private void opresteTrezirea() {
        trezireInCurs = false;
        if (speechService != null) {
            speechService.stop();
            speechService.shutdown();
            speechService = null;
        }
        if (model != null) {
            model.close();
            model = null;
        }
    }

    private class AscultatorTrezire implements RecognitionListener {
        private long ultimaDeclansare = 0;

        @Override
        public void onPartialResult(String json) {
            verifica(json, "partial");
        }

        @Override
        public void onResult(String json) {
            verifica(json, "text");
        }

        @Override
        public void onFinalResult(String json) {
            verifica(json, "text");
        }

        private void verifica(String json, String cheie) {
            if (json == null) return;
            try {
                String rostit = new JSONObject(json).optString(cheie, "").toLowerCase().trim();
                if (rostit.isEmpty()) return;

                boolean gasit = false;
                for (String v : TREZIRE) {
                    if (rostit.contains(v)) { gasit = true; break; }
                }
                if (!gasit) return;

                // Aceeași rostire produce și rezultat parțial, și final. Fără răgazul ăsta,
                // un singur „Jarvis" ar declanșa apelul de două-trei ori la rând.
                long acum = System.currentTimeMillis();
                if (acum - ultimaDeclansare < 3000) return;
                ultimaDeclansare = acum;

                Log.i(TAG, "Trezit: " + rostit);
                handler.post(VoiceService.this::deschideAplicatiaPentruApel);
            } catch (Exception e) {
                Log.e(TAG, "Rezultat necitibil", e);
            }
        }

        @Override public void onError(Exception e) { Log.e(TAG, "Eroare trezire", e); }
        @Override public void onTimeout() { }
    }

    /**
     * De ce NU `startActivity`: din Android 10, un serviciu aflat in fundal nu are voie sa
     * deschida o activitate. Restrictia e TACUTA — apelul reuseste, nu arunca nimic, si pur si
     * simplu nu se intampla nimic. (Verificat in loguri: "Trezit: jarvis" aparea, dar aplicatia
     * nu se deschidea niciodata.)
     *
     * Calea permisa e o notificare cu intentie pe ecran complet, exact ca la un apel primit:
     * sistemul o lasa sa aduca aplicatia in fata, inclusiv peste ecranul de blocare.
     */
    private void deschideAplicatiaPentruApel() {
        // Cu „Afisare peste alte aplicatii" acordata, sistemul ne lasa sa deschidem direct:
        // spui "Jarvis" si poti vorbi imediat, fara sa atingi nimic.
        if (android.provider.Settings.canDrawOverlays(this)) {
            Intent intent = new Intent(this, MainActivity.class);
            intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            intent.putExtra(EXTRA_AUTO_APEL, true);
            startActivity(intent);
            return;
        }

        // Fara ea, atat se poate: o notificare de apel. Pe ecran blocat se deschide singura;
        // pe telefon deblocat si in uz, Android o arata doar in bara si trebuie apasata.
        aratraApelIntrat("Jarvis", "Atinge ca să vorbim.", true);
    }

    // ─── Notificări ────────────────────────────────────────────────────────────────────────

    private void creeazaCanale() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm == null) return;

        // LOW: notificarea permanentă trebuie să existe, dar n-are rost să sune — utilizatorul
        // tocmai a pornit el apelul, știe că e în curs.
        NotificationChannel apel = new NotificationChannel(
            CANAL_APEL, "Apel vocal", NotificationManager.IMPORTANCE_LOW
        );
        apel.setDescription("Ține apelul activ când aplicația nu e pe ecran.");
        apel.setShowBadge(false);
        nm.createNotificationChannel(apel);

        // HIGH: asta chiar trebuie să te întrerupă — e echivalentul unui telefon care sună.
        NotificationChannel suna = new NotificationChannel(
            CANAL_SUNA, "Te caută asistentul", NotificationManager.IMPORTANCE_HIGH
        );
        suna.setDescription("Când asistentul te caută la o oră pe care ai cerut-o tu.");
        suna.enableVibration(true);
        suna.setVibrationPattern(new long[]{0, 400, 200, 400});
        nm.createNotificationChannel(suna);
    }

    private Notification construiesteNotificarePermanenta(boolean veghe) {
        Intent deschide = new Intent(this, MainActivity.class);
        deschide.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent apasare = PendingIntent.getActivity(
            this, 0, deschide, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
        );

        Intent opreste = new Intent(this, VoiceService.class).setAction(ACTION_STOP);
        PendingIntent opresteApasare = PendingIntent.getService(
            this, 1, opreste, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
        );

        return new Notification.Builder(this, CANAL_APEL)
            .setContentTitle(veghe ? "Ascult după „Jarvis”" : "Apel în curs")
            .setContentText(veghe
                ? "Spune „Jarvis” ca să vorbim. Atinge pentru a deschide."
                : "Asistentul te ascultă. Atinge pentru a reveni.")
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setContentIntent(apasare)
            .setOngoing(true)
            .setCategory(Notification.CATEGORY_SERVICE)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .addAction(new Notification.Action.Builder(null, "Oprește", opresteApasare).build())
            .build();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null; // se pornește și se oprește prin intenții, nu prin legare
    }
}
