package ro.bisericalogos.pulsul.nativ.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDefaults
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import ro.bisericalogos.pulsul.nativ.PulsulApp
import ro.bisericalogos.pulsul.nativ.data.AttendancePayload
import ro.bisericalogos.pulsul.nativ.data.AttendanceWeek
import ro.bisericalogos.pulsul.nativ.data.rememberPage
import ro.bisericalogos.pulsul.nativ.domain.AttendanceRange
import ro.bisericalogos.pulsul.nativ.domain.RANGE_OPTIONS
import ro.bisericalogos.pulsul.nativ.domain.fixed
import ro.bisericalogos.pulsul.nativ.domain.fullDateLabel
import ro.bisericalogos.pulsul.nativ.domain.monthShort
import ro.bisericalogos.pulsul.nativ.domain.parseDMY
import ro.bisericalogos.pulsul.nativ.domain.plural
import ro.bisericalogos.pulsul.nativ.domain.signed
import ro.bisericalogos.pulsul.nativ.ui.LocalNav
import ro.bisericalogos.pulsul.nativ.ui.charts.LineChart
import ro.bisericalogos.pulsul.nativ.ui.charts.LinePoint
import ro.bisericalogos.pulsul.nativ.ui.components.BlockHead
import ro.bisericalogos.pulsul.nativ.ui.components.Cell
import ro.bisericalogos.pulsul.nativ.ui.components.DataTable
import ro.bisericalogos.pulsul.nativ.ui.components.DeltaText
import ro.bisericalogos.pulsul.nativ.ui.components.Disclosure
import ro.bisericalogos.pulsul.nativ.ui.components.EmptyState
import ro.bisericalogos.pulsul.nativ.ui.components.Kpi
import ro.bisericalogos.pulsul.nativ.ui.components.KpiGrid
import ro.bisericalogos.pulsul.nativ.ui.components.KpiSub
import ro.bisericalogos.pulsul.nativ.ui.components.ListSkeleton
import ro.bisericalogos.pulsul.nativ.ui.components.PageFrame
import ro.bisericalogos.pulsul.nativ.ui.components.PageHead
import ro.bisericalogos.pulsul.nativ.ui.components.ToggleGroup
import ro.bisericalogos.pulsul.nativ.ui.components.cardSurface
import ro.bisericalogos.pulsul.nativ.ui.components.puls
import ro.bisericalogos.pulsul.nativ.ui.theme.body
import ro.bisericalogos.pulsul.nativ.ui.theme.mono

private val H = Modifier.padding(horizontal = 16.dp)

// ---------------------------------------------------------------- /prezenta
// Port 1:1 din src/attendance.html (KPI-uri, toggle de metrică, selector de interval identic
// cu /categorii/:cheie, grafic, tabel). Nu reutilizează CategoryRange/CategoryScreen — cifrele
// aici sunt persoane/procente, nu note 1-5, la fel cum nici site-ul nu partajează renderTrend()
// între category.html și attendance.html (vezi AttendanceRange.kt).

private enum class AttMetric(val key: String, val label: String, val unit: String, val isPercent: Boolean) {
    TOTAL("total", "Total", "persoane", false),
    MEMBERS("members", "Parteneri", "parteneri", false),
    GUESTS("guests", "Musafiri", "musafiri", false),
    PERCENT("percent", "Procent", "%", true),
    ;

    fun get(w: AttendanceWeek): Double? = when (this) {
        TOTAL -> w.total.toDouble()
        MEMBERS -> w.members?.toDouble()
        GUESTS -> w.guests?.toDouble()
        PERCENT -> w.percent
    }

    companion object {
        fun from(key: String) = entries.firstOrNull { it.key == key } ?: TOTAL
    }
}

private val METRIC_OPTIONS = AttMetric.entries.map { it.key to it.label }

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AttendanceScreen() {
    val nav = LocalNav.current
    val g = PulsulApp.graph
    val vm = rememberPage<AttendancePayload>("/prezenta")
    var metric by rememberSaveable { mutableStateOf(g.session.recall("att-metric")?.let { AttMetric.from(it) }?.key ?: AttMetric.TOTAL.key) }
    var range by rememberSaveable { mutableStateOf(g.session.recall("att-range")?.takeIf { r -> RANGE_OPTIONS.any { it.first == r } } ?: "all") }
    var from by rememberSaveable { mutableStateOf(g.session.recall("att-range-from").orEmpty()) }
    var to by rememberSaveable { mutableStateOf(g.session.recall("att-range-to").orEmpty()) }
    var picking by remember { mutableStateOf<String?>(null) } // "from" | "to"

    PageFrame(vm, "Prezență", null, nav.openAccount, { ListSkeleton(5, 90) }, stale = { it.meta.stale }) { p, _ ->
        item("head") {
            PageHead(
                "Prezență",
                "Parteneri și musafiri, la fiecare duminică — citit automat dintr-un Sheet completat separat, nu manual în Program duminică. Procentul arată din câți parteneri ai bisericii au fost prezenți (musafirii nu intră la numitor).",
                H,
            )
        }

        val series = p.series
        if (series.isEmpty()) {
            item("empty") { EmptyState("Niciun rând de prezență găsit încă în Sheet.", H) }
            return@PageFrame
        }

        // "Personalizat": se precompletează cu prima și ultima duminică din Sheet, ca pe site
        val fromIso = from.ifEmpty { AttendanceRange.toIso(AttendanceRange.dateOf(series.first().date)) }
        val toIso = to.ifEmpty { AttendanceRange.toIso(AttendanceRange.dateOf(series.last().date)) }
        val result = AttendanceRange.compute(series, range, fromIso, toIso)

        item("range") {
            Column(H.padding(top = 4.dp, bottom = 4.dp)) {
                ToggleGroup(RANGE_OPTIONS, range, { range = it; g.session.remember("att-range", it) }, scroll = true)
                if (range == "custom") {
                    Row(Modifier.padding(top = 14.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Text("de la", style = body(12.5.sp, 400, puls.text2))
                        DateButton(fromIso, Modifier.weight(1f)) { picking = "from" }
                        Text("până la", style = body(12.5.sp, 400, puls.text2))
                        DateButton(toIso, Modifier.weight(1f)) { picking = "to" }
                    }
                }
            }
        }

        if (result == null) {
            item("empty2") { EmptyState("Niciun rând de prezență în intervalul selectat.", H.padding(top = 18.dp)) }
            return@PageFrame
        }

        item("kpis") {
            val cards = mutableListOf<@Composable (Modifier) -> Unit>(
                { m ->
                    val avg = result.avg.total
                    Kpi("Prezență medie", avg?.let { "${Math.round(it)}" } ?: "-", m, sub = {
                        val prev = result.prevAvg?.total
                        if (prev != null && avg != null) { val d = avg - prev; DeltaText(d, "${signed(d, 0)} față de perioada anterioară") }
                        else KpiSub("pe ${result.weeks.size} ${plural(result.weeks.size, "duminică", "duminici")}")
                    })
                },
                { m ->
                    val avg = result.avg.members
                    Kpi("Parteneri (medie)", avg?.let { "${Math.round(it)}" } ?: "-", m, sub = {
                        val prev = result.prevAvg?.members
                        if (prev != null && avg != null) { val d = avg - prev; DeltaText(d, "${signed(d, 0)} parteneri") } else KpiSub("medie pe interval")
                    })
                },
                { m ->
                    val avg = result.avg.guests
                    Kpi("Musafiri (medie)", avg?.let { "${Math.round(it)}" } ?: "-", m, sub = {
                        val prev = result.prevAvg?.guests
                        if (prev != null && avg != null) { val d = avg - prev; DeltaText(d, "${signed(d, 0)} musafiri") } else KpiSub("medie pe interval")
                    })
                },
                { m ->
                    val avg = result.avg.percent
                    Kpi("Procent parteneri (medie)", avg?.let { "${Math.round(it)}%" } ?: "-", m, sub = {
                        val prev = result.prevAvg?.percent
                        if (prev != null && avg != null) { val d = avg - prev; DeltaText(d, "${signed(d, 1)}% față de perioada anterioară") } else KpiSub("medie pe interval")
                    })
                },
            )
            cards += { m ->
                Kpi("Cea mai plină duminică", fullDateLabel(result.best.date), m, valueSize = 17f, sub = {
                    KpiSub("${result.best.total} persoane" + (result.best.percent?.let { " · ${Math.round(it)}% parteneri" } ?: ""))
                })
            }
            KpiGrid(cards, H.padding(top = 18.dp))
        }

        item("metric") {
            Column(H.padding(top = 18.dp)) {
                ToggleGroup(METRIC_OPTIONS, metric, { metric = it; g.session.remember("att-metric", it) })
            }
        }

        item("trend") {
            val c = puls
            val cur = AttMetric.from(metric)
            Column(H.padding(top = 22.dp)) {
                BlockHead("Evoluție în timp — ${cur.label}", "Un punct pe duminică, în intervalul selectat.")
                Column(Modifier.fillMaxWidth().cardSurface().padding(start = 14.dp, end = 14.dp, top = 18.dp, bottom = 10.dp)) {
                    val withVal = result.weeks.filter { cur.get(it) != null }
                    if (withVal.size < 2) {
                        EmptyState("Prea puține date în acest interval pentru un grafic.")
                    } else {
                        val vals = withVal.map { cur.get(it)!! }
                        val yDomain = if (cur.isPercent) 0.0 to 100.0 else {
                            val lo = maxOf(0.0, kotlin.math.floor(vals.min() * 0.9))
                            val hiRaw = kotlin.math.ceil(vals.max() * 1.1)
                            lo to (if (hiRaw <= lo) lo + 1 else hiRaw)
                        }
                        val avg = vals.average()
                        val best = withVal.maxByOrNull { cur.get(it)!! }
                        val worstCand = withVal.minByOrNull { cur.get(it)!! }
                        val worst = worstCand?.takeIf { it.slug != best?.slug }
                        val tickCount = minOf(6, withVal.size)
                        val ticks = (if (tickCount <= 1) listOf(0) else List(tickCount) { i -> Math.round(i * (withVal.size - 1).toDouble() / (tickCount - 1)).toInt() }).toSet()
                        val refLabel = if (cur.isPercent) "medie ${Math.round(avg)}%" else "medie ${fixed(avg, 1)} ${cur.unit}"
                        LineChart(
                            withVal.mapIndexed { i, w ->
                                val v = cur.get(w)!!
                                val isBest = w.slug == best?.slug
                                val isWorst = w.slug == worst?.slug
                                val dmy = parseDMY(w.date)
                                LinePoint(
                                    v, if (i in ticks) "${dmy.dd}.${dmy.mm}" else null,
                                    fullDateLabel(w.date),
                                    "${w.total} persoane" + (w.members?.let { " · $it parteneri" } ?: "") + (w.guests?.let { " · $it musafiri" } ?: ""),
                                    tipSub = w.percent?.let { "${Math.round(it)}% dintre parteneri" },
                                    color = if (isBest) c.r5 else if (isWorst) c.r1 else null,
                                    radius = if (isBest || isWorst) 6f else 4f,
                                    valueLabel = if (isBest || isWorst) (if (cur.isPercent) "${Math.round(v)}%" else "${Math.round(v)}") else null,
                                    valueLabelColor = if (isBest) c.r5 else c.r1,
                                    valueLabelBelow = isWorst,
                                )
                            },
                            height = 220.dp, refValue = avg, yDomain = yDomain, refLabel = refLabel,
                            padL = 40f, padR = 24f, padT = 28f, padB = 34f,
                        )
                    }
                }
            }
        }

        item("table") {
            Disclosure("Vezi toate duminicile din interval, ca tabel", H.padding(top = 24.dp)) {
                DataTable(
                    listOf("Duminică", "Parteneri", "Musafiri", "Total", "Procent"),
                    result.weeks.reversed().map { w ->
                        val d = parseDMY(w.date)
                        listOf(
                            Cell("${d.dd} ${monthShort(d.mm)} ${d.yyyy}"),
                            Cell(w.members?.toString() ?: "-"),
                            Cell(w.guests?.toString() ?: "-"),
                            Cell("${w.total}"),
                            Cell(w.percent?.let { "${Math.round(it)}%" } ?: "-"),
                        )
                    },
                    firstColWidth = 110.dp, colWidth = 84.dp,
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
                        if (picking == "from") { from = iso; g.session.remember("att-range-from", iso) } else { to = iso; g.session.remember("att-range-to", iso) }
                    }
                    picking = null
                }) { Text("Alege", style = body(14.sp, 700, c.accentMark)) }
            },
            dismissButton = { TextButton({ picking = null }) { Text("Renunță", style = body(14.sp, 700, c.text2)) } },
            colors = DatePickerDefaults.colors(containerColor = c.surface),
        ) { DatePicker(state, colors = DatePickerDefaults.colors(containerColor = c.surface, selectedDayContainerColor = c.accentMark, todayDateBorderColor = c.accentMark, todayContentColor = c.accentMark)) }
    }
}

// DatePicker lucrează în UTC; data aleasă e doar zi-lună-an (duplicat mic din CategoryScreens.kt
// — fișiere diferite, funcții `private`, nu se pot reutiliza direct).
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
        val parts = iso.split("-")
        Text(if (parts.size == 3) "${parts[2]}.${parts[1]}.${parts[0]}" else "alege", style = mono(14.sp, 500, c.text))
    }
}
