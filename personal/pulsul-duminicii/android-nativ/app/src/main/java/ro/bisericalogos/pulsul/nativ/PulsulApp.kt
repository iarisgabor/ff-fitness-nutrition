package ro.bisericalogos.pulsul.nativ

import android.app.Application
import ro.bisericalogos.pulsul.nativ.data.Graph

class PulsulApp : Application() {
    override fun onCreate() {
        super.onCreate()
        graph = Graph(this)
    }

    companion object {
        lateinit var graph: Graph
            private set
    }
}
