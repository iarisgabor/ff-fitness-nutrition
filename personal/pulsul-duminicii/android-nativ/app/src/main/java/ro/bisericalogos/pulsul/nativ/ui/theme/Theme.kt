package ro.bisericalogos.pulsul.nativ.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.text.ExperimentalTextApi
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.LineHeightStyle
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.sp
import ro.bisericalogos.pulsul.nativ.R

// Tokenii din src/shared.css (:root și tema întunecată), 1:1.
@Immutable
data class PulsColors(
    val isDark: Boolean,
    val bg: Color, val surface: Color, val surface2: Color, val surface3: Color, val border: Color,
    val text: Color, val text2: Color, val text3: Color,
    val accent: Color, val accentBright: Color, val accentMark: Color,
    val accent2: Color, val accent2Mark: Color,
    val r1: Color, val r2: Color, val r3: Color, val r4: Color, val r5: Color,
) {
    fun rating(n: Int): Color = when (n) { 1 -> r1; 2 -> r2; 3 -> r3; 4 -> r4; else -> r5 }
    // culoarea mediei: nota rotunjită, ca `var(--r${Math.round(avg)})` pe site
    fun forAvg(avg: Double?): Color = if (avg == null || avg == 0.0) r3 else rating(Math.round(avg).toInt().coerceIn(1, 5))
}

val LightColors = PulsColors(
    isDark = false,
    bg = Color(0xFFF1F3F8), surface = Color(0xFFFFFFFF), surface2 = Color(0xFFE8ECF3), surface3 = Color(0xFFDEE4ED),
    border = Color(0xFFD5DCE6), text = Color(0xFF12172A), text2 = Color(0xFF4A5468), text3 = Color(0xFF7C879C),
    accent = Color(0xFF4A3AA7), accentBright = Color(0xFF6B54D6), accentMark = Color(0xFF4A3AA7),
    accent2 = Color(0xFFEB6834), accent2Mark = Color(0xFFEB6834),
    r1 = Color(0xFFE34948), r2 = Color(0xFFEE9086), r3 = Color(0xFFACA9A2), r4 = Color(0xFF6DA7EC), r5 = Color(0xFF2A78D6),
)

val DarkColors = PulsColors(
    isDark = true,
    bg = Color(0xFF090C13), surface = Color(0xFF121826), surface2 = Color(0xFF1A2233), surface3 = Color(0xFF232C40),
    border = Color(0xFF2B3549), text = Color(0xFFEEF1F7), text2 = Color(0xFFA6B0C3), text3 = Color(0xFF6B7488),
    accent = Color(0xFF9085E9), accentBright = Color(0xFFAA9FF2), accentMark = Color(0xFF9085E9),
    accent2 = Color(0xFFD95926), accent2Mark = Color(0xFFD95926),
    r1 = Color(0xFFE66767), r2 = Color(0xFFDB8272), r3 = Color(0xFF8B8D97), r4 = Color(0xFF7FB4EF), r5 = Color(0xFF3987E5),
)

// color-mix(in srgb, a p%, b)
fun mix(a: Color, p: Float, b: Color): Color = lerp(b, a, p)

val LocalPuls = staticCompositionLocalOf { LightColors }

@OptIn(ExperimentalTextApi::class)
private fun variable(res: Int, w: Int) =
    Font(res, FontWeight(w), variationSettings = FontVariation.Settings(FontVariation.weight(w)))

val Sora = FontFamily(variable(R.font.sora, 600), variable(R.font.sora, 700), variable(R.font.sora, 800))
val Manrope = FontFamily(
    variable(R.font.manrope, 400), variable(R.font.manrope, 500), variable(R.font.manrope, 600),
    variable(R.font.manrope, 700), variable(R.font.manrope, 800),
)
val PlexMono = FontFamily(
    Font(R.font.plex_mono_medium, FontWeight.W500),
    Font(R.font.plex_mono_semibold, FontWeight.W600),
    Font(R.font.plex_mono_bold, FontWeight.W700),
)

private val tightLines = LineHeightStyle(LineHeightStyle.Alignment.Center, LineHeightStyle.Trim.None)

fun body(size: TextUnit, weight: Int = 400, color: Color = Color.Unspecified, lineHeight: TextUnit = TextUnit.Unspecified) =
    TextStyle(fontFamily = Manrope, fontSize = size, fontWeight = FontWeight(weight), color = color, lineHeight = lineHeight, lineHeightStyle = tightLines)

fun display(size: TextUnit, weight: Int = 700, color: Color = Color.Unspecified, lineHeight: TextUnit = TextUnit.Unspecified) =
    TextStyle(fontFamily = Sora, fontSize = size, fontWeight = FontWeight(weight), color = color, lineHeight = lineHeight, lineHeightStyle = tightLines)

// cifre tabulare: valorile care se schimbă nu „sar" (font-variant-numeric:tabular-nums)
fun mono(size: TextUnit, weight: Int = 600, color: Color = Color.Unspecified) =
    TextStyle(fontFamily = PlexMono, fontSize = size, fontWeight = FontWeight(weight), color = color, fontFeatureSettings = "tnum", lineHeightStyle = tightLines)

fun numeric(size: TextUnit, weight: Int = 800, color: Color = Color.Unspecified) =
    TextStyle(fontFamily = Manrope, fontSize = size, fontWeight = FontWeight(weight), color = color, fontFeatureSettings = "tnum", lineHeightStyle = tightLines)

// eticheta mică, cu litere mari (.kpi .tag, .yoy-label, .month-head)
fun caps(size: TextUnit = 10.5.sp, color: Color = Color.Unspecified, spacing: Float = 0.06f) =
    TextStyle(fontFamily = Manrope, fontSize = size, fontWeight = FontWeight.W700, color = color, letterSpacing = (size.value * spacing).sp)

@Composable
fun PulsTheme(dark: Boolean, content: @Composable () -> Unit) {
    val c = if (dark) DarkColors else LightColors
    val scheme = if (dark) darkColorScheme(
        primary = c.accentMark, onPrimary = Color.White, background = c.bg, onBackground = c.text,
        surface = c.surface, onSurface = c.text, surfaceVariant = c.surface2, onSurfaceVariant = c.text2,
        outline = c.border, outlineVariant = c.border, error = c.r1, surfaceContainerHigh = c.surface,
        surfaceContainerLow = c.surface, surfaceContainer = c.surface, surfaceContainerHighest = c.surface2,
    ) else lightColorScheme(
        primary = c.accentMark, onPrimary = Color.White, background = c.bg, onBackground = c.text,
        surface = c.surface, onSurface = c.text, surfaceVariant = c.surface2, onSurfaceVariant = c.text2,
        outline = c.border, outlineVariant = c.border, error = c.r1, surfaceContainerHigh = c.surface,
        surfaceContainerLow = c.surface, surfaceContainer = c.surface, surfaceContainerHighest = c.surface2,
    )
    CompositionLocalProvider(LocalPuls provides c) {
        MaterialTheme(colorScheme = scheme, content = content)
    }
}

val PulsColors.shadowTint: Color get() = if (isDark) Color.Black else Color(0xFF12172A)

val ratingLabels = listOf("1 · foarte slab", "2 · slab", "3 · neutru", "4 · bine", "5 · excelent")
