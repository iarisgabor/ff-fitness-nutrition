package ro.bisericalogos.pulsul.nativ.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.ui.draw.clip
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDefaults
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import ro.bisericalogos.pulsul.nativ.PulsulApp
import ro.bisericalogos.pulsul.nativ.data.ApiError
import ro.bisericalogos.pulsul.nativ.data.ProgramListPayload
import ro.bisericalogos.pulsul.nativ.data.ScheduleEntry
import ro.bisericalogos.pulsul.nativ.data.SundayRow
import ro.bisericalogos.pulsul.nativ.data.rememberPage
import ro.bisericalogos.pulsul.nativ.domain.formatDuration
import ro.bisericalogos.pulsul.nativ.domain.formatSlugLong
import ro.bisericalogos.pulsul.nativ.domain.monthShort
import ro.bisericalogos.pulsul.nativ.domain.parseSlug
import ro.bisericalogos.pulsul.nativ.domain.slugToDots
import ro.bisericalogos.pulsul.nativ.ui.LocalNav
import ro.bisericalogos.pulsul.nativ.ui.Routes
import ro.bisericalogos.pulsul.nativ.ui.components.BtnKind
import ro.bisericalogos.pulsul.nativ.ui.components.Chip
import ro.bisericalogos.pulsul.nativ.ui.components.EmptyState
import ro.bisericalogos.pulsul.nativ.ui.components.Field
import ro.bisericalogos.pulsul.nativ.ui.components.ListSkeleton
import ro.bisericalogos.pulsul.nativ.ui.components.Notice
import ro.bisericalogos.pulsul.nativ.ui.components.PBtn
import ro.bisericalogos.pulsul.nativ.ui.components.PCard
import ro.bisericalogos.pulsul.nativ.ui.components.PageFrame
import ro.bisericalogos.pulsul.nativ.ui.components.PageHead
import ro.bisericalogos.pulsul.nativ.ui.components.Pill
import ro.bisericalogos.pulsul.nativ.ui.components.PulsIcons
import ro.bisericalogos.pulsul.nativ.ui.components.PulsSheet
import ro.bisericalogos.pulsul.nativ.ui.components.SelectField
import ro.bisericalogos.pulsul.nativ.ui.components.puls
import ro.bisericalogos.pulsul.nativ.ui.theme.body
import ro.bisericalogos.pulsul.nativ.ui.theme.caps
import ro.bisericalogos.pulsul.nativ.ui.theme.display
import ro.bisericalogos.pulsul.nativ.ui.theme.mix
import ro.bisericalogos.pulsul.nativ.ui.theme.mono

private val H = Modifier.padding(horizontal = 16.dp)

@Composable
fun ProgramListScreen() {
    val nav = LocalNav.current
    val g = PulsulApp.graph
    val scope = rememberCoroutineScope()
    val haptics = LocalHapticFeedback.current
    val vm = rememberPage<ProgramListPayload>("/program")
    var creating by remember { mutableStateOf(false) }
    var busyDate by remember { mutableStateOf<String?>(null) }

    fun create(date: String, preacher: String, start: String?, from: String) {
        busyDate = date
        scope.launch {
            try {
                g.api.send("POST", "/api/program", buildJsonObject {
                    put("date", JsonPrimitive(date)); put("preacher_name", JsonPrimitive(preacher))
                    if (start != null) put("start_time", JsonPrimitive(start))
                    put("from", JsonPrimitive(from))
                })
                g.markChanged()
                haptics.performHapticFeedback(HapticFeedbackType.Confirm)
                creating = false
                nav.to(Routes.programEdit(date))
            } catch (e: ApiError) {
                g.toast(e.message ?: "Eroare", error = true)
            } finally { busyDate = null }
        }
    }

    PageFrame(
        vm, "Program duminică", null, nav.openAccount, { ListSkeleton(6, 74) },
        overlay = { p, user ->
            if (user.isAdmin) {
                Box(Modifier.fillMaxSize().padding(16.dp), contentAlignment = Alignment.BottomEnd) {
                    // buton plutitor, la îndemâna degetului mare
                    val c = puls
                    PBtn(
                        "+ Duminică nouă", { creating = true },
                        Modifier.heightIn(min = 52.dp).shadow(14.dp, RoundedCornerShape(16.dp), ambientColor = c.accentMark.copy(.4f), spotColor = c.accentMark.copy(.4f)),
                        kind = BtnKind.Primary,
                    )
                }
                if (creating) NewSundaySheet(p, busyDate != null, onDismiss = { creating = false }) { date, preacher, start, from -> create(date, preacher, start, from) }
            }
        },
    ) { p, user ->
        programList(p, user.isAdmin, busyDate, onOpen = { nav.to(Routes.programEdit(it)) }, onCreate = { u -> create(u.date, u.speaker, null, "template") })
    }
}

private fun LazyListScope.programList(p: ProgramListPayload, isAdmin: Boolean, busyDate: String?, onOpen: (String) -> Unit, onCreate: (ScheduleEntry) -> Unit) {
    item("head") {
        PageHead(
            "Program duminică",
            if (isAdmin) "Pregătiți aici fiecare duminică: ordinea, cântările, cine ce face și resursele (slide-uri, PPT, PDF)."
            else "Duminicile care urmează. La duminicile tale poți completa partea de predică și urca slide-uri.",
            H,
        )
    }
    if (!p.dbReady) item("notice") { Notice("Baza de date a programului (Cloudflare D1) nu e configurată încă. Vezi README, secțiunea „Program duminică\".", H.padding(top = 20.dp)) }

    val upcoming = p.sundays.filter { !it.isPast }
    val past = p.sundays.filter { it.isPast }.reversed()
    val merged = (upcoming.map { it.date to (it as Any) } + p.unplanned.map { it.date to (it as Any) }).sortedBy { it.first }

    item("up-title") { ListTitle("Următoarele duminici", H.padding(top = 24.dp)) }
    if (merged.isEmpty()) item("up-empty") {
        EmptyState(if (isAdmin) "Nicio duminică pregătită încă. Apasă „+ Duminică nouă\"." else "Nicio duminică pregătită încă.", H, center = false)
    }
    merged.forEachIndexed { i, (date, row) ->
        item("u-$date") {
            when (row) {
                is SundayRow -> SundayRowCard(row, isNext = i == 0, isAdmin = isAdmin) { onOpen(date) }
                is ScheduleEntry -> UnplannedRow(row, isAdmin, busy = busyDate == date) { onCreate(row) }
            }
        }
    }
    if (past.isNotEmpty()) {
        item("past-title") { ListTitle(if (isAdmin) "Duminici trecute" else "Duminicile tale trecute", H.padding(top = 24.dp)) }
        past.forEach { s -> item("p-${s.date}") { SundayRowCard(s, isNext = false, isAdmin = isAdmin) { onOpen(s.date) } } }
    }
    item("end") { Spacer(Modifier.height(90.dp)) } // loc pentru butonul plutitor deasupra ultimului rând
}

@Composable
private fun ListTitle(text: String, modifier: Modifier) {
    Text(text.uppercase(), style = caps(13.sp, puls.text3, .08f), modifier = modifier.padding(bottom = 12.dp))
}

@Composable
private fun DateBlock(slug: String) {
    val c = puls
    val d = parseSlug(slug)
    Column(Modifier.width(48.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Text("${d.dd}", style = display(22.sp, 800, c.text))
        Text(monthShort(d.mm).uppercase(), style = caps(11.sp, c.text3), modifier = Modifier.padding(top = 4.dp))
    }
}

@Composable
private fun SundayRowCard(s: SundayRow, isNext: Boolean, isAdmin: Boolean, onClick: () -> Unit) {
    val c = puls
    PCard(H.padding(bottom = 10.dp).fillMaxWidth(), onClick = onClick, padding = PaddingValues(horizontal = 14.dp, vertical = 13.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            DateBlock(s.date)
            Column(Modifier.weight(1f)) {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(4.dp), itemVerticalAlignment = Alignment.CenterVertically) {
                    Text(formatSlugLong(s.date), style = body(14.5.sp, 700, c.text))
                    if (isNext) Pill("următoarea", next = true)
                    if (s.mine) Pill("predici tu")
                }
                FlowRow(Modifier.padding(top = 4.dp), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    val meta = body(12.5.sp, 400, c.text3)
                    Text(if (s.preacher_name.isNotBlank()) "Predică: ${s.preacher_name}" else "Predicator necompletat", style = meta)
                    Text("începe ${s.start_time.ifBlank { "10:00" }}", style = meta)
                    if (s.total_sec > 0) Text("durată ${formatDuration(s.total_sec)}", style = meta)
                    if (s.resource_count > 0) Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(PulsIcons.get("clip"), null, tint = c.text3, modifier = Modifier.size(12.dp))
                        Text(" ${s.resource_count}", style = meta)
                    }
                    if (s.isPast && s.attendance != null) Text("${s.attendance} prezenți", style = meta)
                    else if (s.isPast && isAdmin) Text("prezență necompletată", style = meta)
                }
            }
            Text("›", style = body(18.sp, 400, c.text3))
        }
    }
}

@Composable
private fun UnplannedRow(u: ScheduleEntry, isAdmin: Boolean, busy: Boolean, onCreate: () -> Unit) {
    val c = puls
    PCard(H.padding(bottom = 10.dp).fillMaxWidth(), dashed = true, padding = PaddingValues(horizontal = 14.dp, vertical = 13.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            DateBlock(u.date)
            Column(Modifier.weight(1f)) {
                Text(formatSlugLong(u.date), style = body(14.5.sp, 700, c.text2))
                FlowRow(Modifier.padding(top = 4.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text("Predică: ${u.speaker} (din calendar)", style = body(12.5.sp, 400, c.text3))
                    Text("fără program încă", style = body(12.5.sp, 400, c.text3))
                }
            }
            if (isAdmin) PBtn("Creează", onCreate, small = true, busy = busy)
        }
    }
}

// ---- „Duminică nouă" (doar contul general), într-un panou de jos ca pe telefon

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun NewSundaySheet(p: ProgramListPayload, busy: Boolean, onDismiss: () -> Unit, onCreate: (String, String, String, String) -> Unit) {
    val c = puls
    val scheduleByDate = remember(p) { p.schedule.associate { it.date to it.speaker } }
    var date by remember { mutableStateOf(p.nextFreeSunday.orEmpty()) }
    var preacher by remember { mutableStateOf(scheduleByDate[p.nextFreeSunday].orEmpty()) }
    var start by remember { mutableStateOf("10:00") }
    var from by remember { mutableStateOf("template") }
    var picking by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val speakers = remember(p) { p.schedule.map { it.speaker }.distinct() }

    PulsSheet(onDismiss = onDismiss, title = "Duminică nouă") { sheet ->
        Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("Data", style = body(12.sp, 700, c.text2))
                val shape = RoundedCornerShape(10.dp)
                Row(
                    Modifier.fillMaxWidth().heightIn(min = 48.dp).clip(shape).background(c.surface).border(1.dp, c.border, shape)
                        .clickable(role = Role.Button) { picking = true }.padding(horizontal = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(if (date.isNotBlank()) formatSlugLong(date) else "alege data", style = body(16.sp, 500, if (date.isNotBlank()) c.text else c.text3))
                }
            }
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Field("Predicator", preacher, { preacher = it }, placeholder = "din calendar sau scris de mână", capitalize = true)
                if (speakers.isNotEmpty()) FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    speakers.forEach { s -> Chip(s, name = s == preacher, onClick = { preacher = s }) }
                }
            }
            Field("Ora de început", start, { start = it.take(5) }, keyboardType = KeyboardType.Number, mono = true, imeAction = ImeAction.Done)
            SelectField(
                "Pornește de la", from,
                listOf("template" to "Șablonul standard") + p.copySources.map { cs ->
                    cs.date to ("Copie după ${slugToDots(cs.date)}" + if (cs.preacher_name.isNotBlank()) ", ${cs.preacher_name}" else "")
                },
                { from = it },
            )
            if (error != null) ro.bisericalogos.pulsul.nativ.ui.components.FormError(error!!)
            Column(verticalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.padding(top = 4.dp)) {
                PBtn("Creează programul", {
                    error = when {
                        date.isBlank() -> "Alege data."
                        !Regex("^\\d{1,2}:\\d{2}$").matches(start.trim()) -> "Ora de început se scrie ca 10:00."
                        else -> null
                    }
                    if (error == null) onCreate(date, preacher.trim(), start.trim().padStart(5, '0'), from)
                }, Modifier.fillMaxWidth(), kind = BtnKind.Primary, busy = busy, large = true)
                PBtn("Renunță", { sheet.close() }, Modifier.fillMaxWidth())
            }
        }
    }

    if (picking) {
        val state = rememberDatePickerState(
            initialSelectedDateMillis = date.takeIf { it.isNotBlank() }?.let { java.time.LocalDate.parse(it).atStartOfDay(java.time.ZoneOffset.UTC).toInstant().toEpochMilli() },
        )
        DatePickerDialog(
            onDismissRequest = { picking = false },
            confirmButton = {
                TextButton({
                    state.selectedDateMillis?.let { ms ->
                        date = java.time.Instant.ofEpochMilli(ms).atZone(java.time.ZoneOffset.UTC).toLocalDate().toString()
                        scheduleByDate[date]?.let { preacher = it } // ca fillPreacher() de pe site
                    }
                    picking = false
                }) { Text("Alege", style = body(14.sp, 700, c.accentMark)) }
            },
            dismissButton = { TextButton({ picking = false }) { Text("Renunță", style = body(14.sp, 700, c.text2)) } },
            colors = DatePickerDefaults.colors(containerColor = c.surface),
        ) { DatePicker(state, colors = DatePickerDefaults.colors(containerColor = c.surface, selectedDayContainerColor = c.accentMark, todayDateBorderColor = c.accentMark, todayContentColor = c.accentMark)) }
    }
}
