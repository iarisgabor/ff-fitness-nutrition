package ro.bisericalogos.pulsul.nativ.ui.screens

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDefaults
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import ro.bisericalogos.pulsul.nativ.PulsulApp
import ro.bisericalogos.pulsul.nativ.data.CategoriesPayload
import ro.bisericalogos.pulsul.nativ.data.CategoryPayload
import ro.bisericalogos.pulsul.nativ.data.Corr
import ro.bisericalogos.pulsul.nativ.data.rememberPage
import ro.bisericalogos.pulsul.nativ.domain.CategoryRange
import ro.bisericalogos.pulsul.nativ.domain.RANGE_OPTIONS
import ro.bisericalogos.pulsul.nativ.domain.fixed
import ro.bisericalogos.pulsul.nativ.domain.fullDateLabel
import ro.bisericalogos.pulsul.nativ.domain.monthShort
import ro.bisericalogos.pulsul.nativ.domain.parseDMY
import ro.bisericalogos.pulsul.nativ.domain.plural
import ro.bisericalogos.pulsul.nativ.domain.signed
import ro.bisericalogos.pulsul.nativ.ui.LocalNav
import ro.bisericalogos.pulsul.nativ.ui.Routes
import ro.bisericalogos.pulsul.nativ.ui.charts.DistLegend
import ro.bisericalogos.pulsul.nativ.ui.charts.DivergingBar
import ro.bisericalogos.pulsul.nativ.ui.charts.LineChart
import ro.bisericalogos.pulsul.nativ.ui.charts.LinePoint
import ro.bisericalogos.pulsul.nativ.ui.charts.StackedBar
import ro.bisericalogos.pulsul.nativ.ui.charts.corrCellColor
import ro.bisericalogos.pulsul.nativ.ui.components.AiSummaryBox
import ro.bisericalogos.pulsul.nativ.ui.components.BlockHead
import ro.bisericalogos.pulsul.nativ.ui.components.CatTab
import ro.bisericalogos.pulsul.nativ.ui.components.Cell
import ro.bisericalogos.pulsul.nativ.ui.components.CloseX
import ro.bisericalogos.pulsul.nativ.ui.components.DataTable
import ro.bisericalogos.pulsul.nativ.ui.components.DeltaText
import ro.bisericalogos.pulsul.nativ.ui.components.Disclosure
import ro.bisericalogos.pulsul.nativ.ui.components.EmptyState
import ro.bisericalogos.pulsul.nativ.ui.components.Kpi
import ro.bisericalogos.pulsul.nativ.ui.components.KpiGrid
import ro.bisericalogos.pulsul.nativ.ui.components.KpiSub
import ro.bisericalogos.pulsul.nativ.ui.components.ListSkeleton
import ro.bisericalogos.pulsul.nativ.ui.components.PCard
import ro.bisericalogos.pulsul.nativ.ui.components.PageFrame
import ro.bisericalogos.pulsul.nativ.ui.components.PageHead
import ro.bisericalogos.pulsul.nativ.ui.components.ToggleGroup
import ro.bisericalogos.pulsul.nativ.ui.components.cardSurface
import ro.bisericalogos.pulsul.nativ.ui.components.puls
import ro.bisericalogos.pulsul.nativ.ui.components.tipOnTap
import ro.bisericalogos.pulsul.nativ.ui.theme.body
import ro.bisericalogos.pulsul.nativ.ui.theme.caps
import ro.bisericalogos.pulsul.nativ.ui.theme.display
import ro.bisericalogos.pulsul.nativ.ui.theme.mix
import ro.bisericalogos.pulsul.nativ.ui.theme.mono
import ro.bisericalogos.pulsul.nativ.ui.theme.numeric
import kotlin.math.abs

private val H = Modifier.padding(horizontal = 16.dp)

// ---------------------------------------------------------------- /categorii

@Composable
fun CategoriesScreen() {
    val nav = LocalNav.current
    val vm = rememberPage<CategoriesPayload>("/categorii")
    var focused by rememberSaveable { mutableStateOf<String?>(null) }
    PageFrame(vm, "Analiză pe categorii", null, nav.openAccount, { ListSkeleton(7, 70) }, stale = { it.meta.stale }) { p, _ ->
        item("head") {
            PageHead(
                "Analiză pe categorii",
                "Alege o categorie ca să vezi cum a evoluat în timp: interval selectabil, cel mai bun și cel mai slab moment, distribuția notelor.",
                H,
            )
        }
        if (p.dims.isEmpty()) {
            item("empty") { EmptyState("Niciun răspuns găsit încă.", H) }
            return@PageFrame
        }
        item("gap") { Spacer(Modifier.height(20.dp)) }
        p.dims.forEach { d ->
            item(d.key) {
                val c = puls
                val color = if (d.n > 0) c.forAvg(d.avg) else c.r3
                PCard(H.padding(bottom = 8.dp).fillMaxWidth(), onClick = { nav.to(Routes.category(d.key)) }, leftBorder = color, padding = PaddingValues(start = 20.dp, end = 16.dp, top = 14.dp, bottom = 14.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(d.label, style = display(16.sp, 700, c.text))
                            Text(d.full, style = body(12.sp, 400, c.text3, 17.4.sp).copy(fontStyle = FontStyle.Italic), maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 2.dp))
                        }
                        Spacer(Modifier.width(14.dp))
                        Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(1.dp)) {
                            Text(if (d.n > 0) fixed(d.avg) else "-", style = mono(18.sp, 700, color))
                            Text("${d.n} ${plural(d.n, "răspuns", "răspunsuri")}", style = body(11.5.sp, 400, c.text2))
                        }
                    }
                }
            }
        }
        if (p.allKeys.size >= 2) item("heatmap") {
            Heatmap(p, focused) { key -> focused = if (focused == key) null else key }
        }
    }
}

private fun findCorr(list: List<Corr>, a: String, b: String) = list.firstOrNull { (it.a == a && it.b == b) || (it.a == b && it.b == a) }

private fun interpretR(r: Double): String {
    val a = abs(r)
    if (a < 0.05) return "fără corelație vizibilă"
    val strength = if (a >= 0.6) "puternică" else if (a >= 0.3) "moderată" else "slabă"
    return "corelație $strength ${if (r > 0) "pozitivă" else "negativă"}"
}

@Composable
private fun Heatmap(p: CategoriesPayload, focused: String?, onFocus: (String) -> Unit) {
    val c = puls
    val keys = p.allKeys
    val short = { label: String -> label.split(" ").first() }
    val labelW = 88.dp; val cellW = 56.dp; val cellH = 50.dp; val gap = 5.dp
    Column(H.padding(top = 20.dp, bottom = 36.dp)) {
        Text("Cum se leagă categoriile între ele", style = display(16.sp, 700, c.text))
        Text(
            "Corelație între mediile săptămânale a două categorii, calculată pe tot istoricul. Valori spre +1 înseamnă că cresc și scad împreună în aceeași duminică; spre -1 că merg în direcții opuse; aproape de 0 că sunt independente.",
            style = body(12.5.sp, 400, c.text3, 18.sp), modifier = Modifier.padding(top = 2.dp, bottom = 18.dp),
        )
        Column(Modifier.fillMaxWidth().cardSurface().padding(horizontal = 16.dp, vertical = 18.dp)) {
            val scroll = rememberScrollState()
            Row {
                // numele categoriilor rămân pe loc când matricea se derulează orizontal
                Column(verticalArrangement = Arrangement.spacedBy(gap)) {
                    Spacer(Modifier.height(34.dp))
                    keys.forEach { k -> HeatLabel(short(k.label), k.key == focused, labelW, cellH, Alignment.CenterStart) { onFocus(k.key) } }
                }
                Spacer(Modifier.width(gap))
                Column(Modifier.horizontalScroll(scroll), verticalArrangement = Arrangement.spacedBy(gap)) {
                    Row(horizontalArrangement = Arrangement.spacedBy(gap)) {
                        keys.forEach { k -> HeatLabel(short(k.label), k.key == focused, cellW, 34.dp, Alignment.Center) { onFocus(k.key) } }
                    }
                    keys.forEach { row ->
                        Row(horizontalArrangement = Arrangement.spacedBy(gap)) {
                            keys.forEach { col ->
                                val hl = focused != null && (row.key == focused || col.key == focused)
                                val dim = focused != null && !hl && row.key != col.key
                                val entry = findCorr(p.correlations, row.key, col.key)
                                val shape = RoundedCornerShape(8.dp)
                                val base = Modifier.size(cellW, cellH).graphicsLayer { alpha = if (dim) .32f else 1f }.clip(shape)
                                when {
                                    row.key == col.key -> Box(base.background(c.surface2), contentAlignment = Alignment.Center) { Text("-", style = mono(13.sp, 500, c.text3)) }
                                    entry?.r == null -> Box(
                                        base.background(c.surface2).tipOnTap("${row.label} × ${col.label}", "date insuficiente pentru o corelație de încredere (prea puține duminici cu răspunsuri la ambele)"),
                                        contentAlignment = Alignment.Center,
                                    ) { Text("-", style = mono(13.sp, 500, c.text3)) }
                                    else -> {
                                        val (bg, fg) = corrCellColor(entry.r)
                                        Box(
                                            base.background(bg).then(if (hl) Modifier.border(2.dp, c.accentMark, shape) else Modifier)
                                                .tipOnTap("${row.label} × ${col.label}", "r = ${fixed(entry.r)} · ${interpretR(entry.r)}", "${entry.n} duminici cu răspunsuri la ambele"),
                                            contentAlignment = Alignment.Center,
                                        ) { Text(fixed(entry.r), style = mono(12.sp, 700, fg)) }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            if (focused == null) {
                Text("Apasă pe numele unei categorii pentru un clasament detaliat al corelațiilor ei cu celelalte.", style = body(11.5.sp, 400, c.text3), modifier = Modifier.padding(top = 12.dp))
            } else {
                CorrDetail(p, focused, onClose = { onFocus(focused) })
            }
        }
        Row(Modifier.padding(top = 18.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("-1 (opuse)", style = body(12.sp, 400, c.text2))
            Box(Modifier.width(150.dp).height(10.dp).clip(RoundedCornerShape(5.dp)).background(Brush.horizontalGradient(listOf(c.accent2Mark, c.surface2, c.accentMark))))
            Text("+1 (împreună)", style = body(12.sp, 400, c.text2))
        }
    }
}

@Composable
private fun HeatLabel(text: String, hl: Boolean, w: androidx.compose.ui.unit.Dp, h: androidx.compose.ui.unit.Dp, align: Alignment, onClick: () -> Unit) {
    val c = puls
    Box(
        Modifier.size(w, h).clip(RoundedCornerShape(6.dp))
            .background(if (hl) mix(c.accentMark, .14f, c.surface) else c.surface)
            .clickable(role = Role.Button, onClick = onClick).padding(horizontal = 6.dp),
        contentAlignment = align,
    ) {
        Text(text, style = body(11.5.sp, 600, if (hl) c.accentMark else c.text2, 14.sp), textAlign = if (align == Alignment.Center) TextAlign.Center else TextAlign.Start, maxLines = 2)
    }
}

@Composable
private fun CorrDetail(p: CategoriesPayload, focus: String, onClose: () -> Unit) {
    val c = puls
    val focusLabel = p.allKeys.first { it.key == focus }.label
    val ranked = p.allKeys.filter { it.key != focus }
        .map { it to findCorr(p.correlations, focus, it.key) }
        .sortedByDescending { (_, e) -> e?.r?.let { abs(it) } ?: -1.0 }
    Column(Modifier.padding(top = 18.dp)) {
        ro.bisericalogos.pulsul.nativ.ui.components.HDivider()
        Row(Modifier.padding(top = 8.dp, bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("Cu ce se leagă mai mult $focusLabel", style = display(14.sp, 700, c.text), modifier = Modifier.weight(1f))
            CloseX(onClose)
        }
        Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
            ranked.forEach { (k, e) ->
                val r = e?.r
                Row(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp))
                        .then(if (r != null) Modifier.tipOnTap("$focusLabel × ${k.label}", "r = ${fixed(r)} · ${interpretR(r)}", "${e.n} duminici cu răspunsuri la ambele") else Modifier)
                        .padding(horizontal = 4.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text(k.label, style = body(13.sp, 600, c.text, 16.sp), modifier = Modifier.width(104.dp))
                    DivergingBar(r, Modifier.weight(1f))
                    Text(r?.let { fixed(it) } ?: "-", style = mono(13.sp, 600, if (r == null) c.text3 else c.text), modifier = Modifier.width(46.dp), textAlign = TextAlign.End)
                }
            }
        }
    }
}

// ---------------------------------------------------------------- /categorii/:key

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CategoryScreen(key: String) {
    val nav = LocalNav.current
    val g = PulsulApp.graph
    val vm = rememberPage<CategoryPayload>("/categorii/$key")
    var range by rememberSaveable { mutableStateOf(g.session.recall("range")?.takeIf { r -> RANGE_OPTIONS.any { it.first == r } } ?: "all") }
    var from by rememberSaveable { mutableStateOf(g.session.recall("range-from").orEmpty()) }
    var to by rememberSaveable { mutableStateOf(g.session.recall("range-to").orEmpty()) }
    var picking by remember { mutableStateOf<String?>(null) } // "from" | "to"
    val title = (vm.state as? ro.bisericalogos.pulsul.nativ.data.PageState.Ready)?.data?.label ?: "Categorie"

    PageFrame(vm, title, nav::back, nav.openAccount, { ListSkeleton(4, 96) }, stale = { it.meta.stale }) { p, _ ->
        // „Personalizat": se precompletează cu prima și ultima duminică, ca pe site
        val series = p.series
        val fromIso = from.ifEmpty { series.firstOrNull()?.let { CategoryRange.toIso(CategoryRange.dateOf(it)) }.orEmpty() }
        val toIso = to.ifEmpty { series.lastOrNull()?.let { CategoryRange.toIso(CategoryRange.dateOf(it)) }.orEmpty() }
        val result = CategoryRange.compute(series, range, fromIso, toIso)

        item("head") {
            val c = puls
            Column(H.padding(top = 18.dp)) {
                Text(p.label, style = display(26.sp, 700, c.text, 31.sp))
                if (p.full.isNotBlank()) Text(p.full, style = body(13.5.sp, 400, c.text3, 19.sp).copy(fontStyle = FontStyle.Italic), modifier = Modifier.padding(top = 6.dp))
            }
        }
        item("tabs") {
            val state = rememberLazyListState()
            val active = p.allKeys.indexOfFirst { it.key == p.key }.coerceAtLeast(0)
            LaunchedEffect(active) { state.scrollToItem((active - 1).coerceAtLeast(0)) }
            LazyRow(state = state, contentPadding = PaddingValues(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 18.dp, bottom = 12.dp)) {
                itemsIndexed(p.allKeys) { _, k -> CatTab(k.label, k.key == p.key, { if (k.key != p.key) nav.replace(Routes.category(k.key)) }) }
            }
        }
        item("range") {
            val c = puls
            Column(H.padding(top = 4.dp, bottom = 18.dp)) {
                ToggleGroup(RANGE_OPTIONS, range, { range = it; g.session.remember("range", it) }, scroll = true)
                if (range == "custom") {
                    Row(Modifier.padding(top = 14.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Text("de la", style = body(12.5.sp, 400, c.text2))
                        DateButton(fromIso, Modifier.weight(1f)) { picking = "from" }
                        Text("până la", style = body(12.5.sp, 400, c.text2))
                        DateButton(toIso, Modifier.weight(1f)) { picking = "to" }
                    }
                }
            }
        }

        if (result == null) {
            item("empty") { EmptyState("Niciun răspuns pentru această categorie în intervalul selectat.", H) }
            return@PageFrame
        }

        item("kpis") {
            val c = puls
            val cards = mutableListOf<@Composable (Modifier) -> Unit>(
                { m ->
                    val prev = result.prevAgg
                    Kpi("Medie interval selectat", fixed(result.agg.avg), m, sub = {
                        if (prev != null) { val d = result.agg.avg - prev.avg; DeltaText(d, "${signed(d)} față de perioada anterioară") } else KpiSub("din 5.00")
                    })
                },
                { m -> Kpi("Răspunsuri", "${result.agg.n}", m, sub = { KpiSub("în intervalul selectat") }) },
                { m -> Kpi("Cel mai bun moment", fullDateLabel(result.best.date), m, valueSize = 17f, sub = { KpiSub("medie ${fixed(result.best.avg)}") }) },
            )
            result.worst?.let { w -> cards += { m -> Kpi("Cel mai slab moment", fullDateLabel(w.date), m, valueSize = 17f, sub = { KpiSub("medie ${fixed(w.avg)}") }) } }
            result.goodStreak?.takeIf { it.len >= 2 }?.let { s ->
                cards += { m -> Kpi("Cea mai lungă perioadă bună", "${s.len} duminici", m, sub = { KpiSub("${fullDateLabel(s.from.date)} - ${fullDateLabel(s.to.date)}, peste media generală (${fixed(result.globalAvg)})") }) }
            }
            result.badStreak?.takeIf { it.len >= 2 }?.let { s ->
                cards += { m -> Kpi("Cea mai lungă perioadă de urmărit", "${s.len} duminici", m, sub = { KpiSub("${fullDateLabel(s.from.date)} - ${fullDateLabel(s.to.date)}, sub media generală") }) }
            }
            KpiGrid(cards, H)
        }

        item("trend") {
            val c = puls
            Column(H.padding(top = 24.dp)) {
                BlockHead(
                    "Evoluție în timp",
                    "Medie compozită pe duminică, în intervalul selectat. Punctele evidențiate marchează cel mai bun și cel mai slab moment; zona din jurul liniei arată ±1 deviație standard: cât de împrăștiate au fost notele în acea duminică, nu doar media lor.",
                )
                Column(Modifier.fillMaxWidth().cardSurface().padding(start = 14.dp, end = 14.dp, top = 18.dp, bottom = 10.dp)) {
                    val weeks = result.weeks
                    if (weeks.size < 2) {
                        EmptyState("Prea puține date în acest interval pentru un grafic.")
                    } else {
                        val tickCount = minOf(6, weeks.size)
                        val ticks = (if (tickCount <= 1) listOf(0) else List(tickCount) { i -> Math.round(i * (weeks.size - 1).toDouble() / (tickCount - 1)).toInt() }).toSet()
                        LineChart(
                            weeks.mapIndexed { i, w ->
                                val isBest = w.slug == result.best.slug
                                val isWorst = result.worst?.slug == w.slug
                                val std = CategoryRange.weekStdDev(w.dist, w.avg)
                                val dmy = parseDMY(w.date)
                                LinePoint(
                                    w.avg, if (i in ticks) "${dmy.dd}.${dmy.mm}" else null,
                                    fullDateLabel(w.date), "medie ${fixed(w.avg)} / 5", "${w.n} răspunsuri",
                                    color = if (isBest) c.r5 else if (isWorst) c.r1 else null,
                                    radius = if (isBest || isWorst) 6f else 4f,
                                    valueLabel = if (isBest || isWorst) fixed(w.avg) else null,
                                    valueLabelColor = if (isBest) c.r5 else c.r1,
                                    valueLabelBelow = isWorst,
                                    bandLow = w.avg - std, bandHigh = w.avg + std,
                                )
                            },
                            height = 220.dp, refValue = result.agg.avg, padL = 40f, padR = 24f, padT = 28f, padB = 34f,
                        )
                    }
                }
                val ai = p.trendSummaries[range]
                if (!ai.isNullOrBlank()) {
                    AiSummaryBox("Analiză AI · tendința pe acest interval", Modifier.padding(top = 16.dp)) {
                        Text(ai, style = body(14.sp, 400, c.text, 21.7.sp))
                    }
                }
            }
        }

        result.yoy?.let { y ->
            item("yoy") {
                val c = puls
                Column(H.padding(top = 24.dp)) {
                    BlockHead("Comparație an-pe-an", "Ultima lună calendaristică completă din interval, comparată cu aceeași lună din anul anterior, util pentru sezonalitate. Apare doar când există cel puțin un an de istoric.")
                    Column(Modifier.fillMaxWidth().cardSurface().padding(horizontal = 16.dp, vertical = 18.dp)) {
                        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceEvenly) {
                            YoyBlock(y.prevLabel, y.prev.avg, y.prev.n)
                            Text("→", style = body(22.sp, 400, c.text3))
                            YoyBlock(y.curLabel, y.cur.avg, y.cur.n)
                        }
                        Box(Modifier.fillMaxWidth().padding(top = 14.dp), contentAlignment = Alignment.Center) {
                            DeltaText(y.delta, signed(y.delta), 17f)
                        }
                    }
                }
            }
        }

        item("dist") {
            Column(H.padding(top = 24.dp)) {
                BlockHead("Distribuția notelor", "Ponderea notelor 1-5 pentru această categorie, în intervalul selectat.")
                Column(Modifier.fillMaxWidth().cardSurface().padding(horizontal = 16.dp, vertical = 18.dp)) {
                    DistLegend()
                    StackedBar(result.agg.dist, { i -> "Nota ${i + 1}" })
                }
            }
        }

        item("table") {
            Disclosure("Vezi toate duminicile din interval, ca tabel", H.padding(top = 24.dp)) {
                DataTable(
                    listOf("Duminică", "Răspunsuri", "Medie"),
                    result.weeks.reversed().map { w ->
                        val d = parseDMY(w.date)
                        listOf(Cell("${d.dd} ${monthShort(d.mm)} ${d.yyyy}"), Cell("${w.n}"), Cell(fixed(w.avg)))
                    },
                    firstColWidth = 130.dp, colWidth = 104.dp,
                )
            }
        }
        item("end") { Spacer(Modifier.height(40.dp)) }
    }

    if (picking != null) {
        val initial = if (picking == "from") from else to
        val state = rememberDatePickerState(initialSelectedDateMillis = initial.takeIf { it.isNotBlank() }?.let { isoToUtcMs(it) })
        val c = puls
        DatePickerDialog(
            onDismissRequest = { picking = null },
            confirmButton = {
                TextButton({
                    state.selectedDateMillis?.let { ms ->
                        val iso = utcMsToIso(ms)
                        if (picking == "from") { from = iso; g.session.remember("range-from", iso) } else { to = iso; g.session.remember("range-to", iso) }
                    }
                    picking = null
                }) { Text("Alege", style = body(14.sp, 700, c.accentMark)) }
            },
            dismissButton = { TextButton({ picking = null }) { Text("Renunță", style = body(14.sp, 700, c.text2)) } },
            colors = DatePickerDefaults.colors(containerColor = c.surface),
        ) { DatePicker(state, colors = DatePickerDefaults.colors(containerColor = c.surface, selectedDayContainerColor = c.accentMark, todayDateBorderColor = c.accentMark, todayContentColor = c.accentMark)) }
    }
}

// DatePicker lucrează în UTC; data aleasă e doar zi-lună-an.
private fun isoToUtcMs(iso: String): Long? = runCatching { java.time.LocalDate.parse(iso).atStartOfDay(java.time.ZoneOffset.UTC).toInstant().toEpochMilli() }.getOrNull()
private fun utcMsToIso(ms: Long): String = java.time.Instant.ofEpochMilli(ms).atZone(java.time.ZoneOffset.UTC).toLocalDate().toString()

@Composable
private fun DateButton(iso: String, modifier: Modifier, onClick: () -> Unit) {
    val c = puls
    val shape = RoundedCornerShape(8.dp)
    Box(
        modifier.heightIn(min = 44.dp).clip(shape).background(c.surface2).border(1.dp, c.border, shape)
            .clickable(role = Role.Button, onClick = onClick).padding(horizontal = 10.dp),
        contentAlignment = Alignment.CenterStart,
    ) {
        val p = iso.split("-")
        Text(if (p.size == 3) "${p[2]}.${p[1]}.${p[0]}" else "alege", style = mono(14.sp, 500, c.text))
    }
}

@Composable
private fun YoyBlock(label: String, avg: Double, n: Int) {
    val c = puls
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(label.uppercase(), style = caps(11.sp, c.text3))
        Text(fixed(avg), style = numeric(26.sp, 800, c.text), modifier = Modifier.padding(top = 6.dp))
        Text("$n răspunsuri", style = body(12.sp, 400, c.text2), modifier = Modifier.padding(top = 2.dp))
    }
}
