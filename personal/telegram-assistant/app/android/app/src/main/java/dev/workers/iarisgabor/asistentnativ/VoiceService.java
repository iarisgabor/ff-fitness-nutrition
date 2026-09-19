package dev.workers.iarisgabor.asistentnativ;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.AudioDeviceInfo;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.net.Uri;
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
import org.vosk.android.StorageService;

import java.net.URLEncoder;
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

    private static final String TREZIRE = "jarvis";

    // Cât de sigur trebuie să fie modelul ca să deschidem aplicația.
    //
    // De ce e nevoie de prag: gramatica e ÎNCHISĂ (doar „jarvis" și „[unk]"), deci recunoscătorul
    // NU are opțiunea „n-am înțeles" — orice sunet e împins spre unul din cele două. O ușă
    // trântită, un cuvânt dintr-o discuție, televizorul: toate pot cădea pe „jarvis" cu
    // încredere mică. Fără prag, aplicația se deschidea singură de câteva ori pe zi.
    //
    // O rostire adevărată iese pe la 0.9-1.0. Dacă ți se pare că ratează, coboară-l — fiecare
    // candidat respins se loghează cu încrederea lui exactă (`adb logcat -s VoiceService`).
    private static final double PRAG_INCREDERE = 0.85;

    private PowerManager.WakeLock wakeLock;
    private OkHttpClient client;
    private WebSocket socketAscultare;
    private String token;
    private boolean opresteVoit = false;

    private Model model;
    // Captura o tinem noi, nu `SpeechService` din Vosk. Doua motive, amandoua legate de ce
    // aude utilizatorul in restul telefonului (vezi `AscultareMicrofon`): Vosk nu-si expune
    // `AudioRecord`-ul, deci nu putem nici sa-l legam de microfonul incorporat, nici sa fim
    // siguri cand anume l-a eliberat.
    private AscultareMicrofon ascultare;
    // Despachetarea modelului e asincrona: fara steagul asta, doua comenzi apropiate pornesc
    // doua motoare, amandoua cer microfonul, si una primeste liniste. Verificarea pe
    // `ascultare != null` nu ajunge - la a doua comanda, prima inca nu l-a creat.
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
        // Eliberarea rutei se face DOAR pe oprirea de tot, nu si in `opresteTrezirea()`:
        // trezirea se opreste si la inceputul unui apel, iar atunci ruta de convorbire tocmai
        // se stabileste — am rupe-o exact cand incepe sa fie folosita.
        elibereazaRutaAudio();
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
        elibereazaRutaAudio();
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

                    // Legătura asta era, până acum, într-un singur sens: serverul anunța, telefonul
                    // asculta. O COMANDĂ e altceva — cere o acțiune și vrea să știe dacă a mers,
                    // altfel asistentul ar spune „am trimis mesajul" fără să aibă de unde ști.
                    if (tip.startsWith("whatsapp_")) {
                        handler.post(() -> executaComandaWhatsapp(ws, ev));
                        return;
                    }

                    if ("suna".equals(tip)) {
                        handler.post(() -> executaApel(ws, ev));
                        return;
                    }

                    if ("deschide".equals(tip)) {
                        handler.post(() -> executaDeschidere(ws, ev));
                        return;
                    }

                    String titlu = ev.optString("titlu", "Jarvis");
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

    // ─── WhatsApp ──────────────────────────────────────────────────────────────────────────

    private void executaComandaWhatsapp(WebSocket ws, JSONObject comanda) {
        String id = comanda.optString("id", "");
        String text = comanda.optString("text", "");
        String motiv;

        if ("whatsapp_raspunde".equals(comanda.optString("tip"))) {
            motiv = WhatsAppListener.raspunde(this, comanda.optString("cheie", ""), text);
        } else {
            motiv = deschideWhatsapp(comanda.optString("numar", ""), text);
        }

        confirma(ws, id, motiv == null, motiv);
    }

    private void confirma(WebSocket ws, String id, boolean ok, String motiv) {
        confirma(ws, id, ok, motiv, null);
    }

    /**
     * Confirmarea poate duce si DATE inapoi, nu doar da/nu: un apel catre un nume care apare de
     * mai multe ori in agenda intoarce variantele, ca asistentul sa intrebe pe care sa sune.
     */
    private void confirma(WebSocket ws, String id, boolean ok, String motiv, JSONObject date) {
        if (id.isEmpty()) return;
        try {
            JSONObject raspuns = new JSONObject();
            raspuns.put("raspuns_la", id);
            raspuns.put("ok", ok);
            if (motiv != null) raspuns.put("motiv", motiv);
            if (date != null) raspuns.put("date", date);
            ws.send(raspuns.toString());
        } catch (Exception e) {
            Log.e(TAG, "Confirmare netrimisa", e);
        }
    }

    /**
     * Mesaj NOU, către cineva care nu ne-a scris: nu există niciun câmp de răspuns de folosit,
     * deci se deschide WhatsApp cu textul deja scris. Android nu lasă o aplicație să apese
     * butonul de trimitere al alteia — asta nu e o lipsă din cod, e regula sistemului.
     */
    private String deschideWhatsapp(String numar, String text) {
        String curat = numar.replaceAll("[^0-9]", "");
        if (curat.isEmpty()) return "Numărul nu e valid.";

        try {
            Uri adresa = Uri.parse(
                "https://wa.me/" + curat + "?text=" + URLEncoder.encode(text, "UTF-8")
            );
            Intent intent = new Intent(Intent.ACTION_VIEW, adresa);
            intent.setPackage("com.whatsapp"); // altfel se poate deschide browserul
            intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

            // Aceeași interdicție ca la „Jarvis": un serviciu din fundal nu poate deschide o
            // aplicație. Cu „Afișare peste alte aplicații" acordată, poate.
            if (android.provider.Settings.canDrawOverlays(this)) {
                startActivity(intent);
                return null;
            }

            // Fără ea, atât se poate: o notificare pe care o apeși.
            PendingIntent intentie = PendingIntent.getActivity(
                this, 3, intent, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
            );
            Notification.Builder b = new Notification.Builder(this, CANAL_SUNA)
                .setContentTitle("Mesaj WhatsApp pregătit")
                .setContentText(text)
                .setSmallIcon(android.R.drawable.ic_dialog_email)
                .setContentIntent(intentie)
                .setAutoCancel(true);
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.notify(4713, b.build());
            return null;
        } catch (android.content.ActivityNotFoundException e) {
            return "WhatsApp nu e instalat pe telefon.";
        } catch (Exception e) {
            Log.e(TAG, "Deschidere WhatsApp esuata", e);
            return "Nu am putut deschide WhatsApp: " + e.getMessage();
        }
    }

    // ─── Deschiderea altei aplicații ───────────────────────────────────────────────────────

    /**
     * „Deschide-mi Spotify." Aceeași interdicție ca peste tot: un serviciu din fundal nu poate
     * porni o activitate. Cu „Afișare peste alte aplicații" acordată, poate — fără ea, rămâne
     * o notificare pe care o apeși.
     */
    private void executaDeschidere(WebSocket ws, JSONObject comanda) {
        String pachet = comanda.optString("pachet", "");
        String uri = comanda.optString("uri", "");
        String eticheta = comanda.optString("eticheta", "aplicația");
        String motiv = null;

        try {
            Intent intent;
            if (!uri.isEmpty()) {
                intent = new Intent(Intent.ACTION_VIEW, Uri.parse(uri));
                if (!pachet.isEmpty()) intent.setPackage(pachet);
            } else {
                intent = getPackageManager().getLaunchIntentForPackage(pachet);
                if (intent == null) motiv = eticheta + " nu e instalată pe telefon.";
            }

            if (motiv == null) {
                intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);

                if (android.provider.Settings.canDrawOverlays(this)) {
                    startActivity(intent);
                } else {
                    PendingIntent intentie = PendingIntent.getActivity(
                        this, 4, intent,
                        PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
                    );
                    Notification.Builder b = new Notification.Builder(this, CANAL_SUNA)
                        .setContentTitle("Deschide " + eticheta)
                        .setContentText("Atinge ca să deschizi.")
                        .setSmallIcon(android.R.drawable.ic_media_play)
                        .setContentIntent(intentie)
                        .setAutoCancel(true);
                    NotificationManager nm = getSystemService(NotificationManager.class);
                    if (nm != null) nm.notify(4714, b.build());
                }
            }
        } catch (android.content.ActivityNotFoundException e) {
            motiv = eticheta + " nu e instalată pe telefon.";
        } catch (Exception e) {
            Log.e(TAG, "Deschidere esuata", e);
            motiv = "Nu am putut deschide " + eticheta + ": " + e.getMessage();
        }

        confirma(ws, comanda.optString("id", ""), motiv == null, motiv);
    }

    // ─── Apel telefonic ────────────────────────────────────────────────────────────────────

    /**
     * „Sună-l pe tata."
     *
     * Numele se caută în agenda telefonului, nu pe server: agenda nu pleacă nicăieri, iar
     * Worker-ul n-are nevoie să știe pe cine cunoști. Trimite doar numele rostit; telefonul
     * răspunde cu ce a găsit.
     *
     * Dacă ies mai mulți oameni cu același nume, NU alegem noi. Un apel dat din greșeală
     * persoanei nepotrivite nu se poate lua înapoi — întoarcem variantele și întreabă asistentul.
     */
    private void executaApel(WebSocket ws, JSONObject comanda) {
        String id = comanda.optString("id", "");
        String nume = comanda.optString("nume", "").trim();
        String numar = comanda.optString("numar", "").trim();

        if (numar.isEmpty() && !nume.isEmpty()) {
            if (checkSelfPermission(android.Manifest.permission.READ_CONTACTS)
                != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                confirma(ws, id, false,
                    "Nu am acces la agendă. Deschide aplicația o dată ca să dai permisiunea, "
                        + "sau spune-mi direct numărul.", null);
                return;
            }

            java.util.List<String[]> gasite = cautaInAgenda(nume);

            if (gasite.isEmpty()) {
                confirma(ws, id, false, "N-am găsit pe nimeni cu numele ăsta în agendă.", null);
                return;
            }

            if (gasite.size() > 1) {
                try {
                    org.json.JSONArray variante = new org.json.JSONArray();
                    for (String[] contact : gasite) {
                        JSONObject v = new JSONObject();
                        v.put("nume", contact[0]);
                        v.put("numar", contact[1]);
                        variante.put(v);
                    }
                    JSONObject date = new JSONObject();
                    date.put("variante", variante);
                    confirma(ws, id, false, "Sunt mai mulți cu numele ăsta.", date);
                } catch (Exception e) {
                    confirma(ws, id, false, "Sunt mai mulți cu numele ăsta.", null);
                }
                return;
            }

            nume = gasite.get(0)[0];
            numar = gasite.get(0)[1];
        }

        String curat = numar.replaceAll("[^0-9+]", "");
        if (curat.isEmpty()) {
            confirma(ws, id, false, "Numărul nu e valid.", null);
            return;
        }

        da(ws, id, nume, curat);
    }

    /**
     * Contactele care se potrivesc cu numele rostit.
     *
     * `CONTENT_FILTER_URI` caută deja „începe cu" pe nume și pe inițiale, adică exact felul în
     * care spui un nume cu voce tare. Dedublăm pe număr: un contact cu același număr salvat și
     * la „mobil", și la „acasă" ar apărea de două ori și ar părea două persoane diferite.
     */
    private java.util.List<String[]> cautaInAgenda(String nume) {
        java.util.List<String[]> gasite = new java.util.ArrayList<>();
        java.util.Set<String> vazute = new java.util.HashSet<>();

        android.net.Uri cautare = android.net.Uri.withAppendedPath(
            android.provider.ContactsContract.CommonDataKinds.Phone.CONTENT_FILTER_URI,
            android.net.Uri.encode(nume)
        );

        try (android.database.Cursor c = getContentResolver().query(
            cautare,
            new String[]{
                android.provider.ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
                android.provider.ContactsContract.CommonDataKinds.Phone.NUMBER,
            },
            null, null, null
        )) {
            if (c == null) return gasite;
            while (c.moveToNext()) {
                String numeGasit = c.getString(0);
                String numarGasit = c.getString(1);
                if (numarGasit == null) continue;
                String cheie = numarGasit.replaceAll("[^0-9]", "");
                if (cheie.isEmpty() || !vazute.add(cheie)) continue;
                gasite.add(new String[]{ numeGasit == null ? nume : numeGasit, numarGasit });
            }
        } catch (Exception e) {
            Log.e(TAG, "Cautare in agenda esuata", e);
        }

        return gasite;
    }

    /**
     * Apelul propriu-zis. Două trepte, pentru că Androidul cere două lucruri diferite:
     *
     *   CALL_PHONE  → `ACTION_CALL`, apelul pleacă singur.
     *   fără ea     → `ACTION_DIAL`, se deschide tastatura cu numărul scris și apeși tu.
     *
     * A doua nu e o eroare — e cea mai bună variantă permisă. Se raportează ca atare
     * (`pornit: false`), ca asistentul să nu spună „am sunat" când de fapt n-a sunat.
     */
    private void da(WebSocket ws, String id, String nume, String numar) {
        boolean poateSunaSingur =
            checkSelfPermission(android.Manifest.permission.CALL_PHONE)
                == android.content.pm.PackageManager.PERMISSION_GRANTED;

        Intent intent = new Intent(
            poateSunaSingur ? Intent.ACTION_CALL : Intent.ACTION_DIAL,
            Uri.parse("tel:" + Uri.encode(numar))
        );
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

        try {
            JSONObject date = new JSONObject();
            date.put("nume", nume);
            date.put("numar", numar);

            // Aceeași interdicție ca peste tot: un serviciu din fundal nu poate porni o
            // activitate. Cu „Afișare peste alte aplicații", poate.
            if (android.provider.Settings.canDrawOverlays(this)) {
                startActivity(intent);
                date.put("pornit", poateSunaSingur);
                confirma(ws, id, true, null, date);
                return;
            }

            PendingIntent intentie = PendingIntent.getActivity(
                this, 5, intent, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
            );
            Notification.Builder b = new Notification.Builder(this, CANAL_SUNA)
                .setContentTitle("Sună pe " + (nume == null || nume.isEmpty() ? numar : nume))
                .setContentText("Atinge ca să pornești apelul.")
                .setSmallIcon(android.R.drawable.ic_menu_call)
                .setContentIntent(intentie)
                .setAutoCancel(true);
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.notify(4715, b.build());

            date.put("pornit", false);
            confirma(ws, id, true, null, date);
        } catch (Exception e) {
            Log.e(TAG, "Apel esuat", e);
            confirma(ws, id, false, "Nu am putut porni apelul: " + e.getMessage(), null);
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
        if (ascultare != null || trezireInCurs) return;
        trezireInCurs = true;

        StorageService.unpack(this, "model-en", "model", (Model m) -> {
            model = m;
            try {
                // Gramatică închisă: recunoaștem DOAR cuvântul de trezire, restul cade în [unk].
                // Asta e diferența dintre a rula un dicționar de zeci de mii de cuvinte și a
                // căuta unul singur — de zeci de ori mai puțin procesor, deci și baterie.
                String gramatica = "[\"jarvis\", \"[unk]\"]";
                Recognizer rec = new Recognizer(model, 16000.0f, gramatica);
                // Fără asta, rezultatul e doar text, fără încrederea fiecărui cuvânt — adică
                // exact informația pe care se sprijină filtrul din `FiltruTrezire`.
                rec.setWords(true);
                ascultare = new AscultareMicrofon(rec);
                ascultare.start();
                Log.i(TAG, "Cuvant de trezire pornit");
            } catch (Exception e) {
                Log.e(TAG, "Nu pot porni trezirea", e);
                ascultare = null;
            } finally {
                trezireInCurs = false;
            }
        }, (java.io.IOException e) -> {
            trezireInCurs = false;
            Log.e(TAG, "Model indisponibil", e);
        });
    }

    /**
     * Oprirea e SINCRONĂ, și ăsta e tot rostul rescrierii.
     *
     * Varianta veche (`SpeechService.stop()` + `shutdown()` din Vosk) se întorcea înainte ca
     * firul de recunoaștere să fi ieșit din `read()`, deci microfonul mai rămânea prins o
     * vreme. Pentru un buton pe care scrie „Oprește", „aproape oprit" nu e un răspuns: cât timp
     * microfonul e deschis, sistemul are motiv să țină ruta audio pe profilul de convorbire.
     *
     * Aici se așteaptă efectiv ieșirea firului. Ruta audio se pune la loc separat, în
     * `elibereazaRutaAudio()`, chemată doar la oprirea de tot.
     */
    private void opresteTrezirea() {
        trezireInCurs = false;
        if (ascultare != null) {
            ascultare.opresteAcum();
            ascultare = null;
        }
        if (model != null) {
            model.close();
            model = null;
        }
    }

    /**
     * Pune la loc ruta audio, dacă a rămas pe profilul de convorbire.
     *
     * De ce e nevoie, deși nu noi am cerut ruta: cât timp un microfon e deschis, Android poate
     * comuta căștile Bluetooth de pe A2DP (muzică — volum fin, 15-25 de trepte) pe HFP/SCO
     * (convorbire — 5-7 trepte). Comutarea NU se desface singură când microfonul se închide:
     * așteaptă următoarea renegociere, care poate veni peste minute bune. Se aude exact așa:
     * ai apăsat „Oprește", n-a mers, iar mai târziu s-a reparat de la sine.
     *
     * Un apel telefonic real (`MODE_IN_CALL`) nu se atinge — acolo ruta e a sistemului.
     */
    private void elibereazaRutaAudio() {
        AudioManager audio = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
        if (audio == null) return;

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                // Înlocuitorul modern al lui `stopBluetoothSco`: rupe legătura de convorbire
                // fără să ne atingem de modul audio al telefonului.
                audio.clearCommunicationDevice();
            } else if (audio.isBluetoothScoOn()) {
                audio.setBluetoothScoOn(false);
                audio.stopBluetoothSco();
            }

            if (audio.getMode() == AudioManager.MODE_IN_COMMUNICATION) {
                audio.setMode(AudioManager.MODE_NORMAL);
            }
        } catch (Exception e) {
            // Unele telefoane refuză una dintre ele; nu e motiv să cadă oprirea.
            Log.w(TAG, "Nu am putut elibera ruta audio", e);
        }
    }

    /**
     * Firul care ascultă microfonul după „Jarvis".
     *
     * Scris de mână în loc de `SpeechService` din Vosk pentru două lucruri pe care acela nu le
     * lasă, fiindcă nu-și expune `AudioRecord`-ul:
     *
     *   1. MICROFONUL E FIXAT PE CEL AL TELEFONULUI. Fără asta, cu căști Bluetooth conectate,
     *      Android mută captura pe microfonul căștilor — iar ca s-o facă, le comută de pe
     *      profilul de muzică pe cel de convorbire. Ce se aude: muzica trece prin volumul de
     *      convorbire, care are 5-7 trepte în loc de 20, adică „mut la zero, maxim la o
     *      liniuță". Legat de microfonul încorporat, sistemul n-are de ce să atingă căștile.
     *
     *   2. OPRIRE SINCRONĂ. Ținem noi `AudioRecord`-ul, deci știm exact când s-a eliberat.
     *
     * Rezultatele PARȚIALE nu se citesc deliberat (`getPartialResult`). Ele sunt cele mai
     * grăbite ipoteze ale recognizerului, dinainte să audă sfârșitul rostirii, și nu poartă
     * nicio măsură a încrederii — pe ele se declanșa aplicația singură. Costul: aplicația se
     * deschide după ce TACI, nu în timp ce rostești. O jumătate de secundă, plătită o dată.
     */
    private final class AscultareMicrofon extends Thread {
        private final Recognizer recognizer;
        private final AudioRecord recorder;
        private final short[] tampon;
        private volatile boolean ruleaza = true;

        AscultareMicrofon(Recognizer recognizer) {
            super("trezire-jarvis");
            this.recognizer = recognizer;

            int minim = AudioRecord.getMinBufferSize(
                16000, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT
            );
            // Tamponul sistemului e minimul absolut; luăm dublul, ca o întârziere de planificare
            // să nu însemne eșantioane pierdute — care se aud ca un „Jarvis" ratat.
            int marime = Math.max(minim * 2, 16000 * 2 / 5);

            recorder = new AudioRecord(
                // VOICE_RECOGNITION, nu VOICE_COMMUNICATION: primul e calea de dictare, al
                // doilea e calea de telefon — și aia chiar cere ruta de convorbire.
                MediaRecorder.AudioSource.VOICE_RECOGNITION,
                16000,
                AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT,
                marime
            );
            legLaMicrofonulTelefonului();

            // O zecime de secundă per citire: destul de rar cât să nu coste, destul de des cât
            // oprirea să se simtă instantanee.
            tampon = new short[1600];
        }

        /** Motivul 1 din comentariul clasei — aici se întâmplă efectiv. */
        private void legLaMicrofonulTelefonului() {
            AudioManager audio = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
            if (audio == null) return;
            for (AudioDeviceInfo dispozitiv : audio.getDevices(AudioManager.GET_DEVICES_INPUTS)) {
                if (dispozitiv.getType() == AudioDeviceInfo.TYPE_BUILTIN_MIC) {
                    boolean legat = recorder.setPreferredDevice(dispozitiv);
                    Log.i(TAG, "Microfon incorporat: " + (legat ? "legat" : "refuzat de sistem"));
                    return;
                }
            }
        }

        @Override
        public void run() {
            try {
                if (recorder.getState() != AudioRecord.STATE_INITIALIZED) {
                    Log.e(TAG, "Microfonul nu s-a initializat");
                    return;
                }
                recorder.startRecording();

                while (ruleaza) {
                    int citite = recorder.read(tampon, 0, tampon.length);
                    if (citite <= 0) continue;
                    if (recognizer.acceptWaveForm(tampon, citite)) {
                        verificaRostirea(recognizer.getResult());
                    }
                }
            } catch (Exception e) {
                Log.e(TAG, "Ascultarea a cazut", e);
            }
        }

        void opresteAcum() {
            ruleaza = false;
            // `stop()` întâi: deblochează `read()` pe loc, altfel firul ar mai aștepta până se
            // umple tamponul. Se poate chema din alt fir, e documentat ca sigur.
            try {
                if (recorder.getState() == AudioRecord.STATE_INITIALIZED) recorder.stop();
            } catch (Exception e) {
                Log.w(TAG, "stop() a esuat", e);
            }
            try {
                join(2000);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            recorder.release();
            recognizer.close();
            Log.i(TAG, "Microfon eliberat");
        }
    }

    /**
     * Filtrul care decide daca ce s-a auzit e chiar o chemare. Primeste rezultatele FINALE
     * din bucla de captura (`AscultareMicrofon`), niciodata pe cele partiale.
     */
    private final FiltruTrezire filtru = new FiltruTrezire();

    private void verificaRostirea(String json) {
        filtru.verifica(json);
    }

    private final class FiltruTrezire {
        private long ultimaDeclansare = 0;

        private void verifica(String json) {
            if (json == null) return;
            try {
                JSONObject rezultat = new JSONObject(json);
                String rostit = rezultat.optString("text", "").toLowerCase().trim();
                if (rostit.isEmpty()) return;

                double incredere = increderePentruTrezire(rezultat);
                if (incredere < 0) return; // cuvântul nu e acolo deloc

                if (incredere < PRAG_INCREDERE) {
                    // Logat, nu tăcut: dacă vreodată „Jarvis" pare că nu mai răspunde, aici se
                    // vede de ce, și cu cât trebuie coborât pragul.
                    Log.i(TAG, "Ignorat (incredere " + String.format("%.2f", incredere) + "): " + rostit);
                    return;
                }

                // Recognizerul poate scoate două rezultate finale pentru aceeași rostire (tăcerea de
                // după ea închide încă un segment). Fără răgazul ăsta, un singur „Jarvis" ar
                // deschide aplicația de două ori la rând.
                long acum = System.currentTimeMillis();
                if (acum - ultimaDeclansare < 5000) return;
                ultimaDeclansare = acum;

                Log.i(TAG, "Trezit (incredere " + String.format("%.2f", incredere) + "): " + rostit);
                handler.post(VoiceService.this::deschideAplicatiaPentruApel);
            } catch (Exception e) {
                Log.e(TAG, "Rezultat necitibil", e);
            }
        }

        /**
         * Încrederea celei mai bune potriviri pentru cuvântul de trezire, sau -1 dacă nu apare.
         *
         * Vosk întoarce încrederea per cuvânt în tabloul `result` (de-aia `setWords(true)`).
         * Dacă tabloul lipsește — altă versiune, alt model — cădem pe o regulă strictă: rostirea
         * să fie EXACT cuvântul de trezire. Mai bine ratăm o chemare decât să deschidem aplicația
         * în mijlocul unei conversații care n-avea legătură cu noi.
         */
        private double increderePentruTrezire(JSONObject rezultat) {
            org.json.JSONArray cuvinte = rezultat.optJSONArray("result");
            if (cuvinte == null) {
                return rezultat.optString("text", "").toLowerCase().trim().equals(TREZIRE) ? 1.0 : -1;
            }

            double maxim = -1;
            for (int i = 0; i < cuvinte.length(); i += 1) {
                JSONObject cuvant = cuvinte.optJSONObject(i);
                if (cuvant == null) continue;
                if (!TREZIRE.equals(cuvant.optString("word", "").toLowerCase().trim())) continue;
                maxim = Math.max(maxim, cuvant.optDouble("conf", 0));
            }
            return maxim;
        }

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
            CANAL_SUNA, "Te caută Jarvis", NotificationManager.IMPORTANCE_HIGH
        );
        suna.setDescription("Când Jarvis te caută la o oră pe care ai cerut-o tu.");
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
                : "Jarvis te ascultă. Atinge pentru a reveni.")
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
