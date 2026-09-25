package ro.bisericalogos.pulsul.nativ.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.gestures.snapping.rememberSnapFlingBehavior
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import ro.bisericalogos.pulsul.nativ.data.HomePayload
import ro.bisericalogos.pulsul.nativ.data.rememberPage
import ro.bisericalogos.pulsul.nativ.domain.fixed
import ro.bisericalogos.pulsul.nativ.ui.LocalNav
import ro.bisericalogos.pulsul.nativ.ui.Routes
import ro.bisericalogos.pulsul.nativ.ui.charts.DistLegend
import ro.bisericalogos.pulsul.nativ.ui.charts.HeroDial
import ro.bisericalogos.pulsul.nativ.ui.charts.LineChart
import ro.bisericalogos.pulsul.nativ.ui.charts.LinePoint
import ro.bisericalogos.pulsul.nativ.ui.charts.StackedBar
import ro.bisericalogos.pulsul.nativ.ui.charts.VolumeBars
import ro.bisericalogos.pulsul.nativ.ui.components.BarTrack
import ro.bisericalogos.pulsul.nativ.ui.components.Bone
import ro.bisericalogos.pulsul.nativ.ui.components.Cell
import ro.bisericalogos.pulsul.nativ.ui.components.DataTable
import ro.bisericalogos.pulsul.nativ.ui.components.Disclosure
import ro.bisericalogos.pulsul.nativ.ui.components.HDivider
import ro.bisericalogos.pulsul.nativ.ui.components.Kpi
import ro.bisericalogos.pulsul.nativ.ui.components.KpiGrid
import ro.bisericalogos.pulsul.nativ.ui.components.KpiSub
import ro.bisericalogos.pulsul.nativ.ui.components.PageFrame
import ro.bisericalogos.pulsul.nativ.ui.components.SectionHead
import ro.bisericalogos.pulsul.nativ.ui.components.SkeletonCard
import ro.bisericalogos.pulsul.nativ.ui.components.cardSurface
import ro.bisericalogos.pulsul.nativ.ui.components.cssColor
import ro.bisericalogos.pulsul.nativ.ui.components.puls
import ro.bisericalogos.pulsul.nativ.ui.components.tappable
import ro.bisericalogos.pulsul.nativ.ui.components.tipOnTap
import ro.bisericalogos.pulsul.nativ.ui.theme.PlexMono
import ro.bisericalogos.pulsul.nativ.ui.theme.Sora
import ro.bisericalogos.pulsul.nativ.ui.theme.body
import ro.bisericalogos.pulsul.nativ.ui.theme.caps
import ro.bisericalogos.pulsul.nativ.ui.theme.display
import ro.bisericalogos.pulsul.nativ.ui.theme.mono
import ro.bisericalogos.pulsul.nativ.ui.theme.numeric

private val H = Modifier.padding(horizontal = 16.dp)

@Composable
fun HomeScreen() {
    val nav = LocalNav.current
    val vm = rememberPage<HomePayload>("")
    PageFrame(vm, "Acasă", onBack = null, onAccount = nav.openAccount, skeleton = { HomeSkeleton() }, stale = { it.meta.stale }) { p, _ ->
        homeContent(p) { nav.tab(Routes.DAYS) }
    }
}

private fun LazyListScope.homeContent(p: HomePayload, openDays: () -> Unit) {
    val d = p.data
    val meta = p.meta

    // ---- erou: pe telefon cadranul e primul, apoi cele trei cifre, apoi titlul
    item("hero") {
        val c = puls
        Column(H.padding(top = 18.dp, bottom = 8.dp)) {
            HeroDial(d.overallAvg, d.months.map { it.avg }, Modifier.align(Alignment.CenterHorizontally))
            Spacer(Modifier.height(18.dp))
            if (meta.heroKpis.isNotEmpty()) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth().padding(bottom = 22.dp)) {
                    meta.heroKpis.forEach { k ->
                        Column(
                            Modifier.weight(1f).clip(RoundedCornerShape(14.dp)).background(c.surface).border(1.dp, c.border, RoundedCornerShape(14.dp))
                                .padding(horizontal = 10.dp, vertical = 12.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                        ) {
                            Text(k.value, style = numeric(20.sp, 800, cssColor(k.color, c.accent)))
                            Text(k.label, style = body(11.sp, 400, c.text3, 14.3.sp).copy(textAlign = androidx.compose.ui.text.style.TextAlign.Center), modifier = Modifier.padding(top = 4.dp))
                        }
                    }
                }
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.width(16.dp).height(1.dp).background(c.accent2Mark))
                Spacer(Modifier.width(8.dp))
                Text("FEEDBACK · BISERICA LOGOS", style = caps(11.sp, c.accent2Mark, .14f))
            }
            Text(
                "Vocea comunității, citită dintr-un formular și transformată în semnal clar.",
                style = display(23.sp, 700, c.text, 27.6.sp), modifier = Modifier.padding(top = 10.dp),
            )
            Text(
                "${meta.totalResponses} de răspunsuri anonime la evaluarea întâlnirilor de duminică, distilate în ${d.dims.size} dimensiuni, o evoluție lunară și o hartă a vârstelor.",
                style = body(14.sp, 400, c.text2, 22.4.sp), modifier = Modifier.padding(top = 10.dp),
            )
        }
    }
    item("hr") { HDivider(H.padding(top = 24.dp)) }

    // ---- Pe scurt
    item("overview") {
        val c = puls
        Column(H.padding(vertical = 32.dp)) {
            SectionHead("Pe scurt", "Un instantaneu al tuturor răspunsurilor, înainte de a intra în detalii.")
            KpiGrid(meta.overviewCards.map { card ->
                @Composable { m: Modifier ->
                    Kpi(card.tag, card.value, m, dot = card.dot?.let { cssColor(it, c.accentMark) }, valueSize = if (card.big) 20f else 21f, sub = { KpiSub(card.sub) })
                }
            })
        }
    }

    // ---- Dimensiunile întâlnirii
    item("dims") {
        val c = puls
        Column(H.padding(bottom = 32.dp)) {
            SectionHead("Dimensiunile întâlnirii", "Medie pe o scală de 1-5, ordonate descrescător. Atinge o bară pentru întrebarea completă.")
            Column(Modifier.fillMaxWidth().cardSurface().padding(horizontal = 16.dp, vertical = 14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                d.dims.sortedByDescending { it.avg }.forEach { dim ->
                    Column(
                        Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp))
                            .tipOnTap(dim.label, dim.full, "medie ${fixed(dim.avg)} / 5 · ${dim.n} răspunsuri")
                            .padding(horizontal = 4.dp, vertical = 10.dp),
                    ) {
                        Row(verticalAlignment = Alignment.Bottom) {
                            Row(Modifier.weight(1f), verticalAlignment = Alignment.Bottom) {
                                Text(dim.label, style = body(14.sp, 600, c.text), modifier = Modifier.weight(1f, fill = false))
                                Spacer(Modifier.width(8.dp))
                                Text("${dim.n} răspunsuri", style = body(11.5.sp, 500, c.text3), maxLines = 1)
                            }
                            Text(fixed(dim.avg), style = mono(14.sp, 600, c.text), modifier = Modifier.width(46.dp), textAlign = androidx.compose.ui.text.style.TextAlign.End)
                        }
                        Spacer(Modifier.height(6.dp))
                        BarTrack((dim.avg / 5).toFloat(), height = 12.dp)
                    }
                }
            }
        }
    }

    // ---- Distribuția notelor
    item("dist") {
        val c = puls
        Column(H.padding(bottom = 32.dp)) {
            SectionHead("Distribuția notelor", "Fiecare bară arată ponderea notelor 1-5 pentru acea dimensiune, din totalul răspunsurilor primite.")
            Column(Modifier.fillMaxWidth().cardSurface().padding(horizontal = 16.dp, vertical = 18.dp)) {
                DistLegend()
                Column(verticalArrangement = Arrangement.spacedBy(22.dp)) {
                    d.dims.forEach { dim ->
                        Column {
                            Row(Modifier.fillMaxWidth().padding(bottom = 8.dp)) {
                                Text(dim.label, style = body(13.sp, 600, c.text), modifier = Modifier.weight(1f))
                                Text(fixed(dim.avg), style = mono(13.sp, 500, c.text2))
                            }
                            StackedBar(dim.dist, { i -> "${dim.label} · nota ${i + 1}" })
                        }
                    }
                }
                Disclosure("Vezi toate cifrele ca tabel", Modifier.padding(top = 22.dp)) {
                    DataTable(
                        listOf("Dimensiune", "N", "Medie", "1", "2", "3", "4", "5"),
                        d.dims.map { dim -> listOf(Cell(dim.label), Cell("${dim.n}"), Cell(fixed(dim.avg))) + dim.dist.map { Cell("$it") } },
                        firstColWidth = 150.dp, colWidth = 58.dp,
                    )
                }
            }
        }
    }

    // ---- Evoluție în timp
    item("trend") {
        val c = puls
        Column(H.padding(bottom = 32.dp), verticalArrangement = Arrangement.spacedBy(20.dp)) {
            SectionHead("Evoluție în timp", "Medie compozită (toate dimensiunile) și volum de răspunsuri, lună de lună.", Modifier.padding(bottom = 0.dp))
            Column(Modifier.fillMaxWidth().cardSurface().padding(start = 14.dp, end = 14.dp, top = 18.dp, bottom = 10.dp)) {
                Text("Medie compozită lunară", style = display(14.sp, 700, c.text))
                Text("Linia subțire marchează media generală (${fixed(d.overallAvg)})", style = body(12.sp, 400, c.text3), modifier = Modifier.padding(top = 2.dp, bottom = 14.dp))
                if (d.months.size >= 2) {
                    LineChart(
                        d.months.mapIndexed { i, m ->
                            val last = i == d.months.lastIndex
                            LinePoint(
                                m.avg, m.short, m.label, "medie compozită ${fixed(m.avg)} / 5", "${m.n} răspunsuri",
                                radius = if (last) 6f else 4.5f, valueLabel = if (last) fixed(m.avg) else null,
                            )
                        },
                        height = 190.dp, refValue = d.overallAvg, area = true,
                    )
                }
            }
            Column(Modifier.fillMaxWidth().cardSurface().padding(start = 14.dp, end = 14.dp, top = 18.dp, bottom = 10.dp)) {
                Text("Volum de răspunsuri", style = display(14.sp, 700, c.text))
                Text("Numărul de formulare completate în fiecare lună", style = body(12.sp, 400, c.text3), modifier = Modifier.padding(top = 2.dp, bottom = 14.dp))
                VolumeBars(d.months.map { Triple(it.short, it.n, it.label) })
            }
        }
    }

    // ---- Cine ne-a scris
    item("ages") {
        val c = puls
        val total = d.ages.sumOf { it.n }.coerceAtLeast(1)
        val max = d.ages.maxOfOrNull { it.n }?.coerceAtLeast(1) ?: 1
        Column(H.padding(bottom = 32.dp)) {
            SectionHead("Cine ne-a scris", "Distribuția pe grupe de vârstă (câmp opțional, adăugat ulterior în formular).")
            Column(Modifier.fillMaxWidth().cardSurface().padding(horizontal = 16.dp, vertical = 14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                d.ages.forEach { a ->
                    val pct = a.n * 100.0 / total
                    Row(
                        Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp))
                            .tipOnTap(a.label, "${a.n} din $total răspunsuri (${fixed(pct, 0)}%)")
                            .padding(horizontal = 4.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(a.label, style = body(13.5.sp, 600, c.text), modifier = Modifier.width(92.dp))
                        Spacer(Modifier.width(10.dp))
                        BarTrack(a.n.toFloat() / max, Modifier.weight(1f), height = 22.dp, color = c.accent2Mark)
                        Text("${a.n} · ${fixed(pct, 0)}%", style = mono(12.5.sp, 500, c.text2), modifier = Modifier.width(80.dp), textAlign = androidx.compose.ui.text.style.TextAlign.End)
                    }
                }
            }
        }
    }

    // ---- spre duminici
    item("days-cta") {
        val c = puls
        Column(H.padding(bottom = 32.dp).fillMaxWidth().cardSurface().tappable(openDays).padding(18.dp)) {
            Text("Vrei să vezi feedback-ul unei anumite duminici?", style = display(17.sp, 700, c.text, 22.sp))
            Text("Deschide fiecare duminică pe rând: slideshow pe categorie sau toate răspunsurile deodată.", style = body(13.sp, 400, c.text2, 19.sp), modifier = Modifier.padding(top = 4.dp))
            Text("Răspunsuri pe zile →", style = mono(13.sp, 700, c.accentMark), modifier = Modifier.padding(top = 14.dp))
        }
    }

    // ---- Voci din comunitate: carusel orizontal, următorul card se vede pe margine
    val quotes = d.dims.flatMap { dim -> (d.quotes[dim.key] ?: emptyList()).map { dim.label to it } }
    if (quotes.isNotEmpty()) item("quotes") {
        val c = puls
        val width = LocalConfiguration.current.screenWidthDp.dp
        val state = rememberLazyListState()
        Column(Modifier.padding(bottom = 28.dp)) {
            SectionHead("Voci din comunitate", "Citate reale, anonimizate, selectate automat dintre răspunsurile cele mai ample, câte 2-3 pentru fiecare dimensiune.", H)
            LazyRow(
                state = state, flingBehavior = rememberSnapFlingBehavior(state),
                contentPadding = PaddingValues(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                items(quotes) { (label, text) ->
                    Column(Modifier.width(width * .84f).padding(vertical = 2.dp).cardSurface().padding(horizontal = 22.dp, vertical = 20.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(bottom = 12.dp)) {
                            Box(Modifier.size(8.dp).clip(CircleShape).background(c.accentMark))
                            Spacer(Modifier.width(7.dp))
                            Text(label.uppercase(), style = caps(11.sp, c.text3, .04f))
                        }
                        Text(
                            buildAnnotatedString {
                                withStyle(SpanStyle(color = c.accent, fontFamily = Sora, fontWeight = androidx.compose.ui.text.font.FontWeight.W700)) { append("“") }
                                append(text)
                            },
                            style = body(14.5.sp, 400, c.text, 23.2.sp),
                        )
                    }
                }
            }
        }
    }

    // ---- subsol
    item("footer") {
        val c = puls
        Column(
            H.fillMaxWidth().drawBehind { drawLine(c.border, Offset(0f, 0f), Offset(size.width, 0f), 1.dp.toPx()) }
                .padding(top = 28.dp, bottom = 20.dp),
        ) {
            Text(
                buildAnnotatedString {
                    append("Date citite live din formularul „Evaluare întâlnire duminică\" (Google Forms), actualizate la fiecare deschidere, fără niciun pas manual. ")
                    append("Citatele sunt selectate fără nume, pentru a păstra confidențialitatea celor care au răspuns. ")
                    append("Notele de 1-5 lipsă dintr-o dimensiune (respondent care nu a completat acel câmp) nu sunt incluse în mediile de mai sus. Generat la ")
                    withStyle(SpanStyle(fontFamily = PlexMono)) { append(meta.generatedAtLabel) }
                    append(".")
                },
                style = body(12.5.sp, 400, c.text3, 21.sp),
            )
        }
    }
}

@Composable
private fun HomeSkeleton() {
    val c = puls
    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Box(Modifier.align(Alignment.CenterHorizontally).size(196.dp).clip(CircleShape).border(1.dp, c.border, CircleShape), contentAlignment = Alignment.Center) {
            Box(Modifier.size(125.dp).clip(CircleShape).background(c.surface).border(1.dp, c.border, CircleShape))
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { repeat(3) { SkeletonCard(76, Modifier.weight(1f)) } }
        Spacer(Modifier.height(6.dp))
        Bone(.5f, 11)
        Bone(.95f, 22, 8)
        Bone(.7f, 22, 8)
        Bone(.9f, 13)
        Spacer(Modifier.height(20.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) { repeat(2) { SkeletonCard(96, Modifier.weight(1f)) } }
    }
}
