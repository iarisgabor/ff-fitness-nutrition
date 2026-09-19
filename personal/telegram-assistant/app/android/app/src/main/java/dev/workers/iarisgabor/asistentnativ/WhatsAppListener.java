package dev.workers.iarisgabor.asistentnativ;

import android.app.Notification;
import android.app.PendingIntent;
import android.app.RemoteInput;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.os.Parcelable;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import android.util.Log;

import androidx.annotation.NonNull;

import org.json.JSONObject;

import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.TimeUnit;

import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;

/**
 * WhatsApp, prin notificări.
 *
 * WhatsApp nu are API pentru contul tău personal. Ce are, în schimb, e exact ce vezi în bara de
 * notificări: cine ți-a scris, ce a scris, și un câmp de răspuns direct acolo. Serviciul ăsta
 * citește aceleași notificări și folosește același câmp de răspuns — nimic neoficial, nimic
 * ținut pornit pe un server, niciun risc de blocare a numărului.
 *
 * Ce înseamnă asta, ca limite (sunt ale mecanismului, nu ale codului):
 *   - se văd doar mesajele SOSITE, cât timp telefonul e pornit. Nu există istoric.
 *   - nu se vede ce ai trimis tu.
 *   - se poate răspunde doar într-o conversație care a trimis o notificare încă vie; pentru un
 *     mesaj nou se deschide WhatsApp cu textul pregătit (vezi VoiceService.deschideWhatsapp).
 *
 * Permisiunea („Acces la notificări") se dă o singură dată, manual, din Setări. Android o
 * tratează ca pe una foarte sensibilă și nu o poate cere o aplicație printr-un dialog.
 */
public class WhatsAppListener extends NotificationListenerService {

    private static final String TAG = "WhatsAppListener";
    private static final String GAZDA = "telegram-assistant.iarisgabor.workers.dev";
    private static final MediaType JSON = MediaType.get("application/json; charset=utf-8");

    private static final String[] PACHETE = { "com.whatsapp", "com.whatsapp.w4b" };

    /**
     * Conversație → acțiunea ei de răspuns, din CEA MAI RECENTĂ notificare. Se suprascrie la
     * fiecare mesaj nou: un PendingIntent vechi trimite în firul vechi, sau nu mai trimite deloc.
     */
    private static final Map<String, Notification.Action> RASPUNSURI = new HashMap<>();

    /** Ultimul text trimis spre server, per conversație — vezi dedup-ul din onNotificationPosted. */
    private static final Map<String, String> ULTIMUL = new HashMap<>();

    private static WhatsAppListener instanta;

    private OkHttpClient client;

    @Override
    public void onCreate() {
        super.onCreate();
        instanta = this;
        client = new OkHttpClient.Builder()
            .callTimeout(15, TimeUnit.SECONDS)
            .build();
    }

    @Override
    public void onDestroy() {
        instanta = null;
        super.onDestroy();
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        try {
            proceseaza(sbn);
        } catch (Exception e) {
            Log.e(TAG, "Notificare neprelucrabila", e);
        }
    }

    private void proceseaza(StatusBarNotification sbn) {
        if (!eWhatsApp(sbn.getPackageName())) return;

        Notification n = sbn.getNotification();
        if (n == null || n.extras == null) return;

        // Notificarea-umbrelă („3 mesaje noi din 2 conversații") nu e un mesaj, e un rezumat.
        // Fără filtrul ăsta, asistentul ar citi de fiecare dată un mesaj care nu există.
        if ((n.flags & Notification.FLAG_GROUP_SUMMARY) != 0) return;

        Bundle extras = n.extras;
        String titlu = sirSau(extras.getCharSequence(Notification.EXTRA_TITLE), "");
        String conversatie = sirSau(extras.getCharSequence(Notification.EXTRA_CONVERSATION_TITLE), "");
        String text = sirSau(extras.getCharSequence(Notification.EXTRA_TEXT), "");
        String expeditor = titlu;
        String grup = conversatie;

        // În stilul „conversație", notificarea poartă TOT firul, nu doar mesajul nou — și e
        // repostată la fiecare mesaj. Luăm ultima replică; restul sunt deja trimise.
        Parcelable[] mesaje = extras.getParcelableArray(Notification.EXTRA_MESSAGES);
        if (mesaje != null && mesaje.length > 0) {
            Bundle ultim = (Bundle) mesaje[mesaje.length - 1];
            String t = sirSau(ultim.getCharSequence("text"), "");
            String s = sirSau(ultim.getCharSequence("sender"), "");
            if (!t.isEmpty()) text = t;
            if (!s.isEmpty()) expeditor = s;
            // Într-un grup, titlul e numele grupului, iar expeditorul vine din mesaj.
            if (!grup.isEmpty()) {
                // deja avem numele grupului
            } else if (!titlu.isEmpty() && !titlu.equals(expeditor)) {
                grup = titlu;
            }
        }

        if (text.isEmpty() || expeditor.isEmpty()) return;

        // Zgomotul propriu al WhatsApp: „Se verifică mesajele noi", copii de siguranță, apeluri.
        if (titlu.equalsIgnoreCase("WhatsApp")) return;
        if (text.endsWith("mesaje noi") || text.endsWith("new messages")) return;

        String cheie = !grup.isEmpty() ? grup : expeditor;

        // Butonul de răspuns din notificare. Îl ținem minte ÎNAINTE de dedup: chiar dacă textul
        // e unul deja trimis, acțiunea e proaspătă și ea contează pentru următorul răspuns.
        Notification.Action raspuns = gasesteRaspuns(n);
        if (raspuns != null) RASPUNSURI.put(cheie, raspuns);

        String semnatura = expeditor + "|" + text;
        if (semnatura.equals(ULTIMUL.get(cheie))) return;
        ULTIMUL.put(cheie, semnatura);

        trimiteLaServer(cheie, expeditor, grup, text, raspuns != null);
    }

    private static boolean eWhatsApp(String pachet) {
        for (String p : PACHETE) if (p.equals(pachet)) return true;
        return false;
    }

    private static String sirSau(CharSequence valoare, String implicit) {
        return valoare == null ? implicit : valoare.toString().trim();
    }

    private static Notification.Action gasesteRaspuns(Notification n) {
        if (n.actions == null) return null;
        for (Notification.Action a : n.actions) {
            RemoteInput[] intrari = a.getRemoteInputs();
            if (intrari != null && intrari.length > 0) return a;
        }
        return null;
    }

    private void trimiteLaServer(String cheie, String expeditor, String grup, String text,
                                 boolean poateRaspunde) {
        String token = getString(R.string.voice_token);
        if (token == null || token.isEmpty()) return;

        JSONObject corp = new JSONObject();
        try {
            corp.put("cheie", cheie);
            corp.put("expeditor", expeditor);
            corp.put("grup", grup);
            corp.put("text", text);
            corp.put("poate_raspunde", poateRaspunde);
        } catch (Exception e) {
            return;
        }

        Request cerere = new Request.Builder()
            .url("https://" + GAZDA + "/whatsapp/mesaj?token=" + token)
            .post(RequestBody.create(corp.toString(), JSON))
            .build();

        client.newCall(cerere).enqueue(new okhttp3.Callback() {
            @Override
            public void onFailure(@NonNull okhttp3.Call call, @NonNull java.io.IOException e) {
                // Un mesaj pierdut nu se reîncearcă: până s-ar reface rețeaua, ar fi oricum vechi,
                // iar conversația reală e pe telefon, nu aici.
                Log.w(TAG, "Mesaj netrimis: " + e.getMessage());
            }

            @Override
            public void onResponse(@NonNull okhttp3.Call call, @NonNull Response response) {
                response.close();
            }
        });
    }

    // ─── Răspuns, chemat din VoiceService ──────────────────────────────────────────────────

    /** Există serviciul (adică i s-a dat acces la notificări și Android l-a pornit)? */
    public static boolean pornit() {
        return instanta != null;
    }

    /**
     * Trimite un răspuns în conversația `cheie`, prin câmpul de răspuns al notificării ei.
     * Întoarce null la succes, sau motivul eșecului.
     */
    public static String raspunde(Context context, String cheie, String text) {
        if (instanta == null) {
            return "Aplicația nu are acces la notificări. Pornește-l din Setări → Notificări.";
        }

        Notification.Action actiune = RASPUNSURI.get(cheie);
        if (actiune == null) {
            // Poate a venit sub alt nume (grup vs. persoană); căutăm și parțial, ca la server.
            for (Map.Entry<String, Notification.Action> intrare : RASPUNSURI.entrySet()) {
                if (intrare.getKey().toLowerCase().contains(cheie.toLowerCase())) {
                    actiune = intrare.getValue();
                    break;
                }
            }
        }
        if (actiune == null) {
            return "Nu mai am notificarea conversației, deci nu pot răspunde în ea.";
        }

        try {
            RemoteInput[] intrari = actiune.getRemoteInputs();
            Intent purtator = new Intent();
            Bundle valori = new Bundle();
            for (RemoteInput intrare : intrari) valori.putCharSequence(intrare.getResultKey(), text);
            RemoteInput.addResultsToIntent(intrari, purtator, valori);

            // Fără asta, unele versiuni de WhatsApp tratează răspunsul ca pe unul „din umbră" și
            // îl scriu în notificare fără să-l trimită.
            RemoteInput.setResultsSource(purtator, RemoteInput.SOURCE_FREE_FORM_INPUT);

            actiune.actionIntent.send(context, 0, purtator);
            return null;
        } catch (PendingIntent.CanceledException e) {
            return "Notificarea conversației a expirat.";
        } catch (Exception e) {
            Log.e(TAG, "Raspuns esuat", e);
            return "Nu am putut trimite răspunsul: " + e.getMessage();
        }
    }
}
