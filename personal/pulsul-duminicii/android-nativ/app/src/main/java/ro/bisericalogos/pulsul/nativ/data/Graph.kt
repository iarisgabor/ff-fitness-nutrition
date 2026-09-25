package ro.bisericalogos.pulsul.nativ.data

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import ro.bisericalogos.pulsul.nativ.BuildConfig

// Tot ce e comun ecranelor: sesiunea, API-ul, copia offline, starea rețelei.
class Graph(context: Context) {
    private val appContext = context.applicationContext
    val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    val session = Session(context)
    val cache = OfflineCache(context)

    private val _online = MutableStateFlow(true)
    val online: StateFlow<Boolean> = _online

    // Crește după orice modificare: paginile deja încărcate se reîmprospătează la revenire
    // (echivalentul lui markChanged() de pe site).
    private val _changes = MutableStateFlow(0)
    val changes: StateFlow<Int> = _changes
    fun markChanged() { _changes.value++ }

    private val _expired = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
    val expired: SharedFlow<Unit> = _expired

    // Mesaj scurt jos pe ecran, ca toast() de pe site (2,2 s; erorile 5 s).
    data class ToastMsg(val text: String, val error: Boolean, val id: Long = System.nanoTime())
    private val _toasts = MutableSharedFlow<ToastMsg>(extraBufferCapacity = 4)
    val toasts: SharedFlow<ToastMsg> = _toasts
    fun toast(text: String, error: Boolean = false) { _toasts.tryEmit(ToastMsg(text, error)) }

    val api = Api(
        base = BuildConfig.BASE_URL,
        session = session,
        isOnline = { _online.value },
        onUnauthorized = { scope.launch { endSession(); _expired.emit(Unit) } },
    )

    init {
        val cm = context.getSystemService(ConnectivityManager::class.java)
        _online.value = cm.activeNetwork?.let { cm.getNetworkCapabilities(it) }
            ?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) == true
        cm.registerNetworkCallback(
            NetworkRequest.Builder().addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET).build(),
            object : ConnectivityManager.NetworkCallback() {
                private val up = mutableSetOf<Network>()
                override fun onAvailable(network: Network) { up += network; _online.value = true }
                override fun onLost(network: Network) { up -= network; _online.value = up.isNotEmpty() }
            },
        )
    }

    // Datele personale salvate pe telefon pleacă odată cu sesiunea (ca /logout pe site).
    fun endSession() {
        session.signOut()
        cache.clear()
        java.io.File(appContext.cacheDir, "resurse").deleteRecursively() // fișierele descărcate din program
    }

    suspend fun logout() {
        api.logout()
        endSession()
    }
}
