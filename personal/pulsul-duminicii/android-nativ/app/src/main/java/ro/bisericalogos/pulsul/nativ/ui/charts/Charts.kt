package ro.bisericalogos.pulsul.nativ.ui.charts

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.LayoutCoordinates
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.text.TextMeasurer
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import ro.bisericalogos.pulsul.nativ.domain.fixed
import ro.bisericalogos.pulsul.nativ.ui.components.LocalTips
import ro.bisericalogos.pulsul.nativ.ui.components.puls
import ro.bisericalogos.pulsul.nativ.ui.components.tipOnTap
import ro.bisericalogos.pulsul.nativ.ui.theme.body
import ro.bisericalogos.pulsul.nativ.ui.theme.mix
import ro.bisericalogos.pulsul.nativ.ui.theme.mono
import ro.bisericalogos.pulsul.nativ.ui.theme.numeric
import ro.bisericalogos.pulsul.nativ.ui.theme.shadowTint
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.floor

// ---------------------------------------------------------------- grafic linie
// Aceleași formule ca drawTrend()/renderTrend() de pe site: yMin/yMax rotunjite la jumătăți,
// linie portocalie cu strălucire, puncte cu contur de culoarea cardului.

data class LinePoint(
    val value: Double,
    val xLabel: String?,
    val tipTitle: String,
    val tipBody: String,
    val tipSub: String? = null,
    val color: Color? = null,
    val radius: Float = 4.5f,
    val valueLabel: String? = null,
    val valueLabelColor: Color? = null,
    val valueLabelBelow: Boolean = false,
    val bandLow: Double? = null,
    val bandHigh: Double? = null,
)

@Composable
fun LineChart(
    points: List<LinePoint>,
    height: Dp,
    modifier: Modifier = Modifier,
    refValue: Double? = null,
    includeRefInScale: Boolean = true,
    area: Boolean = false,
    glow: Boolean = true,
    padL: Float = 34f, padR: Float = 20f, padT: Float = 24f, padB: Float = 30f,
    // Implicit: scala 1-5 rotunjită la jumătăți (notele de pe categorie/predicator). Alte cifre
    // (ex. prezența, un număr de persoane sau un procent 0-100) își dau propriul domeniu — vezi
    // renderTrend() din attendance.html, care calculează yMin/yMax diferit față de category.html.
    yDomain: Pair<Double, Double>? = null,
    refLabel: String? = null,
) {
    val c = puls
    val tips = LocalTips.current
    val measurer = rememberTextMeasurer()
    var coords by remember { mutableStateOf<LayoutCoordinates?>(null) }
    val keys = remember(points.size) { List(points.size) { Any() } }
    val labelStyle = body(10.5.sp, 400, c.text3)
    val refStyle = mono(10.5.sp, 500, c.text3)

    Canvas(
        modifier.fillMaxWidth().height(height)
            .onGloballyPositioned { coords = it }
            .pointerInput(points) {
                detectTapGestures { tap ->
                    val xs = xPositions(points.size, size.width.toFloat(), padL.dp.toPx(), padR.dp.toPx())
                    val i = xs.indices.minByOrNull { abs(xs[it] - tap.x) } ?: return@detectTapGestures
                    if (abs(xs[i] - tap.x) > 28.dp.toPx()) { tips.hide(); return@detectTapGestures }
                    val p = points[i]
                    tips.toggle(keys[i], coords?.localToRoot(tap) ?: tap, p.tipTitle, p.tipBody, p.tipSub)
                }
            },
    ) {
        if (points.size < 2) return@Canvas
        val W = size.width; val H = size.height
        val pl = padL.dp.toPx(); val pr = padR.dp.toPx(); val pt = padT.dp.toPx(); val pb = padB.dp.toPx()
        val plotW = W - pl - pr; val plotH = H - pt - pb
        val values = points.map { it.value }
        val scaleVals = if (includeRefInScale && refValue != null) values + refValue else values
        val (yMin, yMax) = yDomain ?: (maxOf(1.0, floor(scaleVals.min() * 2) / 2 - 0.4) to minOf(5.0, ceil(scaleVals.max() * 2) / 2 + 0.2))
        fun y(v: Double) = (pt + (1 - (v - yMin) / (yMax - yMin)) * plotH).toFloat()
        val xs = xPositions(points.size, W, pl, pr)

        // banda de volatilitate (±1 deviație standard), sub linie
        if (points.all { it.bandLow != null && it.bandHigh != null }) {
            val band = Path().apply {
                points.forEachIndexed { i, p -> val yy = y(minOf(yMax, p.bandHigh!!)); if (i == 0) moveTo(xs[i], yy) else lineTo(xs[i], yy) }
                points.indices.reversed().forEach { i -> lineTo(xs[i], y(maxOf(yMin, points[i].bandLow!!))) }
                close()
            }
            drawPath(band, c.accentMark.copy(alpha = .14f))
        }
        if (refValue != null) {
            val ry = y(refValue)
            drawLine(c.text3.copy(alpha = .35f), Offset(pl, ry), Offset(W - pr, ry), 1.dp.toPx())
            // dacă ultimul punct are etichetă și stă lângă linie, „medie" trece sub linie
            val last = points.last()
            val clash = last.valueLabel != null && abs(y(last.value) - ry) < 26.dp.toPx()
            drawTextRight(measurer, refLabel ?: "medie ${fixed(refValue)}", W - pr - (if (clash) 22.dp.toPx() else 0f), if (clash) ry + 16.dp.toPx() else ry - 6.dp.toPx(), refStyle)
        }
        drawLine(c.border, Offset(pl, pt + plotH), Offset(W - pr, pt + plotH), 1.dp.toPx())

        val line = Path().apply { points.forEachIndexed { i, p -> if (i == 0) moveTo(xs[i], y(p.value)) else lineTo(xs[i], y(p.value)) } }
        if (area) {
            val fill = Path().apply { addPath(line); lineTo(xs.last(), pt + plotH); lineTo(xs.first(), pt + plotH); close() }
            drawPath(fill, Brush.verticalGradient(listOf(c.accent2Mark.copy(alpha = .16f), c.accent2Mark.copy(alpha = 0f)), startY = pt, endY = pt + plotH))
        }
        if (glow) drawPath(line, c.accent2Mark.copy(alpha = .22f), style = Stroke(6.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round))
        drawPath(line, c.accent2Mark, style = Stroke(2.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round))

        points.forEachIndexed { i, p ->
            val cx = xs[i]; val cy = y(p.value)
            drawCircle(p.color ?: c.accent2Mark, p.radius.dp.toPx(), Offset(cx, cy))
            drawCircle(c.surface, p.radius.dp.toPx(), Offset(cx, cy), style = Stroke(2.dp.toPx()))
            if (p.valueLabel != null) {
                val st = mono(12.sp, 700, p.valueLabelColor ?: c.accent)
                val baseY = if (p.valueLabelBelow) cy + 18.dp.toPx() else cy - 12.dp.toPx()
                drawTextCenter(measurer, p.valueLabel, cx, baseY, st)
            }
            if (p.xLabel != null) drawTextCenter(measurer, p.xLabel, cx, H - 8.dp.toPx(), labelStyle)
        }
    }
}

private fun xPositions(n: Int, w: Float, pl: Float, pr: Float): List<Float> =
    List(n) { i -> pl + (if (n > 1) i.toFloat() / (n - 1) else 0f) * (w - pl - pr) }

private fun DrawScope.drawTextCenter(m: TextMeasurer, text: String, x: Float, baseline: Float, style: TextStyle) {
    val l = m.measure(text, style)
    drawText(l, topLeft = Offset(x - l.size.width / 2f, baseline - l.firstBaseline))
}

private fun DrawScope.drawTextRight(m: TextMeasurer, text: String, x: Float, baseline: Float, style: TextStyle) {
    val l = m.measure(text, style)
    drawText(l, topLeft = Offset(x - l.size.width, baseline - l.firstBaseline))
}

// ---------------------------------------------------------------- cadranul din erou (Acasă)

@Composable
fun HeroDial(score: Double, monthly: List<Double>, modifier: Modifier = Modifier) {
    val c = puls
    Box(modifier.widthIn(max = 196.dp).fillMaxWidth().aspectRatio(1f), contentAlignment = Alignment.Center) {
        Canvas(Modifier.fillMaxSize()) {
            val s = size.minDimension / 200f
            val center = Offset(size.width / 2, size.height / 2)
            drawCircle(c.border, 92 * s, center, style = Stroke(1 * s))
            val sweep = (score / 5.0 * 360).toFloat()
            rotate(-90f, center) {
                drawArc(c.accent.copy(alpha = .25f), 0f, sweep, false, Offset(center.x - 92 * s, center.y - 92 * s), Size(184 * s, 184 * s), style = Stroke(7 * s, cap = StrokeCap.Round))
                drawArc(c.accent, 0f, sweep, false, Offset(center.x - 92 * s, center.y - 92 * s), Size(184 * s, 184 * s), style = Stroke(3 * s, cap = StrokeCap.Round))
            }
            if (monthly.isNotEmpty()) {
                val minA = monthly.min(); val maxA = monthly.max()
                val span = (maxA - minA).takeIf { it != 0.0 } ?: 1.0
                val path = Path()
                monthly.forEachIndexed { i, v ->
                    val x = (25 + (i.toFloat() / (monthly.size - 1).coerceAtLeast(1)) * 150) * s
                    val y = (150 - ((v - minA) / span * 40).toFloat()) * s
                    if (i == 0) path.moveTo(x, y) else path.lineTo(x, y)
                }
                drawPath(path, c.accent2.copy(alpha = .55f), style = Stroke(1.6f * s, cap = StrokeCap.Round, join = StrokeJoin.Round))
            }
        }
        Column(
            Modifier.fillMaxWidth(.64f).aspectRatio(1f)
                .shadow(if (c.isDark) 14.dp else 6.dp, CircleShape, ambientColor = if (c.isDark) c.accent.copy(.3f) else c.shadowTint.copy(.05f), spotColor = if (c.isDark) c.accent.copy(.3f) else c.shadowTint.copy(.1f))
                .clip(CircleShape).background(c.surface).border(1.dp, c.border, CircleShape),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Text(fixed(score), style = numeric(40.sp, 800, c.accent))
            Text("din 5.00", style = body(12.sp, 400, c.text3), modifier = Modifier.padding(top = 2.dp))
            Text("SCOR MEDIU GENERAL", style = ro.bisericalogos.pulsul.nativ.ui.theme.caps(10.5.sp, c.text3, .1f).copy(lineHeight = 14.sp, textAlign = androidx.compose.ui.text.style.TextAlign.Center), modifier = Modifier.padding(top = 8.dp).fillMaxWidth(.78f))
        }
    }
}

// ---------------------------------------------------------------- bare stivuite 1–5 (.stack)

@Composable
fun StackedBar(dist: List<Int>, tipTitle: (Int) -> String, modifier: Modifier = Modifier, height: Dp = 24.dp) {
    val c = puls
    val total = dist.sum()
    Row(modifier.fillMaxWidth().height(height).clip(RoundedCornerShape(6.dp)).background(c.surface), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
        dist.forEachIndexed { i, count ->
            if (count <= 0) return@forEachIndexed
            val pct = if (total > 0) count * 100.0 / total else 0.0
            Box(
                Modifier.weight(count.toFloat()).fillMaxHeight().background(c.rating(i + 1))
                    .tipOnTap(tipTitle(i), "$count din $total răspunsuri (${fixed(pct, 0)}%)"),
            )
        }
    }
}

@Composable
fun DistLegend(modifier: Modifier = Modifier) {
    val c = puls
    androidx.compose.foundation.layout.FlowRow(modifier.padding(bottom = 16.dp), horizontalArrangement = Arrangement.spacedBy(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        ro.bisericalogos.pulsul.nativ.ui.theme.ratingLabels.forEachIndexed { i, l ->
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.padding(end = 6.dp).height(10.dp).aspectRatio(1f).clip(RoundedCornerShape(3.dp)).background(c.rating(i + 1)))
                Text(l, style = body(12.5.sp, 400, c.text2))
            }
        }
    }
}

// ---------------------------------------------------------------- volum lunar (.vol-bars)

@Composable
fun VolumeBars(values: List<Triple<String, Int, String>>, modifier: Modifier = Modifier) {
    val c = puls
    val maxN = maxOf(1, values.maxOfOrNull { it.second } ?: 1)
    // cifra de sus + bara (max 108) + luna trebuie să încapă întregi: 170dp, nu 150 ca pe site,
    // unde cifra de sus iese peste marginea containerului
    Row(modifier.fillMaxWidth().height(170.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.Bottom) {
        values.forEach { (short, n, label) ->
            Column(
                Modifier.weight(1f).fillMaxHeight().tipOnTap(label, "$n răspunsuri completate"),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(8.dp, Alignment.Bottom),
            ) {
                Text("$n", style = mono(12.sp, 500, c.text2))
                Box(
                    Modifier.fillMaxWidth().widthIn(max = 34.dp).height(maxOf(6f, n.toFloat() / maxN * 108f).dp)
                        .clip(RoundedCornerShape(topStart = 5.dp, topEnd = 5.dp, bottomStart = 3.dp, bottomEnd = 3.dp))
                        .background(Brush.verticalGradient(listOf(c.accent2Mark.copy(alpha = .85f), c.accent2Mark))),
                )
                Text(short, style = body(11.5.sp, 400, c.text3), maxLines = 1)
            }
        }
    }
}

// ---------------------------------------------------------------- corelație, bară divergentă (.corr-track)

@Composable
fun DivergingBar(r: Double?, modifier: Modifier = Modifier) {
    val c = puls
    BoxWithConstraints(modifier.fillMaxWidth().height(20.dp).clip(RoundedCornerShape(6.dp)).background(c.surface2)) {
        val w = maxWidth
        if (r != null) {
            val pct = abs(r).toFloat() * .5f
            val left = if (r >= 0) .5f else .5f - pct
            Box(
                Modifier.offset(x = w * left).padding(vertical = 2.dp).width(w * pct).fillMaxHeight()
                    .clip(RoundedCornerShape(4.dp)).background(if (r >= 0) c.accentMark else c.accent2Mark),
            )
        }
        Box(Modifier.offset(x = w / 2).width(1.dp).fillMaxHeight().background(c.border))
    }
}

// culoarea unei celule din matricea de corelații (color-mix pe accent sau accent2)
@Composable
fun corrCellColor(r: Double): Pair<Color, Color> {
    val c = puls
    val pct = ((abs(r) * 85).let { Math.round(it) } + 12) / 100f
    val bg = mix(if (r >= 0) c.accentMark else c.accent2Mark, pct, c.surface)
    return bg to if (abs(r) >= .35) Color.White else c.text
}
