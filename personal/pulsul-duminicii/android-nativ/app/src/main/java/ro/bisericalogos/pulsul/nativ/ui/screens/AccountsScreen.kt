package ro.bisericalogos.pulsul.nativ.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import ro.bisericalogos.pulsul.nativ.PulsulApp
import ro.bisericalogos.pulsul.nativ.data.Account
import ro.bisericalogos.pulsul.nativ.data.AccountsPayload
import ro.bisericalogos.pulsul.nativ.data.AccountsReply
import ro.bisericalogos.pulsul.nativ.data.ApiError
import ro.bisericalogos.pulsul.nativ.data.PulsJson
import ro.bisericalogos.pulsul.nativ.data.rememberPage
import ro.bisericalogos.pulsul.nativ.domain.preacherSlug
import ro.bisericalogos.pulsul.nativ.domain.usernameFor
import ro.bisericalogos.pulsul.nativ.ui.LocalNav
import ro.bisericalogos.pulsul.nativ.ui.Routes
import ro.bisericalogos.pulsul.nativ.ui.components.BtnKind
import ro.bisericalogos.pulsul.nativ.ui.components.EmptyState
import ro.bisericalogos.pulsul.nativ.ui.components.Field
import ro.bisericalogos.pulsul.nativ.ui.components.HDivider
import ro.bisericalogos.pulsul.nativ.ui.components.ListSkeleton
import ro.bisericalogos.pulsul.nativ.ui.components.LocalDialogs
import ro.bisericalogos.pulsul.nativ.ui.components.Notice
import ro.bisericalogos.pulsul.nativ.ui.components.PBtn
import ro.bisericalogos.pulsul.nativ.ui.components.PageFrame
import ro.bisericalogos.pulsul.nativ.ui.components.PageHead
import ro.bisericalogos.pulsul.nativ.ui.components.SelectField
import ro.bisericalogos.pulsul.nativ.ui.components.cardSurface
import ro.bisericalogos.pulsul.nativ.ui.components.puls
import ro.bisericalogos.pulsul.nativ.ui.theme.PlexMono
import ro.bisericalogos.pulsul.nativ.ui.theme.body
import ro.bisericalogos.pulsul.nativ.ui.theme.caps
import java.security.SecureRandom

private val H = Modifier.padding(horizontal = 16.dp)

// Parolă ușor de dictat: fără caractere care se confundă (0/O, 1/l/I) — ca pe site.
private fun generatePassword(): String {
    val chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    val rnd = SecureRandom()
    return (1..12).map { chars[rnd.nextInt(256) % chars.length] }.joinToString("")
}

@Composable
fun AccountsScreen() {
    val nav = LocalNav.current
    val g = PulsulApp.graph
    val dialogs = LocalDialogs.current
    val scope = rememberCoroutineScope()
    val vm = rememberPage<AccountsPayload>("/admin/conturi")

    fun applyAccounts(body: String) {
        val accounts = PulsJson.decodeFromString(AccountsReply.serializer(), body).accounts
        g.markChanged()
        vm.replace { it.copy(accounts = accounts) }
    }

    fun reset(acc: Account) = scope.launch {
        val pw = dialogs.prompt(
            "Va fi delogat de pe toate dispozitivele. Poți păstra parola generată sau scrie alta.",
            title = "Parolă nouă pentru ${acc.display_name}", label = "Parola nouă (minim 8 caractere)",
            value = generatePassword(), ok = "Resetează parola", minLength = 8,
        ) ?: return@launch
        try {
            applyAccounts(g.api.send("PATCH", "/api/conturi/${acc.id}", buildJsonObject { put("password", JsonPrimitive(pw)) }))
            dialogs.credentials("Parola lui ${acc.display_name} a fost schimbată", listOf("Utilizator" to acc.username, "Parolă nouă" to pw))
        } catch (e: ApiError) { g.toast(e.message ?: "Eroare", error = true) }
    }

    fun delete(acc: Account) = scope.launch {
        val ok = dialogs.confirm("Programul și resursele urcate de el rămân. Poți crea oricând un cont nou.", title = "Ștergi contul lui ${acc.display_name}?", ok = "Șterge contul", danger = true)
        if (!ok) return@launch
        try { applyAccounts(g.api.send("DELETE", "/api/conturi/${acc.id}")); g.toast("Cont șters.") }
        catch (e: ApiError) { g.toast(e.message ?: "Eroare", error = true) }
    }

    PageFrame(vm, "Conturi predicatori", nav::back, nav.openAccount, { ListSkeleton(4, 80) }) { p, _ ->
        item("head") {
            PageHead(
                "Conturi predicatori",
                "Fiecare predicator intră cu contul lui și vede doar statisticile lui, plus programul duminicilor care urmează. Parola o setezi tu aici și i-o dai personal; după aceea și-o poate schimba singur.",
                H,
            )
        }
        val notices = listOfNotNull(if (!p.dbReady) "Baza de date (Cloudflare D1) nu e configurată încă. Vezi README." else null, p.scheduleError)
        notices.forEachIndexed { i, n -> item("n$i") { Notice(n, H.padding(top = 20.dp)) } }

        val norm = { n: String -> usernameFor(n) }
        val withAccount = p.accounts.map { norm(it.preacher_name) }.toSet()
        val free = p.preachers.filter { norm(it) !in withAccount }

        item("list") {
            val c = puls
            Column(H.padding(top = 18.dp).fillMaxWidth().cardSurface().padding(horizontal = 16.dp, vertical = 18.dp)) {
                Text("CONTURI EXISTENTE", style = caps(13.sp, c.text3, .06f), modifier = Modifier.padding(bottom = 6.dp))
                if (p.accounts.isEmpty()) EmptyState("Niciun cont încă.", center = false)
                p.accounts.forEachIndexed { i, a ->
                    if (i > 0) HDivider()
                    Column(Modifier.fillMaxWidth().padding(vertical = 14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Column {
                            Text(a.display_name, style = body(14.5.sp, 700, c.text))
                            Text(buildAnnotatedString {
                                append("utilizator ")
                                withStyle(SpanStyle(fontFamily = PlexMono, color = c.text2)) { append(a.username) }
                                if (norm(a.preacher_name) != norm(a.display_name)) append(" · în calendar: ${a.preacher_name}")
                            }, style = body(12.5.sp, 400, c.text3), modifier = Modifier.padding(top = 3.dp))
                        }
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            PBtn("Statistici", { nav.to(Routes.preacher(preacherSlug(a.preacher_name))) }, small = true)
                            PBtn("Resetează parola", { reset(a) }, small = true)
                            PBtn("Șterge", { delete(a) }, small = true, kind = BtnKind.Danger)
                        }
                    }
                }
                if (free.isNotEmpty()) {
                    Text(buildAnnotatedString {
                        append("Fără cont încă: ")
                        withStyle(SpanStyle(color = c.text2, fontWeight = FontWeight.W700)) { append(free.joinToString(", ")) }
                    }, style = body(12.5.sp, 400, c.text3, 20.sp), modifier = Modifier.padding(top = 14.dp))
                }
            }
        }
        item("new") { NewAccountCard(free) { applyAccounts(it) } }
        item("end") { Spacer(Modifier.height(40.dp)) }
    }
}

@Composable
private fun NewAccountCard(free: List<String>, onCreated: (String) -> Unit) {
    val c = puls
    val g = PulsulApp.graph
    val dialogs = LocalDialogs.current
    val scope = rememberCoroutineScope()
    var preacher by remember { mutableStateOf("") }
    var username by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    Column(H.padding(top = 14.dp).fillMaxWidth().cardSurface().padding(horizontal = 16.dp, vertical = 18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("CONT NOU", style = caps(13.sp, c.text3, .06f))
        SelectField(
            "Predicator (din Calendar predicare)", preacher,
            if (free.isEmpty()) listOf("" to "toți predicatorii din calendar au deja cont") else free.map { it to it },
            { preacher = it; if (it.isNotBlank()) username = usernameFor(it) },
            placeholder = if (free.isEmpty()) "toți predicatorii din calendar au deja cont" else "alege",
        )
        Field("Nume de utilizator", username, { username = it.trim() })
        Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Field("Parolă (minim 8 caractere)", password, { password = it }, Modifier.weight(1f), mono = true)
            PBtn("Generează", { password = generatePassword() }, Modifier.height(48.dp))
        }
        if (error != null) ro.bisericalogos.pulsul.nativ.ui.components.FormError(error!!)
        PBtn("Creează contul", {
            error = when {
                preacher.isBlank() -> "Alege predicatorul din calendar."
                !Regex("^[A-Za-z0-9._-]{3,40}$").matches(username) -> "Numele de utilizator: 3-40 caractere, doar litere, cifre, punct, cratimă."
                password.length < 8 -> "Parola trebuie să aibă cel puțin 8 caractere."
                else -> null
            }
            if (error != null) return@PBtn
            busy = true
            scope.launch {
                try {
                    val body = g.api.send("POST", "/api/conturi", buildJsonObject {
                        put("preacher_name", JsonPrimitive(preacher)); put("display_name", JsonPrimitive(preacher))
                        put("username", JsonPrimitive(username)); put("password", JsonPrimitive(password))
                    })
                    onCreated(body)
                    val u = username; val pw = password
                    preacher = ""; username = ""; password = ""
                    dialogs.credentials("Cont creat", listOf("Utilizator" to u, "Parolă" to pw), "Trimite-i-le predicatorului personal. Parola nu se mai poate vedea după ce închizi acest mesaj.")
                } catch (e: ApiError) { error = e.message } finally { busy = false }
            }
        }, Modifier.fillMaxWidth(), kind = BtnKind.Primary, busy = busy)
    }
}
