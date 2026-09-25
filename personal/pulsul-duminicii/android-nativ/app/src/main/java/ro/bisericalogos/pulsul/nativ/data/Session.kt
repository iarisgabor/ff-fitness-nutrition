package ro.bisericalogos.pulsul.nativ.data

import android.content.Context
import androidx.core.content.edit
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

// Tokenul de sesiune, utilizatorul și preferințele mici — în SharedPreferences private
// aplicației (sandbox-ul Android). Echivalentul lui remember()/recall() de pe site.
class Session(context: Context) {
    private val prefs = context.getSharedPreferences("puls", Context.MODE_PRIVATE)

    private val _user = MutableStateFlow(readUser())
    val user: StateFlow<User?> = _user

    val token: String? get() = prefs.getString("token", null)

    private fun readUser(): User? = prefs.getString("user", null)?.let {
        runCatching { PulsJson.decodeFromString(User.serializer(), it) }.getOrNull()
    }

    fun signIn(token: String, user: User) {
        prefs.edit {
            putString("token", token)
            putString("user", PulsJson.encodeToString(User.serializer(), user))
            putBoolean("welcome-seen", true)
        }
        _user.value = user
    }

    fun updateUser(user: User) {
        if (token == null) return
        prefs.edit { putString("user", PulsJson.encodeToString(User.serializer(), user)) }
        _user.value = user
    }

    fun signOut() {
        prefs.edit { remove("token"); remove("user") }
        _user.value = null
    }

    var welcomeSeen: Boolean
        get() = prefs.getBoolean("welcome-seen", false)
        set(v) = prefs.edit { putBoolean("welcome-seen", v) }

    // „system" | "light" | "dark"
    private val _theme = MutableStateFlow(prefs.getString("theme", "system") ?: "system")
    val theme: StateFlow<String> = _theme
    fun setTheme(value: String) {
        prefs.edit { putString("theme", value) }
        _theme.value = value
    }

    fun recall(key: String): String? = prefs.getString("puls-$key", null)
    fun remember(key: String, value: String) = prefs.edit { putString("puls-$key", value) }
}
