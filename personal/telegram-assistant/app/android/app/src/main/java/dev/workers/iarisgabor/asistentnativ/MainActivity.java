package dev.workers.iarisgabor.asistentnativ;

import android.content.Context;
import android.content.Intent;
import android.media.AudioManager;
import android.os.Bundle;
import android.view.KeyEvent;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Înregistrat ÎNAINTE de super.onCreate: puntea se construiește acolo, iar un plugin
        // adăugat după nu mai e văzut de pagină.
        registerPlugin(VoicePlugin.class);
        super.onCreate(savedInstanceState);
    }

    /**
     * Butoanele de volum, trimise spre fluxul care chiar cântă.
     *
     * Ce se întâmplă de fapt într-un apel, măsurat pe telefon (`dumpsys audio`): de îndată ce
     * microfonul se deschide cu anulare de ecou, Chromium mută ieșirea de pe media pe
     * `USAGE_VOICE_COMMUNICATION`, iar dacă porți căști Bluetooth, sistemul comută ruta pe
     * **SCO** — profilul de convorbire. Vocea lui Jarvis nu trece, în acel moment, prin volumul
     * media DELOC.
     *
     * De-aia a fost greșită și prima încercare de reparație: trimitea apăsările spre
     * `STREAM_MUSIC`, adică spre un flux pe care nu se auzea nimic, și volumul părea blocat.
     *
     * Aici alegem fluxul după starea reală: în apel → STREAM_VOICE_CALL, în rest → STREAM_MUSIC.
     *
     * Merge cât timp aplicația e pe ecran, adică exact când ai mâna pe butoane. Cu apelul în
     * fundal, tastele se întorc la sistem — care alege oricum aceleași fluxuri.
     */
    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        int cod = event.getKeyCode();
        if (cod != KeyEvent.KEYCODE_VOLUME_UP && cod != KeyEvent.KEYCODE_VOLUME_DOWN) {
            return super.dispatchKeyEvent(event);
        }

        // Doar pe apăsare. Repetările lungi vin tot ca ACTION_DOWN, deci ținutul apăsat
        // continuă să regleze, ca de obicei.
        if (event.getAction() == KeyEvent.ACTION_DOWN) {
            AudioManager audio = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
            if (audio != null) {
                audio.adjustStreamVolume(
                    fluxAudibil(audio),
                    cod == KeyEvent.KEYCODE_VOLUME_UP
                        ? AudioManager.ADJUST_RAISE
                        : AudioManager.ADJUST_LOWER,
                    // Arată cursorul obișnuit, ca să vezi unde ești. Fără sunet de clic: s-ar
                    // auzi peste vocea cu care tocmai vorbești.
                    AudioManager.FLAG_SHOW_UI
                );
            }
        }

        // Consumat ȘI la ridicarea degetului: altfel sistemul tratează ACTION_UP singur și mai
        // deschide o dată panoul, pe alt flux decât cel pe care tocmai l-am reglat.
        return true;
    }

    private int fluxAudibil(AudioManager audio) {
        // Intrebam SISTEMUL pe ce ruta e, nu steagul nostru `inApel`. Steagul spune ce crede
        // aplicatia ca face; modul audio si SCO spun pe unde iese sunetul cu adevarat. Cand cele
        // doua nu se potrivesc — apel pornit dar sunetul inca pe media, sau invers — pe steag am
        // regla fluxul gresit, si butoanele ar parea moarte.
        boolean peCaleaDeConvorbire =
            audio.getMode() == AudioManager.MODE_IN_COMMUNICATION || audio.isBluetoothScoOn();
        if (!peCaleaDeConvorbire) return AudioManager.STREAM_MUSIC;

        // Și cu căști Bluetooth tot ăsta e fluxul corect. Ruta de convorbire e SCO, iar volumul
        // ei ar fi `STREAM_BLUETOOTH_SCO` — dar constanta aia e API ascuns, și oricum sistemul
        // o aliază la STREAM_VOICE_CALL. Fluxul ține un index separat pentru fiecare rută
        // (căști, difuzor, cască), deci reglarea nimerește exact ruta activă.
        return AudioManager.STREAM_VOICE_CALL;
    }

    /**
     * Activitatea e `singleTask`: când „Jarvis" o readuce în față, NU se creează din nou —
     * primește intenția nouă aici. Fără `setIntent`, `getIntent()` continuă să întoarcă
     * intenția cu care a fost pornită prima dată, iar steagul „am fost chemată" nu ajunge
     * niciodată la pagină: aplicația se deschide, dar apelul nu pornește.
     */
    @Override
    protected void onNewIntent(Intent intent) {
        setIntent(intent);
        super.onNewIntent(intent);
    }
}
