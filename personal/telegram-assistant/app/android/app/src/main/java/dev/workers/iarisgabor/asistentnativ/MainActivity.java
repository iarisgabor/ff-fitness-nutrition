package dev.workers.iarisgabor.asistentnativ;

import android.content.Intent;
import android.os.Bundle;
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
