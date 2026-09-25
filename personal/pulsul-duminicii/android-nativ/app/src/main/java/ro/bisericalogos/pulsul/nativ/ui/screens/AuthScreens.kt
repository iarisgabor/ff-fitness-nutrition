package ro.bisericalogos.pulsul.nativ.ui.screens

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathMeasure
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import ro.bisericalogos.pulsul.nativ.PulsulApp
import ro.bisericalogos.pulsul.nativ.data.ApiError
import ro.bisericalogos.pulsul.nativ.ui.Routes
import ro.bisericalogos.pulsul.nativ.ui.components.AppTopBar
import ro.bisericalogos.pulsul.nativ.ui.components.BrandMark
import ro.bisericalogos.pulsul.nativ.ui.components.BtnKind
import ro.bisericalogos.pulsul.nativ.ui.components.Field
import ro.bisericalogos.pulsul.nativ.ui.components.FormError
import ro.bisericalogos.pulsul.nativ.ui.components.PBtn
import ro.bisericalogos.pulsul.nativ.ui.components.cardSurface
import ro.bisericalogos.pulsul.nativ.ui.components.puls
import ro.bisericalogos.pulsul.nativ.ui.theme.body
import ro.bisericalogos.pulsul.nativ.ui.theme.display

// ---------------------------------------------------------------- bun venit (doar la prima deschidere)

@Composable
fun WelcomeScreen(onEnter: () -> Unit) {
    val c = puls
    // Linia de puls se desenează o singură dată, apoi textul apare treptat. Cu animațiile
    // dezactivate din sistem, Compose sare direct la starea finală.
    val draw = remember { Animatable(0f) }
    val appear = remember { Animatable(0f) }
    LaunchedEffect(Unit) {
        draw.animateTo(1f, tween(900, easing = FastOutSlowInEasing))
        appear.animateTo(1f, tween(520))
    }
    fun Modifier.reveal(step: Int) = graphicsLayer {
        val t = ((appear.value * 1.5f) - step * 0.18f).coerceIn(0f, 1f)
        alpha = t
        translationY = (1 - t) * 16.dp.toPx()
    }

    Column(Modifier.fillMaxSize().background(c.bg).systemBarsPadding().padding(horizontal = 24.dp)) {
        Row(Modifier.padding(top = 20.dp), verticalAlignment = Alignment.CenterVertically) {
            BrandMark(26)
            Spacer(Modifier.width(10.dp))
            Text("PULSUL DUMINICII", style = display(14.sp, 700, c.text).copy(letterSpacing = .28.sp))
        }
        Spacer(Modifier.weight(1f))
        Canvas(Modifier.fillMaxWidth().height(132.dp)) {
            val pts = listOf(1f to 13f, 7f to 13f, 10f to 4f, 16f to 22f, 19f to 13f, 25f to 13f)
            val path = Path().apply {
                pts.forEachIndexed { i, (x, y) ->
                    val px = (x - 1f) / 24f * size.width
                    val py = size.height / 2 + (y - 13f) / 9f * (size.height / 2 - 6.dp.toPx())
                    if (i == 0) moveTo(px, py) else lineTo(px, py)
                }
            }
            val measure = PathMeasure().apply { setPath(path, false) }
            val part = Path()
            measure.getSegment(0f, measure.length * draw.value, part, true)
            drawPath(part, c.accent.copy(alpha = .18f), style = Stroke(9.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round))
            drawPath(part, c.accent, style = Stroke(3.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round))
        }
        Spacer(Modifier.weight(1f))
        Text("Vocea comunității, citită împreună.", style = display(28.sp, 700, c.text, 34.sp), modifier = Modifier.reveal(0))
        Text(
            "Feedback-ul de duminică și programul întâlnirii, într-un singur loc, pentru echipa bisericii Logos.",
            style = body(15.sp, 400, c.text2, 23.sp), modifier = Modifier.padding(top = 12.dp).reveal(1),
        )
        Spacer(Modifier.height(28.dp))
        PBtn("Intră", onEnter, Modifier.fillMaxWidth().reveal(2), kind = BtnKind.Primary, large = true)
        Spacer(Modifier.height(20.dp))
    }
}

// ---------------------------------------------------------------- autentificare (login.html)

@Composable
fun LoginScreen(onSignedIn: (String) -> Unit) {
    val c = puls
    val g = PulsulApp.graph
    val scope = rememberCoroutineScope()
    val haptics = LocalHapticFeedback.current
    val keyboard = LocalSoftwareKeyboardController.current
    var username by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    val passwordFocus = remember { FocusRequester() }

    val submit: () -> Unit = submit@{
        if (busy) return@submit
        if (username.isBlank() || password.isEmpty()) { error = "Completează utilizatorul și parola."; return@submit }
        keyboard?.hide()
        busy = true; error = null
        scope.launch {
            try {
                val reply = g.api.login(username.trim(), password)
                g.cache.clear() // copiile unui cont anterior de pe același telefon
                g.session.signIn(reply.token, reply.user)
                haptics.performHapticFeedback(HapticFeedbackType.Confirm)
                onSignedIn(if (reply.user.isPreacher) Routes.ME else Routes.HOME)
            } catch (e: ApiError) {
                error = e.message
                haptics.performHapticFeedback(HapticFeedbackType.Reject)
            } finally { busy = false }
        }
    }

    Box(
        Modifier.fillMaxSize().background(c.bg).systemBarsPadding().imePadding().verticalScroll(rememberScrollState()).padding(16.dp),
        contentAlignment = Alignment.Center,
    ) {
        Column(Modifier.widthIn(max = 400.dp).fillMaxWidth().padding(top = 24.dp).cardSurface().padding(horizontal = 20.dp, vertical = 26.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(bottom = 26.dp)) {
                BrandMark(30)
                Spacer(Modifier.width(10.dp))
                Text("PULSUL DUMINICII", style = display(16.sp, 700, c.text).copy(letterSpacing = .32.sp))
            }
            Text("Autentificare", style = display(22.sp, 700, c.text))
            Text("Intră cu contul primit de la biserică.", style = body(13.5.sp, 400, c.text2, 20.sp), modifier = Modifier.padding(top = 6.dp))
            Column(Modifier.padding(top = 22.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                if (error != null) FormError(error!!)
                Field("Utilizator", username, { username = it }, imeAction = ImeAction.Next, onIme = { passwordFocus.requestFocus() })
                Field("Parolă", password, { password = it }, password = true, imeAction = ImeAction.Go, onIme = submit, modifier = Modifier.focusRequester(passwordFocus))
                PBtn("Intră", submit, Modifier.fillMaxWidth().padding(top = 4.dp), kind = BtnKind.Primary, busy = busy, large = true)
            }
            Text(
                "Ai uitat parola? Cere-i contului general (BisericaLogos) să ți-o reseteze.",
                style = body(12.sp, 400, c.text3, 18.sp), modifier = Modifier.padding(top = 18.dp),
            )
        }
    }
}

// ---------------------------------------------------------------- schimbă parola (/cont)

@Composable
fun PasswordScreen(onBack: () -> Unit, onAccount: () -> Unit) {
    val c = puls
    val g = PulsulApp.graph
    val scope = rememberCoroutineScope()
    val user by g.session.user.collectAsState()
    var current by remember { mutableStateOf("") }
    var next by remember { mutableStateOf("") }
    var repeat by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }

    val submit: () -> Unit = submit@{
        error = null
        if (next != repeat) { error = "Parolele noi nu coincid."; return@submit }
        if (next.length < 8) { error = "Parola nouă trebuie să aibă cel puțin 8 caractere."; return@submit }
        busy = true
        scope.launch {
            try {
                g.api.send("POST", "/api/parola", kotlinx.serialization.json.buildJsonObject {
                    put("current", kotlinx.serialization.json.JsonPrimitive(current))
                    put("password", kotlinx.serialization.json.JsonPrimitive(next))
                })
                current = ""; next = ""; repeat = ""
                g.toast("Parola a fost schimbată.")
            } catch (e: ApiError) { error = e.message } finally { busy = false }
        }
    }

    Column(Modifier.fillMaxSize().background(c.bg)) {
        AppTopBar("Schimbă parola", true, onBack, user, onAccount)
        Column(Modifier.fillMaxSize().imePadding().verticalScroll(rememberScrollState()).padding(16.dp)) {
            Column(Modifier.fillMaxWidth().cardSurface().padding(horizontal = 20.dp, vertical = 26.dp)) {
                Text("Schimbă parola", style = display(22.sp, 700, c.text))
                Text("După schimbare rămâi autentificat pe acest dispozitiv.", style = body(13.5.sp, 400, c.text2, 20.sp), modifier = Modifier.padding(top = 6.dp))
                Column(Modifier.padding(top = 22.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    if (error != null) FormError(error!!)
                    Field("Parola curentă", current, { current = it }, password = true)
                    Field("Parola nouă (minim 8 caractere)", next, { next = it }, password = true)
                    Field("Repetă parola nouă", repeat, { repeat = it }, password = true, imeAction = ImeAction.Done, onIme = submit)
                    PBtn("Schimbă parola", submit, Modifier.fillMaxWidth().padding(top = 4.dp), kind = BtnKind.Primary, busy = busy, large = true)
                }
            }
        }
    }
}
