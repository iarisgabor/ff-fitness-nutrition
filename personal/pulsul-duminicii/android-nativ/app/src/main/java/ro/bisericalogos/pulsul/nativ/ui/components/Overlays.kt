package ro.bisericalogos.pulsul.nativ.ui.components

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.layout.LayoutCoordinates
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import ro.bisericalogos.pulsul.nativ.PulsulApp
import ro.bisericalogos.pulsul.nativ.ui.theme.body
import ro.bisericalogos.pulsul.nativ.ui.theme.display
import ro.bisericalogos.pulsul.nativ.ui.theme.mono
import ro.bisericalogos.pulsul.nativ.ui.theme.shadowTint

// ---------------------------------------------------------------- panou de jos (openSheet)

class SheetCloser(val close: () -> Unit)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PulsSheet(
    onDismiss: () -> Unit,
    title: String? = null,
    scrollable: Boolean = true,
    content: @Composable ColumnScope.(SheetCloser) -> Unit,
) {
    val c = puls
    val state = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val scope = rememberCoroutineScope()
    val closer = remember { SheetCloser { scope.launch { state.hide() }.invokeOnCompletion { onDismiss() } } }
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = state,
        shape = RoundedCornerShape(topStart = 22.dp, topEnd = 22.dp),
        containerColor = c.surface,
        contentColor = c.text,
        scrimColor = Color(0x73080A12),
        tonalElevation = 0.dp,
        dragHandle = {
            Box(Modifier.padding(top = 9.dp).size(width = 40.dp, height = 5.dp).clip(RoundedCornerShape(3.dp)).background(c.border))
        },
    ) {
        // cel mult ~90% din ecran (max-height:92vh pe site), ca panoul să nu urce sub bara de stare
        val maxHeight = with(LocalDensity.current) { (androidx.compose.ui.platform.LocalWindowInfo.current.containerSize.height * 0.88f).toDp() }
        Column(
            Modifier.fillMaxWidth().heightIn(max = maxHeight)
                .then(if (scrollable) Modifier.verticalScroll(rememberScrollState()) else Modifier)
                .padding(start = 20.dp, end = 20.dp, bottom = 20.dp),
        ) {
            if (title != null) Text(title, style = display(17.sp, 700, c.text), modifier = Modifier.padding(top = 12.dp, bottom = 14.dp))
            else Spacer(Modifier.heightIn(min = 12.dp))
            content(closer)
        }
    }
}

// rând de meniu în panou (.sheet-row)
@Composable
fun SheetRow(
    label: String,
    onClick: () -> Unit,
    icon: ImageVector? = null,
    danger: Boolean = false,
    chevron: Boolean = false,
    selected: Boolean = false,
    trailing: (@Composable () -> Unit)? = null,
) {
    val c = puls
    Row(
        Modifier.fillMaxWidth().heightIn(min = 52.dp).clip(RoundedCornerShape(12.dp))
            .background(if (selected) c.surface2 else Color.Transparent)
            .clickable(onClick = onClick).padding(horizontal = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        if (icon != null) Icon(icon, null, tint = if (danger) c.r1 else c.text2, modifier = Modifier.size(22.dp))
        Text(label, style = body(15.sp, if (selected) 700 else 600, if (danger) c.r1 else c.text), modifier = Modifier.weight(1f))
        trailing?.invoke()
        if (chevron) Text("›", style = body(22.sp, 400, c.text3))
    }
}

@Composable
fun PulsSwitch(checked: Boolean) {
    val c = puls
    val x by animateDpAsState(if (checked) 18.dp else 0.dp, tween(150), label = "comutator")
    Box(Modifier.size(width = 46.dp, height = 28.dp).clip(RoundedCornerShape(14.dp)).background(if (checked) c.accentMark else c.surface3)) {
        Box(
            Modifier.padding(3.dp).offset(x = x).size(22.dp)
                .shadow(2.dp, CircleShape).clip(CircleShape).background(Color.White),
        )
    }
}

// ---------------------------------------------------------------- dialoguri
// În locul lui confirm()/prompt(): arată ca restul aplicației, butonul sigur e primul la
// îndemână, iar fiecare întoarce rezultatul prin suspend (ca Promise-urile de pe site).

sealed class DialogReq(val done: CompletableDeferred<Any?> = CompletableDeferred())
private class ConfirmReq(val message: String, val title: String, val ok: String, val cancel: String, val danger: Boolean) : DialogReq()
private class PromptReq(val message: String?, val title: String?, val label: String, val value: String, val ok: String, val minLength: Int) : DialogReq()
private class CredentialsReq(val title: String, val rows: List<Pair<String, String>>, val note: String?) : DialogReq()

class Dialogs {
    var current by mutableStateOf<DialogReq?>(null)
        private set

    suspend fun confirm(message: String, title: String = "Ești sigur?", ok: String = "Confirmă", cancel: String = "Renunță", danger: Boolean = false): Boolean =
        show(ConfirmReq(message, title, ok, cancel, danger)) == true

    suspend fun prompt(message: String?, title: String?, label: String = "Valoare", value: String = "", ok: String = "Salvează", minLength: Int = 0): String? =
        show(PromptReq(message, title, label, value, ok, minLength)) as? String

    suspend fun credentials(title: String, rows: List<Pair<String, String>>, note: String? = null) {
        show(CredentialsReq(title, rows, note))
    }

    private suspend fun show(req: DialogReq): Any? {
        current = req
        return req.done.await()
    }

    internal fun finish(req: DialogReq, value: Any?) {
        if (current === req) current = null
        req.done.complete(value)
    }
}

val LocalDialogs = staticCompositionLocalOf { Dialogs() }

@Composable
private fun DialogActions(content: @Composable ColumnScope.() -> Unit) {
    // pe telefon butoanele stau unul sub altul, pe toată lățimea (column-reverse)
    Column(Modifier.fillMaxWidth().padding(top = 20.dp), verticalArrangement = Arrangement.spacedBy(10.dp), content = content)
}

@Composable
fun DialogHost(dialogs: Dialogs) {
    val c = puls
    val req = dialogs.current ?: return
    // răspunsul se trimite după ce panoul a coborât (onDismiss), nu la apăsare
    var result by remember(req) { mutableStateOf<Any?>(if (req is ConfirmReq) false else null) }
    when (req) {
        is ConfirmReq -> PulsSheet(onDismiss = { dialogs.finish(req, result) }, title = req.title) { sheet ->
            Text(req.message, style = body(15.sp, 400, c.text2, 22.5.sp))
            DialogActions {
                PBtn(req.ok, { result = true; sheet.close() }, Modifier.fillMaxWidth(), kind = if (req.danger) BtnKind.DangerSolid else BtnKind.Primary)
                PBtn(req.cancel, { result = false; sheet.close() }, Modifier.fillMaxWidth())
            }
        }
        is PromptReq -> PulsSheet(onDismiss = { dialogs.finish(req, result) }, title = req.title) { sheet ->
            var value by remember { mutableStateOf(req.value) }
            val tooShort = value.length < req.minLength || value.isEmpty()
            val submit = { if (!tooShort) { result = value; sheet.close() } }
            if (req.message != null) Text(req.message, style = body(15.sp, 400, c.text2, 22.5.sp), modifier = Modifier.padding(bottom = 14.dp))
            Field(req.label, value, { value = it }, imeAction = ImeAction.Done, onIme = submit, mono = true)
            DialogActions {
                PBtn(req.ok, submit, Modifier.fillMaxWidth(), kind = BtnKind.Primary, enabled = !tooShort)
                PBtn("Renunță", { result = null; sheet.close() }, Modifier.fillMaxWidth())
            }
        }
        is CredentialsReq -> PulsSheet(onDismiss = { dialogs.finish(req, Unit) }, title = req.title) { sheet ->
            val context = LocalContext.current
            var copied by remember { mutableStateOf(false) }
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                req.rows.forEach { (label, value) ->
                    Row(
                        Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(c.surface2).padding(horizontal = 14.dp, vertical = 12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(label, style = body(12.5.sp, 700, c.text3))
                        Spacer(Modifier.weight(1f).widthIn(min = 12.dp))
                        Text(value, style = mono(15.sp, 600, c.text))
                    }
                }
            }
            if (req.note != null) Text(req.note, style = body(13.sp, 400, c.text3, 19.5.sp), modifier = Modifier.padding(top = 12.dp))
            DialogActions {
                PBtn("Gata", { sheet.close() }, Modifier.fillMaxWidth(), kind = BtnKind.Primary)
                PBtn(if (copied) "Copiat" else "Copiază tot", {
                    val text = req.rows.joinToString("\n") { "${it.first}: ${it.second}" }
                    (context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager).setPrimaryClip(ClipData.newPlainText(req.title, text))
                    copied = true
                }, Modifier.fillMaxWidth())
            }
        }
    }
}

// ---------------------------------------------------------------- toast

@Composable
fun BoxScope.ToastHost(bottom: Dp) {
    val c = puls
    val g = PulsulApp.graph
    var visible by remember { mutableStateOf(false) }
    var last by remember { mutableStateOf<ro.bisericalogos.pulsul.nativ.data.Graph.ToastMsg?>(null) }
    LaunchedEffect(Unit) {
        g.toasts.collectLatest { m ->
            last = m; visible = true
            delay(if (m.error) 5000 else 2200)
            visible = false
        }
    }
    AnimatedVisibility(
        visible = visible,
        enter = fadeIn(tween(150)) + slideInVertically(tween(150)) { it / 3 },
        exit = fadeOut(tween(150)) + slideOutVertically(tween(150)) { it / 3 },
        modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = bottom, start = 16.dp, end = 16.dp),
    ) {
        val m = last ?: return@AnimatedVisibility
        Text(
            m.text, style = body(13.sp, 700, if (m.error) Color.White else c.bg, 18.sp),
            modifier = Modifier.shadow(8.dp, RoundedCornerShape(10.dp), spotColor = c.shadowTint.copy(.2f))
                .clip(RoundedCornerShape(10.dp)).background(if (m.error) c.r1 else c.text)
                .padding(horizontal = 16.dp, vertical = 10.dp),
        )
    }
}

// ---------------------------------------------------------------- tooltip la atingere
// O atingere îl arată; a doua atingere pe același element, o atingere în altă parte sau
// derularea îl ascund (ca bindTip din shared.txt).

data class TipData(val owner: Any, val at: Offset, val title: String, val body: String, val sub: String?)

class TipState {
    var tip by mutableStateOf<TipData?>(null)
        private set
    private var hiddenOwner: Any? = null
    private var hiddenAt = 0L

    fun toggle(owner: Any, at: Offset, title: String, body: String, sub: String? = null) {
        if (tip?.owner == owner) { tip = null; return }
        if (hiddenOwner == owner && System.currentTimeMillis() - hiddenAt < 400) return
        tip = TipData(owner, at, title, body, sub)
    }

    fun hideFromOutside() {
        val t = tip ?: return
        hiddenOwner = t.owner; hiddenAt = System.currentTimeMillis()
        tip = null
    }

    fun hide() { tip = null }
}

val LocalTips = staticCompositionLocalOf { TipState() }

fun Modifier.dismissTipsOnTouch(tips: TipState) = pointerInput(tips) {
    awaitEachGesture {
        awaitFirstDown(requireUnconsumed = false, pass = PointerEventPass.Initial)
        tips.hideFromOutside()
    }
}

@Composable
fun Modifier.tipOnTap(title: String, body: String, sub: String? = null): Modifier {
    val tips = LocalTips.current
    val key = remember { Any() }
    var coords by remember { mutableStateOf<LayoutCoordinates?>(null) }
    return this
        .onGloballyPositioned { coords = it }
        .pointerInput(title, body, sub) {
            detectTapGestures { off -> tips.toggle(key, coords?.localToRoot(off) ?: off, title, body, sub) }
        }
}

@Composable
fun TipHost(tips: TipState) {
    val c = puls
    val t = tips.tip ?: return
    val density = LocalDensity.current
    val pad = with(density) { 16.dp.roundToPx() }
    Layout(content = {
        Column(
            Modifier.widthIn(max = 260.dp)
                .shadow(8.dp, RoundedCornerShape(10.dp), spotColor = c.shadowTint.copy(.18f))
                .clip(RoundedCornerShape(10.dp)).background(c.surface3).border(1.dp, c.border, RoundedCornerShape(10.dp))
                .padding(horizontal = 13.dp, vertical = 10.dp),
        ) {
            Text(t.title, style = body(12.5.sp, 700, c.text, 18.sp), modifier = Modifier.padding(bottom = 3.dp))
            Text(t.body, style = body(12.5.sp, 400, c.text, 18.sp))
            if (t.sub != null) Text(t.sub, style = body(11.5.sp, 400, c.text3), modifier = Modifier.padding(top = 5.dp))
        }
    }) { measurables, constraints ->
        val p = measurables.first().measure(constraints.copy(minWidth = 0, minHeight = 0))
        layout(constraints.maxWidth, constraints.maxHeight) {
            var x = t.at.x.toInt() + pad
            var y = t.at.y.toInt() + pad
            if (x + p.width + pad > constraints.maxWidth) x = (t.at.x.toInt() - p.width - pad).coerceAtLeast(pad / 2)
            if (y + p.height + pad > constraints.maxHeight) y = t.at.y.toInt() - p.height - pad
            p.place(IntOffset(x, y))
        }
    }
}

// rând cu pictogramă de închidere (×) pentru panourile de detaliu
@Composable
fun CloseX(onClick: () -> Unit, label: String = "Închide") {
    val c = puls
    Box(
        Modifier.size(44.dp).clip(RoundedCornerShape(10.dp)).clickable(role = Role.Button, onClickLabel = label, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) { Text("×", style = body(24.sp, 400, c.text2)) }
}
