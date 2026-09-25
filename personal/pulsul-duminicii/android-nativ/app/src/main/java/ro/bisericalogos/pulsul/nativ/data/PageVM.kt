package ro.bisericalogos.pulsul.nativ.data

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.coroutines.launch
import kotlinx.serialization.KSerializer
import kotlinx.serialization.SerializationException
import kotlinx.serialization.serializer
import ro.bisericalogos.pulsul.nativ.PulsulApp

sealed interface PageState<out T> {
    data object Loading : PageState<Nothing>
    // savedAt != null: serverul n-a răspuns, se arată copia salvată pe telefon
    data class Ready<T>(val data: T, val user: User, val savedAt: Long? = null) : PageState<T>
    data class Failed(val message: String, val status: Int = 0) : PageState<Nothing>
}

// O pagină = GET /api/app<cale>, aceeași cale ca pe site. Trăiește cât ecranul e în stiva de
// navigare, deci „înapoi" nu reîncarcă — decât dacă între timp s-a modificat ceva.
class PageVM<T>(private val path: String, private val ser: KSerializer<T>) : ViewModel() {
    private val g = PulsulApp.graph
    var state by mutableStateOf<PageState<T>>(PageState.Loading)
        private set
    var refreshing by mutableStateOf(false)
        private set
    private var loadedAt = g.changes.value

    init { load(silent = false) }

    fun refresh() = load(silent = false, pulled = true)

    fun onResume() {
        if (g.changes.value != loadedAt && state is PageState.Ready) load(silent = true)
    }

    // după o modificare care întoarce deja datele noi (ex. planul unei duminici)
    fun replace(transform: (T) -> T) {
        val s = state
        if (s is PageState.Ready) state = s.copy(data = transform(s.data))
        loadedAt = g.changes.value
    }

    private fun decode(body: String) = PulsJson.decodeFromString(Envelope.serializer(ser), body)

    private fun load(silent: Boolean, pulled: Boolean = false) = viewModelScope.launch {
        if (pulled) refreshing = true
        val stamp = g.changes.value
        try {
            val body = g.api.getPage("/api/app$path")
            val env = decode(body)
            g.cache.save(path, body)
            g.session.updateUser(env.user)
            state = PageState.Ready(env.data, env.user)
            loadedAt = stamp
        } catch (e: NetworkError) {
            val saved = g.cache.read(path)?.let { (body, at) -> runCatching { decode(body) to at }.getOrNull() }
            when {
                saved != null -> state = PageState.Ready(saved.first.data, saved.first.user, savedAt = saved.second)
                state !is PageState.Ready -> state = PageState.Failed(e.message ?: NETWORK_MSG)
                !silent -> g.toast(e.message ?: NETWORK_MSG, error = true)
            }
        } catch (e: ApiError) {
            if (e.status != 401) {
                if (state !is PageState.Ready || e.status == 403 || e.status == 404) state = PageState.Failed(e.message ?: "Eroare", e.status)
                else if (!silent) g.toast(e.message ?: "Eroare", error = true)
            }
        } catch (e: SerializationException) {
            state = PageState.Failed("Datele primite nu au putut fi citite. Actualizează aplicația.")
        } finally {
            refreshing = false
        }
    }
}

@Composable
inline fun <reified T> rememberPage(path: String): PageVM<T> =
    viewModel(key = path) { PageVM(path, serializer<T>()) }
