package dev.workers.iarisgabor.asistentnativ;

import android.Manifest;
import android.content.Intent;
import android.os.Build;
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
 *
 * Conversația (microfon, WebSocket, redare) rămâne în pagină, exact ca pe web. Pluginul nu
 * duplică nimic din asta — cere permisiunile și pornește serviciul.
 */
@CapacitorPlugin(
    name = "Apel",
    permissions = {
        @Permission(alias = "microfon", strings = { Manifest.permission.RECORD_AUDIO }),
        @Permission(alias = "notificari", strings = { Manifest.permission.POST_NOTIFICATIONS })
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
        pornesteServiciul(call);
    }

    @PermissionCallback
    private void dupaNotificari(PluginCall call) {
        pornesteServiciul(call); // refuzul nu e fatal: apelul merge, doar nu poate fi chemat
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
