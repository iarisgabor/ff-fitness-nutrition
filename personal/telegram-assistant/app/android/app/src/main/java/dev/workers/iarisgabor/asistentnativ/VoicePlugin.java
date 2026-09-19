package dev.workers.iarisgabor.asistentnativ;

import android.Manifest;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.provider.Settings;
import android.text.TextUtils;
import android.webkit.PermissionRequest;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * Puntea dintre pagină și Android. Din JavaScript:
 *
 *   Capacitor.Plugins.Apel.porneste()            // apelul supraviețuiește ieșirii din aplicație
 *   Capacitor.Plugins.Apel.opreste()
 *   Capacitor.Plugins.Apel.staDeVeghe({ token })  // cuvânt de trezire + poate fi sunat
 *   Capacitor.Plugins.Apel.cheamatDeTrezire()     // a fost deschisă prin „Jarvis" sau prin apel?
 *   Capacitor.Plugins.Apel.stareWhatsapp()        // are acces la notificări?
 *   Capacitor.Plugins.Apel.cereAccesWhatsapp()    // deschide ecranul din Setări unde se dă
 *   Capacitor.Plugins.Apel.deschideSetarileAplicatiei()  // pentru microfonul refuzat
 *   Capacitor.Plugins.Apel.vibra({ tip })         // „inceput" / „sfarsit" de apel
 *
 * Conversația (microfon, WebSocket, redare) rămâne în pagină, exact ca pe web. Pluginul nu
 * duplică nimic din asta — cere permisiunile și pornește serviciul.
 */
@CapacitorPlugin(
    name = "Apel",
    permissions = {
        @Permission(alias = "microfon", strings = { Manifest.permission.RECORD_AUDIO }),
        @Permission(alias = "notificari", strings = { Manifest.permission.POST_NOTIFICATIONS }),
        // Ca sa poata suna pe cineva la cerere: apelul propriu-zis + cautarea numelui in agenda.
        // Refuzul NU e fatal — fara ele se deschide doar tastatura cu numarul, sau i se cere
        // omului numarul in loc de nume (vezi executaApel din VoiceService).
        @Permission(
            alias = "telefon",
            strings = { Manifest.permission.CALL_PHONE, Manifest.permission.READ_CONTACTS }
        )
    }
)
public class VoicePlugin extends Plugin {

    private String tokenSalvat;
    private boolean cuVeghe = false;

    @Override
    public void load() {
        // WebView-ul cere separat dreptul de a folosi microfonul, chiar dacă aplicația îl are
        // deja de la Android. Fără asta, getUserMedia eșuează tăcut în pagină — exact genul de
        // eroare care te face să crezi că e stricat codul de captură.
        bridge.getWebView().setWebChromeClient(
            new com.getcapacitor.BridgeWebChromeClient(bridge) {
                @Override
                public void onPermissionRequest(final PermissionRequest request) {
                    getActivity().runOnUiThread(() -> request.grant(request.getResources()));
                }
            }
        );
    }

    @PluginMethod
    public void porneste(PluginCall call) {
        String token = call.getString("token");
        if (token != null && !token.isEmpty()) tokenSalvat = token;
        cuVeghe = false;
        ceriApoiPorneste(call);
    }

    /** Veghe permanentă: ascultă după „Jarvis" și ține legătura prin care poate fi sunat. */
    @PluginMethod
    public void staDeVeghe(PluginCall call) {
        String token = call.getString("token");
        if (token != null && !token.isEmpty()) tokenSalvat = token;
        cuVeghe = true;
        ceriApoiPorneste(call);
    }

    private void ceriApoiPorneste(PluginCall call) {
        // Microfonul întâi: un serviciu de tip „microphone" pornit fără permisiune e oprit
        // imediat de sistem, cu o excepție greu de citit în loguri.
        if (getPermissionState("microfon") != PermissionState.GRANTED) {
            requestPermissionForAlias("microfon", call, "dupaMicrofon");
            return;
        }
        ceriNotificari(call);
    }

    @PermissionCallback
    private void dupaMicrofon(PluginCall call) {
        if (getPermissionState("microfon") != PermissionState.GRANTED) {
            call.reject("Fără acces la microfon nu pot ține apelul în fundal.");
            return;
        }
        ceriNotificari(call);
    }

    private void ceriNotificari(PluginCall call) {
        // De la Android 13, notificarea permanentă a serviciului cere permisiune explicită.
        // Fără ea serviciul pornește, dar utilizatorul nu vede nimic — și nici nu poate fi sunat.
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notificari") != PermissionState.GRANTED) {
            requestPermissionForAlias("notificari", call, "dupaNotificari");
            return;
        }
        ceriTelefon(call);
    }

    @PermissionCallback
    private void dupaNotificari(PluginCall call) {
        ceriTelefon(call); // refuzul nu e fatal: apelul merge, doar nu poate fi chemat
    }

    private void ceriTelefon(PluginCall call) {
        if (getPermissionState("telefon") != PermissionState.GRANTED) {
            requestPermissionForAlias("telefon", call, "dupaTelefon");
            return;
        }
        pornesteServiciul(call);
    }

    @PermissionCallback
    private void dupaTelefon(PluginCall call) {
        // Si daca a refuzat: restul asistentului functioneaza intreg. Doar apelurile date de el
        // raman pe varianta „deschid tastatura, apesi tu".
        pornesteServiciul(call);
    }

    private void pornesteServiciul(PluginCall call) {
        Intent intent = new Intent(getContext(), VoiceService.class);
        intent.setAction(cuVeghe ? VoiceService.ACTION_VEGHE : VoiceService.ACTION_APEL);
        if (tokenSalvat != null) intent.putExtra(VoiceService.EXTRA_TOKEN, tokenSalvat);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getContext().startForegroundService(intent);
        } else {
            getContext().startService(intent);
        }

        JSObject raspuns = new JSObject();
        raspuns.put("pornit", true);
        raspuns.put("veghe", cuVeghe);
        call.resolve(raspuns);
    }

    /**
     * Sfarsitul unui apel. NU opreste serviciul: se intoarce in veghe, altfel „Jarvis" ar
     * functiona o singura data, pana la primul apel. Oprirea completa se face din butonul
     * „Opreste" al notificarii permanente.
     */
    @PluginMethod
    public void opreste(PluginCall call) {
        Intent intent = new Intent(getContext(), VoiceService.class);
        intent.setAction(VoiceService.ACTION_VEGHE);
        if (tokenSalvat != null) intent.putExtra(VoiceService.EXTRA_TOKEN, tokenSalvat);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getContext().startForegroundService(intent);
        } else {
            getContext().startService(intent);
        }

        JSObject raspuns = new JSObject();
        raspuns.put("pornit", false);
        raspuns.put("veghe", true);
        call.resolve(raspuns);
    }

    /**
     * Are aplicația voie să citească notificările? De asta depinde tot ce ține de WhatsApp.
     * Se citește din lista sistemului, nu dintr-un steag al nostru: utilizatorul poate retrage
     * accesul oricând din Setări, fără ca aplicația să afle.
     */
    @PluginMethod
    public void stareWhatsapp(PluginCall call) {
        JSObject raspuns = new JSObject();
        raspuns.put("acces", areAccesLaNotificari());
        call.resolve(raspuns);
    }

    /**
     * Deschide ecranul din Setări de unde se acordă accesul. NU se poate cere printr-un dialog:
     * Android tratează citirea notificărilor ca pe o permisiune specială, care se dă doar
     * manual, din Setări — și bine face.
     */
    @PluginMethod
    public void cereAccesWhatsapp(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
            intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Nu am putut deschide setările de notificări.");
        }
    }

    private boolean areAccesLaNotificari() {
        String activate = Settings.Secure.getString(
            getContext().getContentResolver(), "enabled_notification_listeners"
        );
        if (TextUtils.isEmpty(activate)) return false;

        ComponentName al_nostru = new ComponentName(getContext(), WhatsAppListener.class);
        for (String intrare : activate.split(":")) {
            ComponentName c = ComponentName.unflattenFromString(intrare);
            if (c != null && c.equals(al_nostru)) return true;
        }
        return false;
    }

    /**
     * Deschide ecranul de detalii al APLICAȚIEI din Setări (de unde se dau permisiunile).
     *
     * De ce nu `requestPermissionForAlias("microfon")`: odată ce Android a înregistrat un refuz,
     * cererea se întoarce respinsă FĂRĂ să arate vreun dialog. Pagina ar reîncerca la nesfârșit
     * și omul ar vedea mereu același mesaj, fără nicio cale înainte. Aceeași formă ca la accesul
     * la notificări (cereAccesWhatsapp), din alt motiv: acolo dialogul nu există, aici a fost deja
     * consumat.
     *
     * Notă: WebView-ul nu e cel care refuză — `load()` de mai sus îi aprobă automat cererile;
     * refuzul e la nivel de Android, pe RECORD_AUDIO, deci ecranul ăsta e destinația corectă.
     */
    @PluginMethod
    public void deschideSetarileAplicatiei(PluginCall call) {
        try {
            Intent intent = new Intent(
                Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                Uri.fromParts("package", getContext().getPackageName(), null)
            );
            intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Nu am putut deschide setările aplicației.");
        }
    }

    /**
     * O pulsație scurtă, ca să știi ce s-a întâmplat fără să te uiți la ecran — telefonul e des
     * în buzunar sau în suport, în mașină.
     *
     * DOUĂ tipare, nu unul: un bâzâit identic spune că S-A ÎNTÂMPLAT ceva, nu CE s-a întâmplat,
     * iar tocmai asta e informația („a pornit" vs „s-a închis").
     *
     * Scris de mână în loc de @capacitor/haptics: proiectul n-are azi niciun plugin npm
     * (capacitor.plugins.json e gol), iar primul ar aduce un subproiect Gradle și o dependență
     * nouă pentru 40 de milisecunde de vibrație. Aici intră în aceeași punte ca restul, deci
     * pagina o poate folosi cu aceeași verificare „există metoda?" ca la toate celelalte.
     */
    @PluginMethod
    public void vibra(PluginCall call) {
        String tip = call.getString("tip", "inceput");
        try {
            Vibrator vibrator;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                VibratorManager manager =
                    (VibratorManager) getContext().getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
                vibrator = manager == null ? null : manager.getDefaultVibrator();
            } else {
                vibrator = (Vibrator) getContext().getSystemService(Context.VIBRATOR_SERVICE);
            }

            if (vibrator == null || !vibrator.hasVibrator()) {
                call.resolve();
                return;
            }

            if ("sfarsit".equals(tip)) {
                // Două scurte: „s-a terminat". Primul 0 e pauza dinainte, cerută de API.
                vibrator.vibrate(VibrationEffect.createWaveform(new long[] { 0, 25, 60, 25 }, -1));
            } else {
                vibrator.vibrate(VibrationEffect.createOneShot(40, VibrationEffect.DEFAULT_AMPLITUDE));
            }
            call.resolve();
        } catch (Exception e) {
            // O vibrație ratată nu e un motiv să pice nimic — apelul merge mai departe fără ea.
            call.resolve();
        }
    }

    /** Cheia de acces, împachetată în aplicație (res/values/token.xml). Pagina o cere la
     *  pornire, ca utilizatorul să nu o mai introducă după fiecare instalare. */
    @PluginMethod
    public void cheie(PluginCall call) {
        JSObject raspuns = new JSObject();
        raspuns.put("token", getContext().getString(R.string.voice_token));
        call.resolve(raspuns);
    }

    /**
     * A fost aplicația deschisă de cuvântul de trezire sau de un apel? Pagina întreabă la
     * pornire ca să sune direct, fără să mai apeși. Steagul se consumă la citire: altfel, orice
     * revenire ulterioară în aplicație ar reporni apelul de la sine.
     */
    @PluginMethod
    public void cheamatDeTrezire(PluginCall call) {
        boolean cerut = getActivity().getIntent() != null
            && getActivity().getIntent().getBooleanExtra(VoiceService.EXTRA_AUTO_APEL, false);
        if (cerut) getActivity().getIntent().removeExtra(VoiceService.EXTRA_AUTO_APEL);

        JSObject raspuns = new JSObject();
        raspuns.put("da", cerut);
        call.resolve(raspuns);
    }
}
