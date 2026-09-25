package ro.bisericalogos.pulsul.nativ.ui.screens

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.wrapContentWidth
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.FileProvider
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import okhttp3.Call
import ro.bisericalogos.pulsul.nativ.PulsulApp
import ro.bisericalogos.pulsul.nativ.data.ApiError
import ro.bisericalogos.pulsul.nativ.data.Plan
import ro.bisericalogos.pulsul.nativ.data.PlanItem
import ro.bisericalogos.pulsul.nativ.data.PlanResource
import ro.bisericalogos.pulsul.nativ.data.ProgramEditPayload
import ro.bisericalogos.pulsul.nativ.data.PulsJson
import ro.bisericalogos.pulsul.nativ.data.UploadCancelled
import ro.bisericalogos.pulsul.nativ.data.rememberPage
import ro.bisericalogos.pulsul.nativ.domain.clock
import ro.bisericalogos.pulsul.nativ.domain.extOf
import ro.bisericalogos.pulsul.nativ.domain.fmtSize
import ro.bisericalogos.pulsul.nativ.domain.formatDuration
import ro.bisericalogos.pulsul.nativ.domain.formatSlugLong
import ro.bisericalogos.pulsul.nativ.domain.parseDuration
import ro.bisericalogos.pulsul.nativ.ui.LocalNav
import ro.bisericalogos.pulsul.nativ.ui.Routes
import ro.bisericalogos.pulsul.nativ.ui.components.BtnKind
import ro.bisericalogos.pulsul.nativ.ui.components.Chip
import ro.bisericalogos.pulsul.nativ.ui.components.EmptyState
import ro.bisericalogos.pulsul.nativ.ui.components.Field
import ro.bisericalogos.pulsul.nativ.ui.components.ListSkeleton
import ro.bisericalogos.pulsul.nativ.ui.components.LocalDialogs
import ro.bisericalogos.pulsul.nativ.ui.components.PBtn
import ro.bisericalogos.pulsul.nativ.ui.components.PageFrame
import ro.bisericalogos.pulsul.nativ.ui.components.PulsIcons
import ro.bisericalogos.pulsul.nativ.ui.components.PulsSheet
import ro.bisericalogos.pulsul.nativ.ui.components.SelectField
import ro.bisericalogos.pulsul.nativ.ui.components.cardSurface
import ro.bisericalogos.pulsul.nativ.ui.components.dashedBorder
import ro.bisericalogos.pulsul.nativ.ui.components.puls
import ro.bisericalogos.pulsul.nativ.ui.theme.PulsColors
import ro.bisericalogos.pulsul.nativ.ui.theme.body
import ro.bisericalogos.pulsul.nativ.ui.theme.caps
import ro.bisericalogos.pulsul.nativ.ui.theme.display
import ro.bisericalogos.pulsul.nativ.ui.theme.mono
import ro.bisericalogos.pulsul.nativ.ui.theme.shadowTint
import java.io.File
import java.net.URLEncoder

private val H = Modifier.padding(horizontal = 16.dp)
private const val MAX_UPLOAD = 50L * 1024 * 1024
// aceeași listă ca ALLOWED_EXTENSIONS din src/program.js (fără html/svg/js)
private val ALLOWED = setOf(
    "ppt", "pptx", "key", "odp", "pdf", "doc", "docx", "odt", "txt", "pro",
    "jpg", "jpeg", "png", "gif", "webp", "heic",
    "mp3", "m4a", "wav", "aac", "mp4", "mov", "m4v",
)

private class UploadState {
    var active by mutableStateOf(false)
    var label by mutableStateOf("")
    var progress by mutableFloatStateOf(0f)
    var call: Call? = null
}

@Composable
fun ProgramEditScreen(date: String) {
    val nav = LocalNav.current
    val g = PulsulApp.graph
    val dialogs = LocalDialogs.current
    val scope = rememberCoroutineScope()
    val haptics = LocalHapticFeedback.current
    val context = LocalContext.current
    val vm = rememberPage<ProgramEditPayload>("/program/$date")
    var openId by rememberSaveable { mutableStateOf<Long?>(null) }
    var detailsKey by remember { mutableIntStateOf(0) }
    val upload = remember { UploadState() }
    var uploadTarget by remember { mutableStateOf<Long?>(null) }

    fun setPlan(plan: Plan) {
        g.markChanged()
        vm.replace { it.copy(plan = plan) }
    }

    suspend fun mutate(method: String, path: String, body: JsonElement? = null): Plan? = try {
        val plan = PulsJson.decodeFromString(Plan.serializer(), g.api.send(method, path, body))
        setPlan(plan)
        plan
    } catch (e: ApiError) {
        g.toast(e.message ?: "Eroare", error = true)
        haptics.performHapticFeedback(HapticFeedbackType.Reject)
        null
    }

    suspend fun uploadFiles(uris: List<Uri>, itemId: Long?) {
        val resolver = context.contentResolver
        for ((i, uri) in uris.withIndex()) {
            val (name, size) = queryMeta(context, uri)
            if (name.substringAfterLast('.', "").lowercase() !in ALLOWED) {
                g.toast("$name: tip de fișier neacceptat. Merg: PowerPoint/Keynote, PDF, Word, imagini, audio, video.", error = true); continue
            }
            if (size > MAX_UPLOAD) { g.toast("$name: depășește 50 MB.", error = true); continue }
            if (size <= 0) { g.toast("$name: fișier gol sau dimensiune necunoscută.", error = true); continue }
            upload.label = (if (uris.size > 1) "${i + 1}/${uris.size} · " else "") + "Se urcă $name"
            upload.progress = 0f
            upload.active = true
            try {
                val q = "item=${itemId ?: ""}&name=${URLEncoder.encode(name, "UTF-8")}"
                val body = g.api.upload("/api/program/$date/resurse?$q", resolver, uri, size, resolver.getType(uri), { upload.call = it }, { upload.progress = it })
                setPlan(PulsJson.decodeFromString(Plan.serializer(), body))
                g.toast("$name a fost urcat.")
            } catch (e: UploadCancelled) {
                g.toast("Urcare anulată.") // anularea oprește și fișierele următoare
                break
            } catch (e: ApiError) {
                g.toast("$name: ${e.message}", error = true)
            } finally {
                upload.active = false
                upload.call = null
            }
        }
    }

    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
        if (uris.isNotEmpty()) { val target = uploadTarget; scope.launch { uploadFiles(uris, target) } }
    }
    val actions = remember {
        EditActions(
            upload = { itemId -> uploadTarget = itemId; picker.launch(arrayOf("*/*")) },
            open = { r -> scope.launch { openResource(context, r) } },
            delete = { r ->
                scope.launch {
                    val ok = dialogs.confirm("„${r.name}\" se șterge pentru toată lumea.", title = "Ștergi resursa?", ok = "Șterge", danger = true)
                    if (ok && mutate("DELETE", "/api/resurse/${r.id}") != null) g.toast("Resursa a fost ștearsă.")
                }
            },
            addLink = { itemId, name, url, done ->
                scope.launch {
                    val plan = mutate("POST", "/api/program/$date/linkuri", buildJsonObject {
                        put("item_id", itemId?.let { JsonPrimitive(it) } ?: JsonNull)
                        put("name", JsonPrimitive(name)); put("url", JsonPrimitive(url))
                    })
                    if (plan != null) g.toast("Linkul a fost adăugat.")
                    done(plan != null)
                }
            },
        )
    }

    val titleText = "Duminică, ${formatSlugLong(date)}"
    PageFrame(
        vm, titleText, nav::back, nav.openAccount, { ListSkeleton(8, 50) },
        overlay = { p, _ ->
            val plan = p.plan
            if (upload.active) Box(Modifier.fillMaxSize().padding(12.dp), contentAlignment = Alignment.BottomCenter) { UploadPanel(upload) }
            val item = openId?.let { id -> plan.items.firstOrNull { it.id == id } }
            LaunchedEffect(item == null) { if (item == null) openId = null } // elementul a fost șters
            if (item != null) {
                ItemDrawer(
                    plan, item, upload, actions,
                    onDismiss = { openId = null },
                    onSave = { body, done -> scope.launch { val ok = mutate("PATCH", "/api/program/$date/items/${item.id}", body) != null; if (ok) { haptics.performHapticFeedback(HapticFeedbackType.Confirm); g.toast("Salvat.") }; done(ok) } },
                    onMove = { delta ->
                        val ids = plan.items.map { it.id }.toMutableList()
                        val idx = ids.indexOf(item.id); val to = idx + delta
                        if (to in ids.indices) {
                            ids[idx] = ids[to].also { ids[to] = ids[idx] }
                            haptics.performHapticFeedback(HapticFeedbackType.SegmentTick)
                            scope.launch { mutate("PUT", "/api/program/$date/ordine", buildJsonObject { put("ids", buildJsonArray { ids.forEach { add(JsonPrimitive(it)) } }) }) }
                        }
                    },
                    onDelete = { close ->
                        scope.launch {
                            val ok = dialogs.confirm(
                                if (item.isHeader) "Elementele ei nu se șterg; trec în secțiunea de deasupra." else "Resursele lui rămân la „Resurse generale\".",
                                title = if (item.isHeader) "Ștergi secțiunea?" else "Ștergi elementul?", ok = "Șterge", danger = true,
                            )
                            if (!ok) return@launch
                            close()
                            if (mutate("DELETE", "/api/program/$date/items/${item.id}") != null) g.toast("Șters.")
                        }
                    },
                )
            }
        },
    ) { p, _ ->
        val plan = p.plan
        val admin = plan.perms.admin

        fun add(kind: String, after: Long?) {
            scope.launch {
                val before = plan.items.map { it.id }.toSet()
                val next = mutate("POST", "/api/program/$date/items", buildJsonObject {
                    put("kind", JsonPrimitive(kind)); if (after != null) put("after_id", JsonPrimitive(after))
                })
                next?.items?.firstOrNull { it.id !in before }?.let { openId = it.id }
            }
        }

        item("head") {
            HeadBlock(plan, p.hasFeedback, onFeedback = { nav.to(Routes.day(date)) }, onDelete = {
                scope.launch {
                    val ok = dialogs.confirm("Programul acestei duminici se șterge cu toate resursele urcate. Nu se poate anula.", title = "Ștergi duminica?", ok = "Șterge duminica", danger = true)
                    if (!ok) return@launch
                    try {
                        g.api.send("DELETE", "/api/program/$date")
                        g.markChanged()
                        nav.back()
                    } catch (e: ApiError) { g.toast(e.message ?: "Eroare", error = true) }
                }
            })
        }
        item("plan") { PlanCard(plan, onOpen = { openId = it }, onAdd = ::add) }
        item("details") {
            DetailsCard(plan, p.preachers, detailsKey) { body, done ->
                scope.launch {
                    val ok = mutate("PATCH", "/api/program/$date", body) != null
                    if (ok) { detailsKey++; g.toast("Detaliile au fost salvate.") }
                    done()
                }
            }
        }
        item("resources") {
            val c = puls
            Column(H.padding(top = 16.dp).fillMaxWidth().cardSurface().padding(horizontal = 18.dp, vertical = 20.dp)) {
                Text("RESURSE GENERALE", style = caps(13.sp, c.text3, .06f), modifier = Modifier.padding(bottom = 14.dp))
                ResourceList(plan.resources.filter { it.item_id == null }, actions)
                if (plan.perms.canAddResource) ResourceAdder(null, plan.perms.uploadsEnabled, actions)
            }
        }
        item("updated") {
            val s = plan.sunday
            if (s.updated_at != null) {
                Text(
                    "Ultima modificare: ${s.updated_at.replace(" ", " la ").take(19)} (UTC)${if (!s.updated_by.isNullOrBlank()) " · " + s.updated_by else ""}",
                    style = body(12.sp, 400, puls.text3), modifier = H.padding(top = 12.dp),
                )
            }
        }
        item("end") { Spacer(Modifier.height(if (admin) 60.dp else 40.dp)) }
    }
}

private class EditActions(
    val upload: (Long?) -> Unit,
    val open: (PlanResource) -> Unit,
    val delete: (PlanResource) -> Unit,
    val addLink: (Long?, String, String, (Boolean) -> Unit) -> Unit,
)

private fun totalSec(plan: Plan) = plan.items.filter { !it.isHeader }.sumOf { it.length_sec }

// ---------------------------------------------------------------- antet

@Composable
private fun HeadBlock(plan: Plan, hasFeedback: Boolean, onFeedback: () -> Unit, onDelete: () -> Unit) {
    val c = puls
    val s = plan.sunday
    val t = totalSec(plan)
    Column(H.padding(top = 16.dp)) {
        Text("Duminică, ${formatSlugLong(s.date)}", style = display(22.sp, 700, c.text, 27.sp))
        FlowRow(Modifier.padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            HeadChip {
                if (s.preacher_name.isNotBlank()) Text(buildAnnotatedString {
                    append("Predică: "); withStyle(SpanStyle(fontWeight = FontWeight.W800)) { append(s.preacher_name) }
                }, style = body(12.sp, 500, c.text2))
                else Text("Predicator necompletat", style = body(12.sp, 500, c.text2))
            }
            HeadChip { Text("${s.start_time} - ~${clock(s.start_time, t)}", style = body(12.sp, 500, c.text2)) }
            HeadChip { Text("durată ${formatDuration(t)}", style = body(12.sp, 500, c.text2)) }
            if (plan.perms.ownSunday) HeadChip { Text("predici tu", style = body(12.sp, 500, c.text2)) }
            if (plan.isPast && s.attendance != null) HeadChip { Text("${s.attendance} prezenți", style = body(12.sp, 500, c.text2)) }
        }
        val showFeedback = plan.isPast && hasFeedback
        if (showFeedback || plan.perms.admin) {
            Row(Modifier.fillMaxWidth().padding(top = 14.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (showFeedback) PBtn("Vezi feedback-ul →", onFeedback, Modifier.weight(1f))
                if (plan.perms.admin) PBtn("Șterge duminica", onDelete, Modifier.weight(1f), kind = BtnKind.Danger)
            }
        }
    }
}

@Composable
private fun HeadChip(content: @Composable () -> Unit) {
    val c = puls
    Box(Modifier.clip(CircleShape).background(c.surface2).border(1.dp, c.border, CircleShape).padding(horizontal = 11.dp, vertical = 4.dp)) { content() }
}

// ---------------------------------------------------------------- planul (în stilul Planning Center)

@Composable
private fun PlanCard(plan: Plan, onOpen: (Long) -> Unit, onAdd: (String, Long?) -> Unit) {
    val c = puls
    val admin = plan.perms.admin
    val totals = HashMap<Long, Int>().also { m ->
        var current: Long? = null
        plan.items.forEach { i -> if (i.isHeader) { current = i.id; m[i.id] = 0 } else current?.let { m[it] = (m[it] ?: 0) + i.length_sec } }
    }
    fun lastIdOfSection(headerId: Long): Long {
        val idx = plan.items.indexOfFirst { it.id == headerId }
        var last = headerId
        var k = idx + 1
        while (k < plan.items.size && !plan.items[k].isHeader) { last = plan.items[k].id; k++ }
        return last
    }
    fun Modifier.bottomLine() = drawBehind { drawLine(c.border, Offset(0f, size.height), Offset(size.width, size.height), 1.dp.toPx()) }

    Column(H.padding(top = 16.dp).fillMaxWidth().cardSurface()) {
        Row(Modifier.fillMaxWidth().height(40.dp).bottomLine().padding(horizontal = 12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("ORA", style = caps(10.5.sp, c.text3, .04f), modifier = Modifier.width(42.dp))
            // coloana are 40dp, ca pe site; eticheta are voie să treacă peste marginea ei
            Box(Modifier.width(40.dp)) {
                Text("DURATĂ", style = caps(10.5.sp, c.text3, .04f), softWrap = false, modifier = Modifier.wrapContentWidth(Alignment.Start, unbounded = true))
            }
            Text("TITLU", style = caps(10.5.sp, c.text3, .04f), modifier = Modifier.weight(1f))
            Text("RES.", style = caps(10.5.sp, c.text3, .04f), modifier = Modifier.width(30.dp), textAlign = TextAlign.End)
        }
        if (plan.items.isEmpty()) EmptyState("Programul e gol.")
        var offset = 0
        plan.items.forEach { item ->
            if (item.isHeader) {
                val songs = plan.items.any { it.isSong && it.section == item.title }
                Row(
                    Modifier.fillMaxWidth().heightIn(min = 48.dp).background(c.surface2).bottomLine()
                        .then(if (admin) Modifier.clickable { onOpen(item.id) } else Modifier)
                        .padding(horizontal = 12.dp),
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Spacer(Modifier.width(42.dp))
                    Row(Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically) {
                        Text(item.title.ifBlank { "SECȚIUNE" }.uppercase(), style = display(12.sp, 700, c.text).copy(letterSpacing = .72.sp), maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                        val total = totals[item.id] ?: 0
                        if (total > 0) Text("  ${formatDuration(total)}", style = mono(11.sp, 500, c.text3))
                    }
                    if (item.canAddAfter) {
                        Box(
                            Modifier.size(width = 44.dp, height = 40.dp).clip(RoundedCornerShape(7.dp)).background(c.surface).border(1.dp, c.border, RoundedCornerShape(7.dp))
                                .clickable(role = Role.Button, onClickLabel = "Adaugă în ${item.title}") { onAdd(if (songs) "song" else "item", lastIdOfSection(item.id)) },
                            contentAlignment = Alignment.Center,
                        ) { Text("+", style = body(16.sp, 700, c.text)) }
                    }
                }
            } else {
                val start = clock(plan.sunday.start_time, offset)
                offset += item.length_sec
                val n = plan.resources.count { it.item_id == item.id }
                val sub = listOf(item.person, item.notes).filter { it.isNotBlank() }.joinToString(" · ")
                Row(
                    Modifier.fillMaxWidth().heightIn(min = 54.dp).bottomLine().clickable { onOpen(item.id) }
                        .drawBehind { if (item.canEdit && !admin) drawCircle(c.accentMark, 2.5.dp.toPx(), Offset(5.5.dp.toPx(), size.height / 2)) }
                        .padding(horizontal = 12.dp),
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text(start, style = mono(11.sp, 500, c.text3), modifier = Modifier.width(42.dp))
                    Text(formatDuration(item.length_sec), style = mono(12.sp, 500, c.text2), modifier = Modifier.width(40.dp))
                    Column(Modifier.weight(1f).padding(vertical = 8.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                            if (item.title.isNotBlank()) Text(item.title, style = body(13.5.sp, 700, c.text), maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                            else Text(if (item.isSong) "Cântare de ales" else "Fără titlu", style = body(13.5.sp, 600, c.text3).copy(fontStyle = FontStyle.Italic), maxLines = 1)
                            if (item.isSong && item.song_key.isNotBlank()) KeyBadge(item.song_key, c)
                        }
                        if (sub.isNotBlank()) Text(sub, style = body(12.sp, 400, c.text3), maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 2.dp))
                    }
                    Row(Modifier.width(30.dp), horizontalArrangement = Arrangement.End, verticalAlignment = Alignment.CenterVertically) {
                        if (n > 0) {
                            Icon(PulsIcons.get("clip"), null, tint = c.text2, modifier = Modifier.size(13.dp))
                            Text("$n", style = body(12.sp, 700, c.text2))
                        }
                    }
                }
            }
        }
        val t = totalSec(plan)
        Column(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(buildAnnotatedString {
                append("Total: ")
                withStyle(SpanStyle(fontFamily = ro.bisericalogos.pulsul.nativ.ui.theme.PlexMono, color = c.text, fontWeight = FontWeight.W600)) { append(formatDuration(t)) }
                append(" · ${plan.sunday.start_time} - ~${clock(plan.sunday.start_time, t)}")
            }, style = body(13.sp, 400, c.text2))
            if (admin) Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                PBtn("+ Cântare", { onAdd("song", null) }, Modifier.weight(1f), small = true)
                PBtn("+ Element", { onAdd("item", null) }, Modifier.weight(1f), small = true)
                PBtn("+ Secțiune", { onAdd("header", null) }, Modifier.weight(1f), small = true)
            }
        }
    }
}

@Composable
private fun KeyBadge(key: String, c: PulsColors) {
    Box(
        Modifier.heightIn(min = 20.dp).widthIn(min = 20.dp).clip(CircleShape).background(c.r5).padding(horizontal = 5.dp),
        contentAlignment = Alignment.Center,
    ) { Text(key, style = body(10.5.sp, 800, androidx.compose.ui.graphics.Color.White)) }
}

// ---------------------------------------------------------------- detaliile duminicii

@Composable
private fun DetailsCard(plan: Plan, preachers: List<String>, key: Int, onSave: (JsonElement, () -> Unit) -> Unit) {
    val c = puls
    val s = plan.sunday
    Column(H.padding(top = 16.dp).fillMaxWidth().cardSurface().padding(horizontal = 18.dp, vertical = 20.dp)) {
        if (!plan.perms.admin) {
            Text("DETALII", style = caps(13.sp, c.text3, .06f), modifier = Modifier.padding(bottom = 14.dp))
            ViewField("Predicator", s.preacher_name.ifBlank { "-" })
            ViewField("Ora de început", s.start_time, Modifier.padding(top = 10.dp))
            if (s.notes.isNotBlank()) ViewField("Notițe", s.notes, Modifier.padding(top = 10.dp))
            Text(
                if (plan.perms.ownSunday) "Poți modifica elementele din secțiunea PREDICA (și cele unde ești trecut ca persoană) și poți urca resurse oriunde în această duminică."
                else "Poți vedea programul. Modifici doar elementele unde ești trecut ca persoană.",
                style = body(12.sp, 400, c.text3, 17.sp),
                modifier = Modifier.padding(top = 14.dp).fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(c.surface2).padding(horizontal = 12.dp, vertical = 10.dp),
            )
            return@Column
        }
        // Formularul se reface doar la încărcare și după salvarea lui — altfel o urcare de
        // fișier ar șterge ce ai scris aici și n-ai salvat încă (ca pe site).
        var preacher by remember(key) { mutableStateOf(s.preacher_name) }
        var start by remember(key) { mutableStateOf(s.start_time) }
        var attendance by remember(key) { mutableStateOf(s.attendance?.toString().orEmpty()) }
        var notes by remember(key) { mutableStateOf(s.notes) }
        var busy by remember { mutableStateOf(false) }
        Text("DETALII DUMINICĂ", style = caps(13.sp, c.text3, .06f), modifier = Modifier.padding(bottom = 14.dp))
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Field("Predicator", preacher, { preacher = it }, capitalize = true)
            if (preachers.isNotEmpty()) FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                preachers.forEach { pr -> Chip(pr, name = pr == preacher, onClick = { preacher = pr }) }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Field("Început", start, { start = it.take(5) }, Modifier.weight(1f), keyboardType = KeyboardType.Number, mono = true)
                Field("Prezență", attendance, { v -> attendance = v.filter { it.isDigit() } }, Modifier.weight(1f), placeholder = if (plan.isPast) "nr. persoane" else "după întâlnire", keyboardType = KeyboardType.Number)
            }
            Field("Notițe generale", notes, { notes = it }, singleLine = false, minLines = 2, placeholder = "ex. echipa de tehnic, ce se schimbă față de obicei…", capitalize = true, imeAction = ImeAction.Default)
            PBtn("Salvează detaliile", {
                busy = true
                onSave(buildJsonObject {
                    put("preacher_name", JsonPrimitive(preacher)); put("start_time", JsonPrimitive(start))
                    put("attendance", attendance.toIntOrNull()?.let { JsonPrimitive(it) } ?: JsonNull); put("notes", JsonPrimitive(notes))
                }) { busy = false }
            }, Modifier.fillMaxWidth(), kind = BtnKind.Primary, busy = busy)
            Text("Schimbarea predicatorului mută și elementele trecute pe numele lui.", style = body(12.sp, 400, c.text3))
        }
    }
}

@Composable
private fun ViewField(label: String, value: String, modifier: Modifier = Modifier) {
    val c = puls
    Column(modifier) {
        Text(label, style = body(11.5.sp, 700, c.text3), modifier = Modifier.padding(bottom = 2.dp))
        Text(value, style = body(13.5.sp, 400, c.text, 20.sp))
    }
}

// ---------------------------------------------------------------- resurse

@Composable
private fun ResourceList(list: List<PlanResource>, actions: EditActions) {
    val c = puls
    if (list.isEmpty()) { Text("Nicio resursă încă.", style = body(12.5.sp, 400, c.text3)); return }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        list.forEach { r ->
            Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(c.surface2).clickable { actions.open(r) }.padding(start = 11.dp, top = 9.dp, bottom = 9.dp, end = 4.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Box(Modifier.size(30.dp).clip(RoundedCornerShape(8.dp)).background(c.surface), contentAlignment = Alignment.Center) {
                    if (r.isLink) Icon(PulsIcons.get("link"), null, tint = c.accentMark, modifier = Modifier.size(16.dp))
                    else Text(extOf(r.name), style = mono(10.sp, 700, c.accentMark))
                }
                Column(Modifier.weight(1f)) {
                    Text(r.name, style = body(13.sp, 700, c.text), maxLines = 1, overflow = TextOverflow.Ellipsis)
                    val where = if (r.isLink) runCatching { Uri.parse(r.url).host }.getOrNull().orEmpty() else fmtSize(r.size)
                    Text("$where · ${r.uploaded_by}", style = body(11.5.sp, 400, c.text3), modifier = Modifier.padding(top = 1.dp))
                }
                if (r.canDelete) Box(
                    Modifier.size(44.dp).clip(RoundedCornerShape(8.dp)).clickable(role = Role.Button, onClickLabel = "Șterge ${r.name}") { actions.delete(r) },
                    contentAlignment = Alignment.Center,
                ) { Text("×", style = body(20.sp, 400, c.text3)) }
            }
        }
    }
}

@Composable
private fun ResourceAdder(itemId: Long?, uploadsEnabled: Boolean, actions: EditActions) {
    val c = puls
    var name by remember { mutableStateOf("") }
    var url by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    Column(Modifier.padding(top = 12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        if (uploadsEnabled) {
            Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).dashedBorder(c.border, 12.dp)
                    .clickable(role = Role.Button) { actions.upload(itemId) }.padding(14.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Icon(PulsIcons.get("upload"), null, tint = c.accentMark, modifier = Modifier.size(20.dp))
                Text(buildAnnotatedString {
                    withStyle(SpanStyle(color = c.accentMark, fontWeight = FontWeight.W700)) { append("Urcă fișiere") }
                    append(" · PPT, Keynote, PDF, imagini, audio, video · max 50 MB")
                }, style = body(12.5.sp, 400, c.text3, 17.sp))
            }
        } else Text("Urcarea de fișiere nu e activată încă (R2). Poți adăuga linkuri.", style = body(12.5.sp, 400, c.text3))
        Field("Nume link (opțional)", name, { name = it })
        Field("Adresă", url, { url = it.trim() }, placeholder = "https://… (Drive, Slides, YouTube)", keyboardType = KeyboardType.Uri, imeAction = ImeAction.Done)
        PBtn("Adaugă link", {
            if (url.isBlank()) return@PBtn
            busy = true
            actions.addLink(itemId, name, url) { ok -> busy = false; if (ok) { name = ""; url = "" } }
        }, Modifier.fillMaxWidth(), busy = busy, enabled = url.isNotBlank())
    }
}

@Composable
private fun UploadPanel(u: UploadState) {
    val c = puls
    Column(
        Modifier.widthIn(max = 440.dp).fillMaxWidth()
            .shadow(8.dp, RoundedCornerShape(14.dp), spotColor = c.shadowTint.copy(.15f))
            .clip(RoundedCornerShape(14.dp)).background(c.surface).border(1.dp, c.border, RoundedCornerShape(14.dp))
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(9.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(u.label, style = body(13.sp, 700, c.text), maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
            Text("${(u.progress * 100).toInt()}%", style = mono(12.sp, 500, c.text2))
            PBtn("Anulează", { u.call?.cancel() }, small = true)
        }
        Box(Modifier.fillMaxWidth().height(6.dp).clip(RoundedCornerShape(3.dp)).background(c.surface2)) {
            Box(Modifier.fillMaxWidth(u.progress).fillMaxHeight().clip(RoundedCornerShape(3.dp)).background(c.accentMark))
        }
    }
}

// ---------------------------------------------------------------- panoul de editare (3 moduri)

@Composable
private fun ItemDrawer(
    plan: Plan,
    item: PlanItem,
    upload: UploadState,
    actions: EditActions,
    onDismiss: () -> Unit,
    onSave: (JsonElement, (Boolean) -> Unit) -> Unit,
    onMove: (Int) -> Unit,
    onDelete: (close: () -> Unit) -> Unit,
) {
    val c = puls
    val admin = plan.perms.admin
    val title = when {
        item.isHeader -> "Secțiune"
        else -> item.title.ifBlank { if (item.isSong) "Cântare" else "Element" }
    }
    PulsSheet(onDismiss = onDismiss, title = title) { sheet ->
        if (upload.active) Box(Modifier.padding(bottom = 14.dp)) { UploadPanel(upload) }
        val resources = plan.resources.filter { it.item_id == item.id }
        var fTitle by remember(item.id) { mutableStateOf(item.title) }
        var fLen by remember(item.id) { mutableStateOf(formatDuration(item.length_sec)) }
        var fKey by remember(item.id) { mutableStateOf(item.song_key) }
        var fPerson by remember(item.id) { mutableStateOf(item.person) }
        var fNotes by remember(item.id) { mutableStateOf(item.notes) }
        var fKind by remember(item.id) { mutableStateOf(item.kind) }
        var busy by remember { mutableStateOf(false) }
        val g = PulsulApp.graph

        val save: () -> Unit = save@{
            val body = buildJsonObject {
                put("title", JsonPrimitive(fTitle))
                if (!item.isHeader) {
                    val len = parseDuration(fLen)
                    if (len == null) { g.toast("Durata trebuie scrisă ca mm:ss (ex. 5:30) sau doar minute.", error = true); return@save }
                    put("length_sec", JsonPrimitive(len)); put("person", JsonPrimitive(fPerson)); put("notes", JsonPrimitive(fNotes))
                    if (fKind == "song") put("song_key", JsonPrimitive(fKey))
                    if (admin) put("kind", JsonPrimitive(fKind))
                }
            }
            busy = true
            onSave(body) { ok -> busy = false; if (ok) sheet.close() }
        }

        Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
            when {
                item.isHeader -> {
                    Field("Nume secțiune", fTitle, { fTitle = it }, capitalize = true, imeAction = ImeAction.Done)
                    ReadonlyNote("Ștergerea unei secțiuni nu șterge elementele ei: ele trec în secțiunea de deasupra.")
                }
                item.canEdit -> {
                    if (admin) SelectField("Tip", fKind, listOf("item" to "Element", "song" to "Cântare"), { fKind = it })
                    Field(if (fKind == "song") "Titlul cântării" else "Titlu", fTitle, { fTitle = it }, placeholder = if (fKind == "song") "ex. Măreţul har (Aleluia, m-a salvat)" else "", capitalize = true)
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Field("Durată (mm:ss)", fLen, { fLen = it }, Modifier.weight(1f), keyboardType = KeyboardType.Number, mono = true)
                        if (fKind == "song") Field("Tonalitate", fKey, { fKey = it.take(8) }, Modifier.weight(1f), placeholder = "ex. D, Eb, F#m")
                        else Spacer(Modifier.weight(1f))
                    }
                    Field("Cine (persoană)", fPerson, { fPerson = it }, placeholder = "ex. Beni sau Bea", capitalize = true)
                    Field("Notițe", fNotes, { fNotes = it }, singleLine = false, minLines = 3, capitalize = true, imeAction = ImeAction.Default)
                    DrawerResources(item, resources, plan.perms.uploadsEnabled, actions)
                }
                else -> {
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        ViewField("Durată", formatDuration(item.length_sec), Modifier.weight(1f))
                        if (item.isSong) ViewField("Tonalitate", item.song_key.ifBlank { "-" }, Modifier.weight(1f))
                    }
                    if (item.person.isNotBlank()) ViewField("Cine", item.person)
                    if (item.notes.isNotBlank()) ViewField("Notițe", item.notes)
                    DrawerResources(item, resources, plan.perms.uploadsEnabled, actions)
                }
            }
            // butoanele de jos (.drawer-foot)
            Row(Modifier.fillMaxWidth().padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                if (item.isHeader || item.canEdit) {
                    PBtn("Salvează", save, Modifier.weight(1f), kind = BtnKind.Primary, busy = busy)
                    if (admin) {
                        PBtn("↑", { onMove(-1) }, Modifier.width(48.dp))
                        PBtn("↓", { onMove(1) }, Modifier.width(48.dp))
                    }
                    if (item.isHeader || item.canDelete) PBtn(if (item.isHeader) "Șterge secțiunea" else "Șterge", { onDelete { sheet.close() } }, kind = BtnKind.Danger)
                } else {
                    PBtn("Închide", { sheet.close() }, Modifier.fillMaxWidth())
                }
            }
        }
    }
}

@Composable
private fun DrawerResources(item: PlanItem, resources: List<PlanResource>, uploadsEnabled: Boolean, actions: EditActions) {
    val c = puls
    Column {
        Text("RESURSE", style = caps(12.sp, c.text3, .06f), modifier = Modifier.padding(top = 6.dp, bottom = 10.dp))
        ResourceList(resources, actions)
        if (item.canAddResource) ResourceAdder(item.id, uploadsEnabled, actions)
    }
}

@Composable
private fun ReadonlyNote(text: String) {
    val c = puls
    Text(text, style = body(12.sp, 400, c.text3, 17.sp), modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(c.surface2).padding(horizontal = 12.dp, vertical = 10.dp))
}

// ---------------------------------------------------------------- fișiere

private fun queryMeta(context: Context, uri: Uri): Pair<String, Long> {
    var name = uri.lastPathSegment ?: "fisier"
    var size = -1L
    context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)?.use { c ->
        if (c.moveToFirst()) {
            c.getString(0)?.let { name = it }
            if (!c.isNull(1)) size = c.getLong(1)
        }
    }
    return name to size
}

// Fișierul se descarcă (cu tokenul) în cache și se deschide cu aplicația potrivită; linkurile, în browser.
private suspend fun openResource(context: Context, r: PlanResource) {
    val g = PulsulApp.graph
    try {
        if (r.isLink) {
            context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(r.url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            return
        }
        val dir = File(context.cacheDir, "resurse")
        val file = File(dir, "${r.id}-${r.name.replace(Regex("[^\\p{L}\\p{N}._-]"), "_")}")
        if (!file.exists() || file.length() == 0L) {
            g.toast("Se descarcă ${r.name}…")
            g.api.download(r.url, file)
        }
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.fisiere", file)
        val intent = Intent(Intent.ACTION_VIEW).setDataAndType(uri, r.content_type ?: "*/*")
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(Intent.createChooser(intent, r.name).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    } catch (e: ActivityNotFoundException) {
        g.toast("Nu am găsit o aplicație care să deschidă acest fișier.", error = true)
    } catch (e: ApiError) {
        g.toast(e.message ?: "Eroare", error = true)
    }
}
