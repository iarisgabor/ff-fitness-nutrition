package ro.bisericalogos.pulsul.nativ.ui.components

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import ro.bisericalogos.pulsul.nativ.ui.theme.LocalPuls
import ro.bisericalogos.pulsul.nativ.ui.theme.PulsColors
import ro.bisericalogos.pulsul.nativ.ui.theme.body
import ro.bisericalogos.pulsul.nativ.ui.theme.caps
import ro.bisericalogos.pulsul.nativ.ui.theme.display
import ro.bisericalogos.pulsul.nativ.ui.theme.mix
import ro.bisericalogos.pulsul.nativ.ui.theme.numeric
import ro.bisericalogos.pulsul.nativ.ui.theme.shadowTint

val puls: PulsColors @Composable get() = LocalPuls.current

// culorile trimise de server ca variabile CSS (heroKpis, overviewCards)
@Composable
fun cssColor(v: String?, fallback: Color): Color {
    val c = puls
    return when (v?.trim()) {
        "var(--accent)" -> c.accent
        "var(--accent2)" -> c.accent2
        "var(--accent-mark)" -> c.accentMark
        "var(--accent2-mark)" -> c.accent2Mark
        else -> fallback
    }
}

val CardShape = RoundedCornerShape(16.dp) // .card pe telefon

// ---- apăsare: micșorare ușoară, ca .btn:active / a.card:active pe site
@Composable
private fun pressedScale(source: MutableInteractionSource, scale: Float): Float {
    val isPressed by source.collectIsPressedAsState()
    val s by animateFloatAsState(if (isPressed) scale else 1f, tween(80), label = "apasare")
    return s
}

@Composable
fun Modifier.tappable(onClick: (() -> Unit)?, scale: Float = 0.985f, role: Role = Role.Button): Modifier {
    if (onClick == null) return this
    val source = remember { MutableInteractionSource() }
    val s = pressedScale(source, scale)
    return this
        .graphicsLayer { scaleX = s; scaleY = s }
        .clickable(interactionSource = source, indication = null, role = role, onClick = onClick)
}

@Composable
fun Modifier.cardSurface(shape: Shape = CardShape, color: Color? = null, borderColor: Color? = null, shadow: Boolean = true): Modifier {
    val c = puls
    return this
        .then(if (shadow) Modifier.shadow(if (c.isDark) 10.dp else 6.dp, shape, ambientColor = c.shadowTint.copy(alpha = if (c.isDark) .3f else .05f), spotColor = c.shadowTint.copy(alpha = if (c.isDark) .45f else .10f)) else Modifier)
        .clip(shape)
        .background(color ?: c.surface)
        .border(1.dp, borderColor ?: c.border, shape)
}

@Composable
fun PCard(
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
    padding: PaddingValues = PaddingValues(horizontal = 16.dp, vertical = 18.dp),
    leftBorder: Color? = null,
    dashed: Boolean = false,
    content: @Composable ColumnScope.() -> Unit,
) {
    val c = puls
    val base = if (dashed) modifier.dashedBorder(c.border, 16.dp) else modifier.cardSurface()
    Column(
        base
            .tappable(onClick)
            .then(if (leftBorder != null) Modifier.drawBehind {
                drawRect(leftBorder, size = Size(4.dp.toPx(), size.height))
            } else Modifier)
            .padding(padding),
        content = content,
    )
}

fun Modifier.dashedBorder(color: Color, radius: Dp): Modifier = this.drawBehind {
    val stroke = Stroke(width = 1.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(6.dp.toPx(), 4.dp.toPx())))
    drawRoundRect(color, style = stroke, cornerRadius = CornerRadius(radius.toPx()))
}

// ---- KPI (.card.kpi): eticheta mică, valoarea mare, rândul de dedesubt
@Composable
fun Kpi(tag: String, value: String, modifier: Modifier = Modifier, dot: Color? = null, valueSize: Float = 21f, sub: @Composable (() -> Unit)? = null) {
    val c = puls
    Column(modifier.cardSurface().padding(start = 14.dp, end = 14.dp, top = 14.dp, bottom = 15.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            if (dot != null) { Box(Modifier.size(8.dp).background(dot, CircleShape)); Spacer(Modifier.width(7.dp)) }
            Text(tag.uppercase(), style = caps(10.5.sp, c.text3), maxLines = 2)
        }
        Text(value, style = numeric(valueSize.sp, 800, c.text), modifier = Modifier.padding(top = 6.dp))
        if (sub != null) Box(Modifier.padding(top = 4.dp)) { sub() }
    }
}

@Composable
fun KpiSub(text: String) = Text(text, style = body(12.sp, 500, puls.text2))

@Composable
fun DeltaText(delta: Double, text: String, size: Float = 12f) {
    val c = puls
    Text(text, style = body(size.sp, 600, if (delta >= 0) c.r5 else c.r1))
}

// grila de KPI-uri: câte două pe rând, ca pe telefon
@Composable
fun KpiGrid(items: List<@Composable (Modifier) -> Unit>, modifier: Modifier = Modifier) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(10.dp)) {
        items.chunked(2).forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                row.forEach { it(Modifier.weight(1f)) }
                if (row.size == 1) Spacer(Modifier.weight(1f))
            }
        }
    }
}

// ---- titluri de pagină și de secțiune
@Composable
fun PageHead(title: String, lead: String? = null, modifier: Modifier = Modifier, size: Float = 26f) {
    val c = puls
    Column(modifier.padding(top = 22.dp)) {
        Text(title, style = display(size.sp, 700, c.text, lineHeight = (size * 1.2f).sp))
        if (lead != null) Text(lead, style = body(13.5.sp, 400, c.text2, 20.sp), modifier = Modifier.padding(top = 10.dp))
    }
}

@Composable
fun SectionHead(title: String, note: String? = null, modifier: Modifier = Modifier) {
    val c = puls
    Column(modifier.padding(bottom = 16.dp)) {
        Text(title, style = display(20.sp, 700, c.text))
        if (note != null) Text(note, style = body(12.5.sp, 400, c.text3, 18.sp), modifier = Modifier.padding(top = 6.dp))
    }
}

@Composable
fun BlockHead(title: String, sub: String? = null, modifier: Modifier = Modifier) {
    val c = puls
    Column(modifier.padding(bottom = 14.dp)) {
        Text(title, style = display(14.sp, 700, c.text))
        if (sub != null) Text(sub, style = body(12.sp, 400, c.text3, 17.sp), modifier = Modifier.padding(top = 2.dp))
    }
}

@Composable
fun Notice(text: String, modifier: Modifier = Modifier) {
    val c = puls
    Text(
        text, style = body(13.sp, 400, c.text2, 19.5.sp),
        modifier = modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(c.surface2)
            .dashedBorder(c.border, 12.dp).padding(horizontal = 18.dp, vertical = 16.dp),
    )
}

@Composable
fun FormError(text: String, modifier: Modifier = Modifier) {
    val c = puls
    Text(
        text, style = body(13.sp, 500, c.text, 18.sp),
        modifier = modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp))
            .background(mix(c.r1, .14f, c.surface)).border(1.dp, mix(c.r1, .40f, c.border), RoundedCornerShape(10.dp))
            .padding(horizontal = 12.dp, vertical = 10.dp),
    )
}

@Composable
fun EmptyState(text: String, modifier: Modifier = Modifier, center: Boolean = true) {
    Text(
        text, style = body(14.sp, 400, puls.text3, 21.sp), textAlign = if (center) TextAlign.Center else TextAlign.Start,
        modifier = modifier.fillMaxWidth().padding(vertical = 30.dp),
    )
}

@Composable
fun HDivider(modifier: Modifier = Modifier) = Box(modifier.fillMaxWidth().height(1.dp).background(puls.border))

// ---- butoane (.btn)
enum class BtnKind { Default, Primary, Danger, DangerSolid }

@Composable
fun PBtn(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    kind: BtnKind = BtnKind.Default,
    small: Boolean = false,
    busy: Boolean = false,
    enabled: Boolean = true,
    large: Boolean = false,
    leading: (@Composable () -> Unit)? = null,
) {
    val c = puls
    val (bg, fg, border) = when (kind) {
        BtnKind.Primary -> Triple(c.accentMark, Color.White, c.accentMark)
        BtnKind.DangerSolid -> Triple(c.r1, Color.White, c.r1)
        BtnKind.Danger -> Triple(c.surface2, c.r1, c.border)
        BtnKind.Default -> Triple(c.surface2, c.text, c.border)
    }
    val shape = RoundedCornerShape(if (small) 8.dp else 10.dp)
    val active = enabled && !busy
    Box(
        modifier
            .heightIn(min = if (large) 50.dp else if (small) 40.dp else 44.dp)
            .graphicsLayer { alpha = if (enabled) 1f else .4f }
            .tappable(if (active) onClick else null, scale = .97f)
            .clip(shape).background(bg).border(1.dp, border, shape)
            .padding(horizontal = if (small) 11.dp else 16.dp, vertical = if (small) 6.dp else 9.dp),
        contentAlignment = Alignment.Center,
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            modifier = Modifier.graphicsLayer { alpha = if (busy) 0f else 1f },
        ) {
            leading?.invoke()
            Text(text, style = body(if (large) 15.sp else if (small) 12.sp else 13.sp, 700, fg), maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        if (busy) CircularProgressIndicator(Modifier.size(16.dp), color = fg, strokeWidth = 2.dp, trackColor = fg.copy(alpha = .25f))
    }
}

// ---- pastile și chips
@Composable
fun Chip(text: String, modifier: Modifier = Modifier, name: Boolean = false, onClick: (() -> Unit)? = null) {
    val c = puls
    Text(
        text, style = body(if (onClick != null) 12.sp else 11.sp, if (name) 600 else 500, if (name) c.text else c.text2),
        modifier = modifier
            .tappable(onClick, .97f)
            .clip(CircleShape).background(c.surface2).border(1.dp, c.border, CircleShape)
            .then(if (onClick != null) Modifier.heightIn(min = 40.dp).padding(horizontal = 14.dp) else Modifier.padding(horizontal = 10.dp, vertical = 3.dp))
            .wrapCenter(onClick != null),
    )
}

private fun Modifier.wrapCenter(on: Boolean) = if (on) this.padding(vertical = 10.dp) else this

@Composable
fun Pill(text: String, next: Boolean = false) {
    val c = puls
    val col = if (next) c.accent2Mark else c.accentMark
    Text(
        text, style = body(11.sp, 700, col),
        modifier = Modifier.clip(CircleShape).background(mix(col, if (next) .14f else .16f, c.surface2))
            .border(1.dp, mix(col, .35f, c.border), CircleShape).padding(horizontal = 9.dp, vertical = 3.dp),
    )
}

// ---- comutator (.toggle-group): opțiunile egale pe toată lățimea
@Composable
fun ToggleGroup(options: List<Pair<String, String>>, selected: String, onSelect: (String) -> Unit, modifier: Modifier = Modifier, scroll: Boolean = false) {
    val c = puls
    val shape = RoundedCornerShape(11.dp)
    val row = @Composable { mod: Modifier ->
        Row(mod.clip(shape).background(c.surface2).border(1.dp, c.border, shape).padding(3.dp), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
            options.forEach { (key, label) ->
                val active = key == selected
                Box(
                    Modifier
                        .then(if (scroll) Modifier else Modifier.weight(1f))
                        .heightIn(min = 40.dp)
                        .then(if (active) Modifier.shadow(3.dp, RoundedCornerShape(8.dp), ambientColor = c.shadowTint.copy(.05f), spotColor = c.shadowTint.copy(.10f)) else Modifier)
                        .clip(RoundedCornerShape(8.dp))
                        .background(if (active) c.surface else Color.Transparent)
                        .clickable(role = Role.RadioButton) { onSelect(key) }
                        .padding(horizontal = if (scroll) 12.dp else 6.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(label, style = body(12.5.sp, 700, if (active) c.text else c.text2), maxLines = 1)
                }
            }
        }
    }
    if (scroll) Box(modifier.horizontalScroll(rememberScrollState())) { row(Modifier) } else row(modifier.fillMaxWidth())
}

// ---- tab de categorie (.cat-tab)
@Composable
fun CatTab(label: String, active: Boolean, onClick: () -> Unit, count: Int? = null) {
    val c = puls
    Row(
        Modifier
            .heightIn(min = 40.dp)
            .tappable(onClick, .97f)
            .clip(CircleShape)
            .background(if (active) mix(c.accentMark, .16f, c.surface2) else c.surface2)
            .border(1.dp, if (active) c.accentMark else c.border, CircleShape)
            .padding(horizontal = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, style = body(12.5.sp, 600, if (active) c.text else c.text2), maxLines = 1)
        if (count != null) Text(" $count", style = ro.bisericalogos.pulsul.nativ.ui.theme.mono(12.sp, 500, (if (active) c.text else c.text2).copy(alpha = .7f)), modifier = Modifier.padding(start = 2.dp))
    }
}

// ---- insigna de notă (.rbadge)
@Composable
fun RBadge(r: Int?, raw: String = r?.toString().orEmpty(), size: Dp = 26.dp, fontSize: Float = 12f) {
    val c = puls
    val shape = RoundedCornerShape(8.dp)
    Box(
        Modifier.size(size).clip(shape)
            .background(if (r != null) c.rating(r) else c.surface2)
            .then(if (r == null) Modifier.border(1.dp, c.border, shape) else Modifier),
        contentAlignment = Alignment.Center,
    ) {
        Text(if (r != null) raw else "-", style = ro.bisericalogos.pulsul.nativ.ui.theme.mono(fontSize.sp, 700, if (r != null) Color.White else c.text3))
    }
}

// ---- bară orizontală (.bar-track + .bar-fill)
@Composable
fun BarTrack(fraction: Float, modifier: Modifier = Modifier, height: Dp = 12.dp, color: Color? = null) {
    val c = puls
    val col = color ?: c.accentMark
    Box(modifier.fillMaxWidth().height(height).clip(RoundedCornerShape(6.dp)).background(c.surface2)) {
        Box(
            Modifier.fillMaxWidth(fraction.coerceIn(0f, 1f)).height(height)
                .clip(RoundedCornerShape(topStart = 6.dp, bottomStart = 6.dp, topEnd = 4.dp, bottomEnd = 4.dp))
                .background(Brush.horizontalGradient(listOf(col.copy(alpha = .75f), col))),
        )
    }
}

// ---- rezumatul AI (.ai-summary)
@Composable
fun AiSummaryBox(tag: String, modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    val c = puls
    val shape = RoundedCornerShape(14.dp)
    Column(modifier.fillMaxWidth().clip(shape).background(mix(c.accent2Mark, .08f, c.surface)).border(1.dp, c.border, shape).padding(16.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(bottom = 10.dp)) {
            Icon(PulsIcons.get("sparkle"), null, tint = c.accent2Mark, modifier = Modifier.size(14.dp))
            Spacer(Modifier.width(6.dp))
            Text(tag.uppercase(), style = caps(11.sp, c.accent2Mark))
        }
        content()
    }
}

@Composable
fun Bullets(items: List<String>) {
    val c = puls
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        items.forEach { t ->
            Row {
                Text("•", style = body(14.sp, 700, c.text2), modifier = Modifier.width(18.dp))
                Text(t, style = body(14.sp, 400, c.text, 21.sp))
            }
        }
    }
}

// ---- câmpuri de formular: eticheta deasupra, eroarea dedesubt (.field + .input)
@Composable
fun Field(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    placeholder: String = "",
    password: Boolean = false,
    keyboardType: KeyboardType = KeyboardType.Text,
    imeAction: ImeAction = ImeAction.Next,
    onIme: (() -> Unit)? = null,
    singleLine: Boolean = true,
    minLines: Int = 1,
    capitalize: Boolean = false,
    error: String? = null,
    trailing: (@Composable () -> Unit)? = null,
    mono: Boolean = false,
) {
    val c = puls
    var focused by remember { mutableStateOf(false) }
    var shown by remember { mutableStateOf(false) }
    val shape = RoundedCornerShape(10.dp)
    Column(modifier, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(label, style = body(12.sp, 700, c.text2))
        Row(
            Modifier.fillMaxWidth().heightIn(min = 48.dp).clip(shape).background(c.surface)
                .border(if (focused) 2.dp else 1.dp, if (focused) c.accentMark else if (error != null) c.r1 else c.border, shape),
            verticalAlignment = if (singleLine) Alignment.CenterVertically else Alignment.Top,
        ) {
            BasicTextField(
                value = value, onValueChange = onValueChange,
                modifier = Modifier.weight(1f).padding(horizontal = 12.dp, vertical = 12.dp).onFocusChanged { focused = it.isFocused },
                singleLine = singleLine, minLines = minLines,
                textStyle = if (mono) ro.bisericalogos.pulsul.nativ.ui.theme.mono(16.sp, 500, c.text) else body(16.sp, 500, c.text),
                cursorBrush = SolidColor(c.accentMark),
                visualTransformation = if (password && !shown) PasswordVisualTransformation() else VisualTransformation.None,
                keyboardOptions = KeyboardOptions(
                    keyboardType = if (password) KeyboardType.Password else keyboardType,
                    imeAction = imeAction, autoCorrectEnabled = !password && capitalize,
                    capitalization = if (capitalize) KeyboardCapitalization.Sentences else KeyboardCapitalization.None,
                ),
                keyboardActions = KeyboardActions(onAny = { onIme?.invoke() }),
                decorationBox = { inner ->
                    Box {
                        if (value.isEmpty() && placeholder.isNotEmpty()) Text(placeholder, style = body(16.sp, 400, c.text3))
                        inner()
                    }
                },
            )
            if (password) {
                Box(
                    Modifier.size(width = 48.dp, height = 48.dp).clickable(role = Role.Switch) { shown = !shown },
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(PulsIcons.get("eye", 1.8f), if (shown) "Ascunde parola" else "Arată parola", tint = if (shown) c.accentMark else c.text3, modifier = Modifier.size(20.dp))
                }
            }
            trailing?.invoke()
        }
        if (error != null) Text(error, style = body(12.5.sp, 600, c.r1))
    }
}

// Selector ca un <select>: un câmp care deschide o listă de opțiuni într-un panou.
@Composable
fun SelectField(label: String, value: String, options: List<Pair<String, String>>, onSelect: (String) -> Unit, modifier: Modifier = Modifier, placeholder: String = "") {
    val c = puls
    var open by remember { mutableStateOf(false) }
    val shape = RoundedCornerShape(10.dp)
    Column(modifier, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(label, style = body(12.sp, 700, c.text2))
        Row(
            Modifier.fillMaxWidth().heightIn(min = 48.dp).clip(shape).background(c.surface).border(1.dp, c.border, shape)
                .clickable(role = Role.DropdownList) { open = true }.padding(horizontal = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            val shownLabel = options.firstOrNull { it.first == value }?.second ?: placeholder
            Text(shownLabel, style = body(16.sp, 500, if (value.isEmpty() && options.none { it.first == value }) c.text3 else c.text), modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text("›", style = body(20.sp, 400, c.text3), modifier = Modifier.graphicsLayer { rotationZ = 90f })
        }
    }
    if (open) {
        PulsSheet(onDismiss = { open = false }, title = label) {
            options.forEach { (key, text) ->
                SheetRow(label = text, selected = key == value, onClick = { onSelect(key); open = false })
            }
        }
    }
}

@Composable
fun Avatar(name: String, large: Boolean = false) {
    val c = puls
    val s = if (large) 48.dp else 34.dp
    Box(
        Modifier.size(s).clip(CircleShape).background(mix(c.accentMark, .16f, c.surface2))
            .border(1.dp, mix(c.accentMark, .30f, c.border), CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        Text(ro.bisericalogos.pulsul.nativ.domain.initials(name), style = body(if (large) 16.sp else 12.5.sp, 800, c.accentMark))
    }
}

@Composable
fun RowScope.Grow() = Spacer(Modifier.weight(1f))

@Composable
fun Gap(h: Dp) = Spacer(Modifier.height(h))

val NoBorder = BorderStroke(0.dp, Color.Transparent)

fun TextStyle.center() = copy(textAlign = TextAlign.Center)
