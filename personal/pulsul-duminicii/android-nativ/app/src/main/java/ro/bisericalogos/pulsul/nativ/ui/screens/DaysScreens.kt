package ro.bisericalogos.pulsul.nativ.ui.screens

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
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
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.gestures.animateScrollBy
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.launch
import ro.bisericalogos.pulsul.nativ.PulsulApp
import ro.bisericalogos.pulsul.nativ.data.DayPayload
import ro.bisericalogos.pulsul.nativ.data.DaysPayload
import ro.bisericalogos.pulsul.nativ.data.rememberPage
import ro.bisericalogos.pulsul.nativ.domain.catsWithData
import ro.bisericalogos.pulsul.nativ.domain.dayStats
import ro.bisericalogos.pulsul.nativ.domain.fixed
import ro.bisericalogos.pulsul.nativ.domain.monthFull
import ro.bisericalogos.pulsul.nativ.domain.parseDMY
import ro.bisericalogos.pulsul.nativ.domain.plural
import ro.bisericalogos.pulsul.nativ.domain.signed
import ro.bisericalogos.pulsul.nativ.domain.slidesFor
import ro.bisericalogos.pulsul.nativ.ui.LocalNav
import ro.bisericalogos.pulsul.nativ.ui.Routes
import ro.bisericalogos.pulsul.nativ.ui.components.AiSummaryBox
import ro.bisericalogos.pulsul.nativ.ui.components.Bullets
import ro.bisericalogos.pulsul.nativ.ui.components.CatTab
import ro.bisericalogos.pulsul.nativ.ui.components.Chip
import ro.bisericalogos.pulsul.nativ.ui.components.DeltaText
import ro.bisericalogos.pulsul.nativ.ui.components.EmptyState
import ro.bisericalogos.pulsul.nativ.ui.components.Kpi
import ro.bisericalogos.pulsul.nativ.ui.components.KpiGrid
import ro.bisericalogos.pulsul.nativ.ui.components.KpiSub
import ro.bisericalogos.pulsul.nativ.ui.components.ListSkeleton
import ro.bisericalogos.pulsul.nativ.ui.components.PBtn
import ro.bisericalogos.pulsul.nativ.ui.components.PCard
import ro.bisericalogos.pulsul.nativ.ui.components.PageFrame
import ro.bisericalogos.pulsul.nativ.ui.components.PageHead
import ro.bisericalogos.pulsul.nativ.ui.components.RBadge
import ro.bisericalogos.pulsul.nativ.ui.components.ToggleGroup
import ro.bisericalogos.pulsul.nativ.ui.components.cardSurface
import ro.bisericalogos.pulsul.nativ.ui.components.puls
import ro.bisericalogos.pulsul.nativ.ui.theme.body
import ro.bisericalogos.pulsul.nativ.ui.theme.caps
import ro.bisericalogos.pulsul.nativ.ui.theme.display
import ro.bisericalogos.pulsul.nativ.ui.theme.mono

private val H = Modifier.padding(horizontal = 16.dp)

// ---------------------------------------------------------------- /zile

@Composable
fun DaysScreen() {
    val nav = LocalNav.current
    val vm = rememberPage<DaysPayload>("/zile")
    PageFrame(vm, "Răspunsuri pe zile", null, nav.openAccount, { ListSkeleton(8, 60) }, stale = { it.meta.stale }) { p, _ ->
        item("head") {
            PageHead(
                "Răspunsuri pe zile",
                "Alege o duminică ca să vezi feedback-ul acelei zile: pe categorii, unul câte unul (bun pentru întâlnirea de luni), sau toate deodată, într-un dashboard.",
                H,
            )
        }
        if (p.days.isEmpty()) item("empty") { EmptyState("Niciun răspuns găsit încă.", H.padding(top = 30.dp)) }
        var lastMonth: String? = null
        p.days.forEachIndexed { i, d ->
            val dmy = parseDMY(d.date)
            val monthKey = "${dmy.mm}.${dmy.yyyy}"
            if (monthKey != lastMonth) {
                val first = lastMonth == null
                lastMonth = monthKey
                item("m-$monthKey") {
                    Text(
                        "${monthFull(dmy.mm)} ${dmy.yyyy}".uppercase(), style = caps(12.sp, puls.text3, .08f),
                        modifier = H.padding(top = if (first) 20.dp else 22.dp, bottom = 4.dp),
                    )
                }
            }
            item(d.slug) {
                val c = puls
                val color = c.forAvg(d.avg)
                PCard(
                    H.padding(top = 8.dp).fillMaxWidth(), onClick = { nav.to(Routes.day(d.slug)) }, leftBorder = color,
                    padding = PaddingValues(start = 20.dp, end = 16.dp, top = 14.dp, bottom = 14.dp),
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text("${dmy.dd} ${monthFull(dmy.mm)}", style = display(16.sp, 700, c.text))
                            Text("${dmy.yyyy}", style = body(12.sp, 400, c.text3), modifier = Modifier.padding(top = 4.dp))
                        }
                        Text("${d.count} ${plural(d.count, "răspuns", "răspunsuri")}", style = body(12.5.sp, 400, c.text2))
                        Spacer(Modifier.width(14.dp))
                        Text(d.avg?.let { fixed(it) } ?: "-", style = mono(17.sp, 700, color), modifier = Modifier.widthIn(min = 44.dp), textAlign = TextAlign.End)
                    }
                }
            }
        }
        item("end") { Spacer(Modifier.height(24.dp)) }
    }
}

// ---------------------------------------------------------------- /zile/:slug

private data class FlatSlide(val catIndex: Int, val indexInCat: Int, val countInCat: Int)

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun DayScreen(slug: String) {
    val nav = LocalNav.current
    val vm = rememberPage<DayPayload>("/zile/$slug")
    val g = PulsulApp.graph
    var view by rememberSaveable { mutableStateOf(g.session.recall("day-view") ?: "slideshow") }

    PageFrame(vm, dayTitle(slug), nav::back, nav.openAccount, { DaySkeleton() }, stale = { it.meta.stale }) { p, user ->
        val items = p.responses
        val cats = catsWithData(items, p.dimLabels)
        val asPreacher = user.isPreacher
        val dmy = parseDMY(p.date)

        item("head") {
            val c = puls
            Row(H.padding(top = 18.dp), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("${dmy.dd} ${monthFull(dmy.mm)} ${dmy.yyyy}", style = display(24.sp, 700, c.text, 29.sp))
                    Text("${items.size} ${plural(items.size, "răspuns", "răspunsuri")}", style = body(13.sp, 400, c.text3), modifier = Modifier.padding(top = 4.dp))
                    p.preacher?.let { pr ->
                        Chip("Predică: ${pr.name}", Modifier.padding(top = 8.dp), name = true, onClick = {
                            if (asPreacher) nav.tab(Routes.ME) else nav.to(Routes.preacher(pr.slug))
                        })
                    }
                }
                if (!asPreacher) {
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        DayNavButton("←", "Duminica anterioară", p.meta.prevSlug) { nav.replace(Routes.day(it)) }
                        DayNavButton("→", "Duminica următoare", p.meta.nextSlug) { nav.replace(Routes.day(it)) }
                    }
                }
            }
        }

        item("stats") {
            val c = puls
            val s = dayStats(items, p.dimLabels, p.meta.overallAvg)
            val cards = mutableListOf<@Composable (Modifier) -> Unit>(
                { m -> Kpi("Medie ziua asta", s.dayAvg?.let { fixed(it) } ?: "-", m, sub = { s.delta?.let { DeltaText(it, "${signed(it)} față de medie") } }) },
                { m -> Kpi("Răspunsuri", "${items.size}", m, sub = { KpiSub("pe ${p.dimLabels.size} categorii") }) },
            )
            s.best?.let { b -> cards += { m -> Kpi("Cel mai bine", b.label, m, sub = { KpiSub("medie ${fixed(b.avg)}") }) } }
            s.worst?.let { w -> cards += { m -> Kpi("De urmărit", w.label, m, sub = { KpiSub("medie ${fixed(w.avg)}") }) } }
            KpiGrid(cards, H.padding(top = 18.dp, bottom = 4.dp))
        }

        val ai = p.aiSummary
        if (!ai.isNullOrEmpty()) item("ai") {
            AiSummaryBox("Rezumat AI · temele zilei", H.padding(top = 16.dp)) { Bullets(ai) }
        }

        item("toggle") {
            ToggleGroup(
                listOf("slideshow" to "Slideshow", "dashboard" to "Toate deodată"), view,
                { view = it; g.session.remember("day-view", it) }, H.padding(top = 22.dp, bottom = 12.dp),
            )
        }

        if (cats.isEmpty()) {
            item("empty") { EmptyState("Niciun răspuns înregistrat pentru această duminică.", H) }
        } else if (view == "slideshow") {
            item("slideshow") { Slideshow(p, cats.map { it.key }) }
        } else {
            cats.forEach { d ->
                item("dash-${d.key}") { DashCard(p, d.key) }
            }
        }
        item("end") { Spacer(Modifier.height(40.dp)) }
    }
}

private fun dayTitle(slug: String): String {
    val p = slug.split("-")
    return if (p.size == 3) "${p[2].toInt()} ${monthFull(p[1].toInt())} ${p[0]}" else slug
}

@Composable
private fun DayNavButton(label: String, desc: String, target: String?, go: (String) -> Unit) {
    val c = puls
    Box(
        Modifier.size(44.dp).graphicsLayer { alpha = if (target == null) .3f else 1f }
            .clip(RoundedCornerShape(12.dp)).background(c.surface2).border(1.dp, c.border, RoundedCornerShape(12.dp))
            .clickable(enabled = target != null, role = Role.Button, onClickLabel = desc) { target?.let(go) },
        contentAlignment = Alignment.Center,
    ) { Text(label, style = body(16.sp, 500, c.text)) }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun Slideshow(p: DayPayload, catKeys: List<String>) {
    val c = puls
    val haptics = LocalHapticFeedback.current
    val scope = rememberCoroutineScope()
    val items = p.responses
    val labels = p.dimLabels.associateBy { it.key }
    val perCat = catKeys.map { slidesFor(items, it) }
    // toate răspunsurile zilei, categorie după categorie: glisarea trece singură la categoria vecină
    val flat = perCat.flatMapIndexed { ci, list -> list.indices.map { FlatSlide(ci, it, list.size) } }
    val firstOfCat = perCat.runningFold(0) { acc, l -> acc + l.size }
    val pager = rememberPagerState { flat.size }
    val tabs = rememberLazyListState()
    val current = flat.getOrNull(pager.currentPage) ?: flat.first()

    LaunchedEffect(pager) {
        snapshotFlow { pager.currentPage }.distinctUntilChanged().drop(1).collect {
            haptics.performHapticFeedback(HapticFeedbackType.SegmentTick)
        }
    }
    LaunchedEffect(current.catIndex) {
        // pastila activă adusă în centru, ca pe site
        val info = tabs.layoutInfo
        val w = info.viewportSize.width
        val itemInfo = info.visibleItemsInfo.firstOrNull { it.index == current.catIndex }
        if (itemInfo != null) tabs.animateScrollBy((itemInfo.offset + itemInfo.size / 2 - w / 2).toFloat())
        else tabs.animateScrollToItem(current.catIndex)
    }

    Column {
        LazyRow(state = tabs, contentPadding = PaddingValues(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(bottom = 14.dp)) {
            itemsIndexed(catKeys) { ci, key ->
                CatTab(labels[key]?.label.orEmpty(), ci == current.catIndex, { scope.launch { pager.animateScrollToPage(firstOfCat[ci]) } }, count = perCat[ci].size)
            }
        }
        HorizontalPager(pager, contentPadding = PaddingValues(horizontal = 16.dp), pageSpacing = 12.dp, verticalAlignment = Alignment.Top) { page ->
            val f = flat[page]
            val key = catKeys[f.catIndex]
            val s = perCat[f.catIndex][f.indexInCat]
            val dim = labels[key]
            val atStart = f.indexInCat == 0
            val atEnd = f.indexInCat == f.countInCat - 1
            val prevCat = if (atStart) catKeys.getOrNull(f.catIndex - 1)?.let { labels[it]?.label } else null
            val nextCat = if (atEnd) catKeys.getOrNull(f.catIndex + 1)?.let { labels[it]?.label } else null
            Column(Modifier.fillMaxWidth().cardSurface().padding(horizontal = 18.dp, vertical = 20.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(bottom = 20.dp)) {
                    RBadge(s.r, s.rawR, 44.dp, 20f)
                    Spacer(Modifier.width(14.dp))
                    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text(dim?.label.orEmpty().uppercase(), style = caps(12.sp, c.text3, .04f))
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            if (s.time.isNotBlank()) Text(s.time, style = mono(12.sp, 500, c.text3))
                            if (s.age.isNotBlank()) Chip(s.age)
                            if (s.name.isNotBlank()) Chip(s.name, name = true)
                        }
                    }
                }
                if (!dim?.full.isNullOrBlank()) {
                    Text(
                        dim!!.full, style = body(13.5.sp, 400, c.text2, 19.6.sp).copy(fontStyle = FontStyle.Italic),
                        modifier = Modifier.fillMaxWidth().dashedBottom(c.border).padding(bottom = 16.dp),
                    )
                    Spacer(Modifier.height(16.dp))
                }
                if (s.t.isNotBlank()) Text(s.t, style = body(17.sp, 500, c.text, 26.4.sp))
                else Text("fără text, doar notă", style = body(17.sp, 400, c.text3, 26.4.sp).copy(fontStyle = FontStyle.Italic))
                Row(Modifier.fillMaxWidth().padding(top = 20.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    PBtn(
                        if (prevCat != null) "← $prevCat" else "← Anterior",
                        { scope.launch { pager.animateScrollToPage(page - 1) } }, Modifier.weight(1f), enabled = page > 0,
                    )
                    Text("${f.indexInCat + 1} din ${f.countInCat}", style = mono(13.sp, 500, c.text3))
                    PBtn(
                        if (nextCat != null) "$nextCat →" else "Următor →",
                        { scope.launch { pager.animateScrollToPage(page + 1) } }, Modifier.weight(1f), enabled = page < flat.lastIndex,
                    )
                }
            }
        }
        Text("glisează stânga / dreapta", style = body(11.5.sp, 400, c.text3).copy(textAlign = TextAlign.Center), modifier = Modifier.fillMaxWidth().padding(top = 10.dp))
    }
}

fun Modifier.dashedBottom(color: androidx.compose.ui.graphics.Color) = drawBehind {
    drawLine(color, Offset(0f, size.height), Offset(size.width, size.height), 1.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(4.dp.toPx(), 3.dp.toPx())))
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun DashCard(p: DayPayload, key: String) {
    val c = puls
    val dim = p.dimLabels.first { it.key == key }
    val rows = p.responses.filter { it.answers[key]?.hasContent == true }
    Column(H.padding(bottom = 18.dp).fillMaxWidth().cardSurface().padding(horizontal = 22.dp, vertical = 20.dp)) {
        Row(Modifier.fillMaxWidth().padding(bottom = 14.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(dim.label, style = body(14.5.sp, 700, c.text), modifier = Modifier.weight(1f))
            Text("${rows.size}", style = mono(11.5.sp, 500, c.text3))
        }
        if (dim.full.isNotBlank()) {
            Text(
                dim.full, style = body(12.5.sp, 400, c.text3, 18.sp).copy(fontStyle = FontStyle.Italic),
                modifier = Modifier.fillMaxWidth().dashedBottom(c.border).padding(bottom = 14.dp),
            )
            Spacer(Modifier.height(14.dp))
        }
        rows.forEachIndexed { i, r ->
            val a = r.answers[key]!!
            Row(
                Modifier.fillMaxWidth()
                    .then(if (i > 0) Modifier.drawBehind { drawLine(c.border, Offset(0f, 0f), Offset(size.width, 0f), 1.dp.toPx()) }.padding(top = 11.dp) else Modifier)
                    .padding(bottom = 11.dp),
                horizontalArrangement = Arrangement.spacedBy(11.dp),
            ) {
                RBadge(a.r, a.rawR)
                Column(Modifier.weight(1f)) {
                    if (a.t.isNotBlank()) Text(a.t, style = body(13.5.sp, 400, c.text, 21.sp))
                    else Text("fără text", style = body(13.5.sp, 400, c.text3, 21.sp).copy(fontStyle = FontStyle.Italic))
                    if (r.age.isNotBlank() || r.name.isNotBlank()) {
                        FlowRow(Modifier.padding(top = 4.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            if (r.age.isNotBlank()) Chip(r.age)
                            if (r.name.isNotBlank()) Chip(r.name, name = true)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun DaySkeleton() {
    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Spacer(Modifier.height(4.dp))
        ro.bisericalogos.pulsul.nativ.ui.components.Bone(.6f, 26, 8)
        ro.bisericalogos.pulsul.nativ.ui.components.Bone(.3f, 13)
        Spacer(Modifier.height(8.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) { repeat(2) { ro.bisericalogos.pulsul.nativ.ui.components.SkeletonCard(92, Modifier.weight(1f)) } }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) { repeat(2) { ro.bisericalogos.pulsul.nativ.ui.components.SkeletonCard(92, Modifier.weight(1f)) } }
        Spacer(Modifier.height(10.dp))
        ro.bisericalogos.pulsul.nativ.ui.components.Bone(1f, 46, 11)
        ro.bisericalogos.pulsul.nativ.ui.components.SkeletonCard(260)
    }
}
