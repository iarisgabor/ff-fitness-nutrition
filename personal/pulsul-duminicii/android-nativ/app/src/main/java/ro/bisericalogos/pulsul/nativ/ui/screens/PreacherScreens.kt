package ro.bisericalogos.pulsul.nativ.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import ro.bisericalogos.pulsul.nativ.data.PageState
import ro.bisericalogos.pulsul.nativ.data.PreacherPayload
import ro.bisericalogos.pulsul.nativ.data.PreachersPayload
import ro.bisericalogos.pulsul.nativ.data.rememberPage
import ro.bisericalogos.pulsul.nativ.domain.fixed
import ro.bisericalogos.pulsul.nativ.domain.formatDuration
import ro.bisericalogos.pulsul.nativ.domain.formatSlugLong
import ro.bisericalogos.pulsul.nativ.domain.jsRound
import ro.bisericalogos.pulsul.nativ.domain.parseDMY
import ro.bisericalogos.pulsul.nativ.domain.plural
import ro.bisericalogos.pulsul.nativ.domain.signed
import ro.bisericalogos.pulsul.nativ.domain.slugToDots
import ro.bisericalogos.pulsul.nativ.ui.LocalNav
import ro.bisericalogos.pulsul.nativ.ui.Routes
import ro.bisericalogos.pulsul.nativ.ui.charts.LineChart
import ro.bisericalogos.pulsul.nativ.ui.charts.LinePoint
import ro.bisericalogos.pulsul.nativ.ui.components.BarTrack
import ro.bisericalogos.pulsul.nativ.ui.components.BlockHead
import ro.bisericalogos.pulsul.nativ.ui.components.Cell
import ro.bisericalogos.pulsul.nativ.ui.components.Chip
import ro.bisericalogos.pulsul.nativ.ui.components.DataTable
import ro.bisericalogos.pulsul.nativ.ui.components.DeltaText
import ro.bisericalogos.pulsul.nativ.ui.components.EmptyState
import ro.bisericalogos.pulsul.nativ.ui.components.HDivider
import ro.bisericalogos.pulsul.nativ.ui.components.Kpi
import ro.bisericalogos.pulsul.nativ.ui.components.KpiGrid
import ro.bisericalogos.pulsul.nativ.ui.components.KpiSub
import ro.bisericalogos.pulsul.nativ.ui.components.ListSkeleton
import ro.bisericalogos.pulsul.nativ.ui.components.Notice
import ro.bisericalogos.pulsul.nativ.ui.components.PCard
import ro.bisericalogos.pulsul.nativ.ui.components.PageFrame
import ro.bisericalogos.pulsul.nativ.ui.components.PageHead
import ro.bisericalogos.pulsul.nativ.ui.components.PulsIcons
import ro.bisericalogos.pulsul.nativ.ui.components.cardSurface
import ro.bisericalogos.pulsul.nativ.ui.components.puls
import ro.bisericalogos.pulsul.nativ.ui.theme.body
import ro.bisericalogos.pulsul.nativ.ui.theme.display
import ro.bisericalogos.pulsul.nativ.ui.theme.mono

private val H = Modifier.padding(horizontal = 16.dp)

// ---------------------------------------------------------------- /predicatori

@Composable
fun PreachersScreen() {
    val nav = LocalNav.current
    val vm = rememberPage<PreachersPayload>("/predicatori")
    PageFrame(vm, "Predicatori", null, nav.openAccount, { ListSkeleton(5, 70) }, stale = { it.meta.stale }) { p, _ ->
        item("head") { PageHead("Predicatori", "Nota la Predică și cum arată celelalte dimensiuni în duminicile fiecăruia, comparativ cu restul duminicilor.", H) }
        p.scheduleError?.let { e -> item("notice") { Notice(e, H.padding(top = 24.dp)) } }
        if (p.preachers.isEmpty()) {
            item("empty") { EmptyState("Niciun predicator cu duminici suprapuse peste datele de feedback încă.", H.padding(top = 20.dp)) }
            return@PageFrame
        }
        item("gap") { Spacer(Modifier.height(20.dp)) }
        p.preachers.forEach { pr ->
            item(pr.slug) {
                val c = puls
                val color = c.forAvg(pr.avgOverall)
                PCard(H.padding(bottom = 8.dp).fillMaxWidth(), onClick = { nav.to(Routes.preacher(pr.slug)) }, leftBorder = color, padding = PaddingValues(start = 20.dp, end = 16.dp, top = 14.dp, bottom = 14.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(pr.name, style = display(16.sp, 700, c.text))
                            Text("${pr.sundayCount} ${plural(pr.sundayCount, "duminică", "duminici")} cu feedback", style = body(12.5.sp, 400, c.text3), modifier = Modifier.padding(top = 4.dp))
                        }
                        Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(1.dp)) {
                            Text(pr.avgQ5?.let { fixed(it) } ?: "-", style = mono(18.sp, 700, color))
                            Text("medie la Predică", style = body(11.5.sp, 400, c.text2))
                        }
                    }
                }
            }
        }
        item("comparison") {
            val c = puls
            Column(H.padding(top = 8.dp, bottom = 36.dp)) {
                Text("Comparație directă, pe dimensiuni", style = display(16.sp, 700, c.text))
                Text("Media fiecărei dimensiuni, calculată doar din duminicile în care a predicat omul respectiv.", style = body(12.5.sp, 400, c.text3, 18.sp), modifier = Modifier.padding(top = 2.dp, bottom = 18.dp))
                Column(Modifier.fillMaxWidth().cardSurface().padding(horizontal = 16.dp, vertical = 14.dp)) {
                    DataTable(
                        listOf("Dimensiune") + p.preachers.map { it.name },
                        p.comparisonRows.map { row ->
                            listOf(Cell(row.label)) + p.preachers.map { pr ->
                                val e = row.perPreacher.firstOrNull { it.slug == pr.slug }
                                if (e?.avg == null) Cell("-", c.text3) else Cell(fixed(e.avg), c.forAvg(e.avg), bold = true)
                            }
                        },
                        firstColWidth = 140.dp, colWidth = 82.dp,
                    )
                }
            }
        }
    }
}

// ---------------------------------------------------------------- /predicatori/:slug și /eu

@Composable
fun PreacherScreen(slug: String?) {
    val nav = LocalNav.current
    val self = slug == null
    val vm = rememberPage<PreacherPayload>(if (self) "/eu" else "/predicatori/$slug")
    val ready = vm.state as? PageState.Ready
    val title = ready?.data?.let { if (it.self) "Salut, ${it.name}" else it.name } ?: if (self) "Statisticile mele" else "Predicator"
    PageFrame(vm, title, if (self) null else nav::back, nav.openAccount, { ListSkeleton(4, 90) }, stale = { it.meta.stale }) { p, _ ->
        preacherContent(p, onDay = { nav.to(Routes.day(it)) }, onProgram = { nav.to(Routes.programEdit(it)) })
    }
}

private fun LazyListScope.preacherContent(p: PreacherPayload, onDay: (String) -> Unit, onProgram: (String) -> Unit) {
    val self = p.self
    val his = if (self) "tale" else "lui"
    fun txt(s: String) = if (self) s.replace("duminicile lui", "duminicile tale").replace("prezența lui", "prezența ta") else s

    item("head") {
        val c = puls
        Column(H.padding(top = 18.dp)) {
            Text(if (self) "Salut, ${p.name}" else p.name, style = display(26.sp, 700, c.text, 31.sp))
            Text("${p.sundayCount} ${plural(p.sundayCount, "duminică", "duminici")} cu feedback", style = body(13.5.sp, 400, c.text3), modifier = Modifier.padding(top = 6.dp))
        }
    }
    val notices = listOfNotNull(
        p.scheduleError,
        if (p.sundayCount in 1..2) "Date limitate: doar ${p.sundayCount} ${plural(p.sundayCount, "duminică", "duminici")} până acum. Cifrele de mai jos sunt orientative, se stabilizează pe măsură ce trec mai multe duminici." else null,
    )
    notices.forEachIndexed { i, n -> item("notice-$i") { Notice(n, H.padding(top = 20.dp)) } }

    // Pentru predicatorul logat, ce are de pregătit contează mai mult decât cifrele: urcă primul.
    if (self) upcoming(p, onProgram)

    item("kpis") {
        val c = puls
        val q5 = p.comparison.firstOrNull { it.key == "q5" }
        val a = p.attendance
        val deltaOverall = if (p.avgOverall != null && p.meta.globalOverallAvg != null && p.meta.globalOverallAvg != 0.0) p.avgOverall - p.meta.globalOverallAvg else null
        KpiGrid(listOf(
            { m -> Kpi("Medie la Predică", q5?.theirAvg?.let { fixed(it) } ?: "-", m, sub = { if (q5 != null) KpiSub("${q5.theirN} note") }) },
            { m -> Kpi("Duminici cu feedback", "${p.sundayCount}", m, sub = { KpiSub("suprapuse cu calendarul de predicare") }) },
            { m ->
                if (a.theirAvg == null) Kpi("Prezență medie", "-", m, sub = { KpiSub("necompletată încă în Program duminică") })
                else {
                    val d = a.restAvg?.let { a.theirAvg - it }
                    Kpi("Prezență medie", "${jsRound(a.theirAvg)}", m, sub = {
                        if (d != null) DeltaText(d, "${if (d >= 0) "+" else ""}${jsRound(d)} față de restul duminicilor")
                        else KpiSub("din ${a.perSunday.size} ${plural(a.perSunday.size, "duminică", "duminici")}")
                    })
                }
            },
            { m ->
                Kpi("Medie compozită (toate dimensiunile)", p.avgOverall?.let { fixed(it) } ?: "-", m, sub = {
                    deltaOverall?.let { DeltaText(it, "${signed(it)} față de media generală") }
                })
            },
        ), H.padding(top = 24.dp))
    }

    if (!self) upcoming(p, onProgram)

    item("trend") {
        val c = puls
        Column(H.padding(top = 26.dp)) {
            BlockHead("Nota la Predică, în timp", txt("Media de zi, doar din duminicile lui. Punctele arată câte răspunsuri au fost în acea duminică."))
            Column(Modifier.fillMaxWidth().cardSurface().padding(start = 14.dp, end = 14.dp, top = 18.dp, bottom = 10.dp)) {
                val withData = p.q5Series.filter { it.n > 0 }
                if (withData.size < 2) EmptyState("Prea puține duminici încă pentru un grafic.")
                else LineChart(
                    withData.map { w ->
                        val d = parseDMY(w.date)
                        LinePoint(w.avg, "${d.dd}.${d.mm}", "${d.dd}.${d.mm}.${d.yyyy}", "medie ${fixed(w.avg)} / 5", "${w.n} răspunsuri", radius = 5f)
                    },
                    height = 200.dp, includeRefInScale = false, glow = false, padL = 40f, padR = 24f, padT = 24f, padB = 32f,
                )
            }
        }
    }

    item("comparison") {
        val c = puls
        Column(H.padding(top = 26.dp)) {
            BlockHead(
                txt("Celelalte dimensiuni, în duminicile lui vs. restul"),
                txt("Dacă prezența lui la Predică se leagă și de cum ies celelalte departamente în acea duminică: nu doar coincidență, dar nici dovadă fermă cu puține duminici."),
            )
            Column(Modifier.fillMaxWidth().cardSurface().padding(horizontal = 16.dp, vertical = 14.dp)) {
                DataTable(
                    listOf("Dimensiune", "Duminicile $his", "Restul duminicilor", "Diferență"),
                    p.comparison.map { row ->
                        val delta = row.delta
                        val deltaCell = when {
                            delta == null -> Cell("-", c.text3, bold = true)
                            kotlin.math.abs(delta) < 0.05 -> Cell(signed(delta), c.text3, bold = true)
                            delta > 0 -> Cell(signed(delta), c.r5, bold = true)
                            else -> Cell(signed(delta), c.r1, bold = true)
                        }
                        listOf(Cell(row.label), Cell(row.theirAvg?.let { fixed(it) } ?: "-"), Cell(row.restAvg?.let { fixed(it) } ?: "-"), deltaCell)
                    },
                    firstColWidth = 140.dp, colWidth = 110.dp,
                )
            }
        }
    }

    item("attendance") {
        val c = puls
        val a = p.attendance
        Column(H.padding(top = 26.dp)) {
            BlockHead("Prezența", "Numărul de participanți, trecut după fiecare întâlnire în Program duminică.")
            Column(Modifier.fillMaxWidth().cardSurface().padding(horizontal = 16.dp, vertical = 18.dp)) {
                if (a.theirAvg == null) {
                    Text(
                        "Încă nu e trecută prezența la nicio duminică în care ${if (self) "ai predicat" else "a predicat"}. Se completează din Program duminică, după fiecare întâlnire.",
                        style = body(12.sp, 400, c.text3, 17.sp),
                    )
                } else {
                    val max = listOfNotNull(a.theirAvg, a.restAvg).plus(a.perSunday.map { it.attendance }).maxOrNull()?.takeIf { it > 0 } ?: 1.0
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        AttRow("Media duminicilor $his", a.theirAvg, max, c.accent2Mark)
                        a.restAvg?.let { AttRow("Media celorlalte", it, max, c.accentMark) }
                    }
                    if (a.perSunday.isNotEmpty()) {
                        HDivider(Modifier.padding(top = 18.dp, bottom = 16.dp))
                        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                            a.perSunday.reversed().forEach { AttRow(slugToDots(it.date), it.attendance, max, c.accent2Mark) }
                        }
                    }
                }
            }
        }
    }

    item("quotes") {
        val c = puls
        Column(H.padding(top = 26.dp)) {
            BlockHead(txt("Ce au scris oamenii despre Predică, în duminicile lui"))
            if (p.quotes.isEmpty()) EmptyState(txt("Niciun comentariu liber la Predică, în duminicile lui, până acum."))
            else Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                p.quotes.forEach { q ->
                    Text(q, style = body(13.5.sp, 400, c.text, 20.9.sp), modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(c.surface2).padding(horizontal = 16.dp, vertical = 14.dp))
                }
            }
        }
    }

    val fdays = p.feedbackDates.sorted().reversed()
    if (fdays.isNotEmpty()) item("days") {
        Column(H.padding(top = 26.dp, bottom = 40.dp)) {
            BlockHead("Feedback-ul complet, pe fiecare duminică", "Toate categoriile și comentariile din acea zi.")
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                fdays.forEach { d -> Chip(slugToDots(d), name = true, onClick = { onDay(d) }) }
            }
        }
    } else item("end") { Spacer(Modifier.height(40.dp)) }
}

private fun LazyListScope.upcoming(p: PreacherPayload, onProgram: (String) -> Unit) {
    if (p.upcoming.isEmpty()) return
    item("upcoming") {
        val c = puls
        Column(H.padding(top = 26.dp)) {
            BlockHead(
                if (p.self) "Duminicile în care predici" else "Duminicile următoare în care predică",
                if (p.self) "Deschide programul ca să completezi partea de predică și să urci slide-urile." else "Din Program duminică și din Calendar predicare.",
            )
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                p.upcoming.forEach { u ->
                    if (u.planned) {
                        PCard(Modifier.fillMaxWidth(), onClick = { onProgram(u.date) }, padding = PaddingValues(14.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Column(Modifier.weight(1f)) {
                                    Text(formatSlugLong(u.date), style = body(14.sp, 700, c.text))
                                    Text("program pregătit${if (u.totalSec > 0) " · " + formatDuration(u.totalSec) else ""}", style = body(12.5.sp, 400, c.text3), modifier = Modifier.padding(top = 3.dp))
                                }
                                if (u.resourceCount > 0) {
                                    Icon(PulsIcons.get("clip"), null, tint = c.text3, modifier = Modifier.size(13.dp))
                                    Text(" ${u.resourceCount} · ", style = body(12.5.sp, 400, c.text3))
                                }
                                Text("deschide ›", style = body(12.5.sp, 400, c.text3))
                            }
                        }
                    } else {
                        PCard(Modifier.fillMaxWidth(), dashed = true, padding = PaddingValues(14.dp)) {
                            Text(formatSlugLong(u.date), style = body(14.sp, 700, c.text))
                            Text("în calendar · programul nu e creat încă", style = body(12.5.sp, 400, c.text3), modifier = Modifier.padding(top = 3.dp))
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun AttRow(label: String, value: Double, max: Double, color: androidx.compose.ui.graphics.Color) {
    val c = puls
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(label, style = body(13.sp, 400, c.text), modifier = Modifier.width(104.dp))
        BarTrack((value / max).toFloat(), Modifier.weight(1f), height = 16.dp, color = color)
        Text("${jsRound(value)}", style = mono(13.sp, 600, c.text), modifier = Modifier.width(44.dp), textAlign = TextAlign.End)
    }
}
