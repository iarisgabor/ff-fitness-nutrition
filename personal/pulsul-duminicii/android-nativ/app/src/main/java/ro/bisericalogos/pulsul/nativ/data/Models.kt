package ro.bisericalogos.pulsul.nativ.data

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

// Formele de date = obiectele build…Payload din src/render.js (aceleași pe care le primesc
// paginile site-ului). Câmpurile cu nume snake_case vin direct din D1.

val PulsJson = Json {
    ignoreUnknownKeys = true
    explicitNulls = false
    coerceInputValues = true
    isLenient = true
}

@Serializable
data class User(
    val role: String,
    val username: String = "",
    val displayName: String? = null,
    val preacherName: String? = null,
    val legacy: Boolean = false,
) {
    val isAdmin get() = role == "admin"
    val isPreacher get() = role == "preacher"
    val shownName get() = displayName?.takeIf { it.isNotBlank() } ?: username
}

@Serializable data class Envelope<T>(val user: User, val data: T)
@Serializable data class SessionReply(val user: User)
@Serializable data class LoginReply(val token: String, val user: User)

@Serializable
data class Meta(
    val stale: Boolean = false,
    val totalResponses: Int = 0,
    val dateRangeLabel: String = "",
    val generatedAtLabel: String = "",
    val heroKpis: List<HeroKpi> = emptyList(),
    val overviewCards: List<OverviewCard> = emptyList(),
    val prevSlug: String? = null,
    val nextSlug: String? = null,
    val overallAvg: Double? = null,
    val globalOverallAvg: Double? = null,
)

@Serializable data class HeroKpi(val value: String, val label: String, val color: String? = null)
@Serializable data class OverviewCard(val tag: String, @SerialName("val") val value: String, val sub: String = "", val big: Boolean = false, val dot: String? = null)

@Serializable
data class Dim(val key: String, val label: String, val full: String = "", val avg: Double = 0.0, val n: Int = 0, val dist: List<Int> = List(5) { 0 })

@Serializable data class Month(val label: String, val short: String, val n: Int = 0, val avg: Double = 0.0)
@Serializable data class Age(val label: String, val n: Int = 0)
@Serializable data class Week(val date: String, val slug: String, val n: Int = 0, val avg: Double = 0.0, val dist: List<Int> = List(5) { 0 })
@Serializable data class Corr(val a: String, val b: String, val r: Double? = null, val n: Int = 0)

@Serializable
data class HomeData(
    val overallAvg: Double = 0.0,
    val dims: List<Dim> = emptyList(),
    val months: List<Month> = emptyList(),
    val ages: List<Age> = emptyList(),
    val quotes: Map<String, List<String>> = emptyMap(),
)

@Serializable data class HomePayload(@SerialName("DATA") val data: HomeData, val meta: Meta = Meta())

@Serializable data class DaySummary(val date: String, val slug: String, val count: Int = 0, val avg: Double? = null)
@Serializable data class DaysPayload(val days: List<DaySummary> = emptyList(), val meta: Meta = Meta())

@Serializable data class DimLabel(val key: String, val label: String, val full: String = "")
@Serializable data class PreacherRef(val name: String, val slug: String)

@Serializable
data class DayPayload(
    val date: String,
    val items: List<JsonObject> = emptyList(),
    val dimLabels: List<DimLabel> = emptyList(),
    val aiSummary: List<String>? = null,
    val preacher: PreacherRef? = null,
    val meta: Meta = Meta(),
) {
    // Un răspuns la formular: {date, time, age, name, q1: {r, t}, …}
    val responses: List<Response> by lazy { items.map(Response::from) }
}

// rawR = textul notei ('' sau '1'..'5'); pe site un răspuns contează dacă are notă SAU text
data class Answer(val r: Int?, val t: String, val rawR: String = r?.toString().orEmpty()) {
    val hasContent get() = rawR.isNotEmpty() || t.isNotBlank()
}

data class Response(val time: String, val age: String, val name: String, val answers: Map<String, Answer>) {
    companion object {
        fun from(o: JsonObject): Response {
            fun str(k: String) = (o[k] as? JsonPrimitive)?.contentOrNull.orEmpty()
            val answers = o.filterKeys { it.matches(Regex("q\\d+")) }.mapValues { (_, v) ->
                val a = runCatching { v.jsonObject }.getOrNull()
                val raw = a?.get("r")?.jsonPrimitive?.contentOrNull.orEmpty()
                val r = raw.toIntOrNull()?.takeIf { it in 1..5 }
                Answer(r, a?.get("t")?.jsonPrimitive?.contentOrNull.orEmpty(), raw)
            }
            return Response(str("time"), str("age"), str("name"), answers)
        }
    }
}

@Serializable data class KeyLabel(val key: String, val label: String)

@Serializable
data class CategoriesPayload(
    val dims: List<Dim> = emptyList(),
    val correlations: List<Corr> = emptyList(),
    val allKeys: List<KeyLabel> = emptyList(),
    val meta: Meta = Meta(),
)

@Serializable
data class CategoryPayload(
    val key: String,
    val label: String,
    val full: String = "",
    val series: List<Week> = emptyList(),
    val allKeys: List<KeyLabel> = emptyList(),
    val trendSummaries: Map<String, String?> = emptyMap(),
    val meta: Meta = Meta(),
)

@Serializable data class PreacherSummary(val name: String, val slug: String, val sundayCount: Int = 0, val avgQ5: Double? = null, val nQ5: Int = 0, val avgOverall: Double? = null)
@Serializable data class PerPreacher(val name: String, val slug: String, val avg: Double? = null, val n: Int = 0)
@Serializable data class ComparisonRow(val key: String, val label: String, val perPreacher: List<PerPreacher> = emptyList())

@Serializable
data class PreachersPayload(
    val preachers: List<PreacherSummary> = emptyList(),
    val comparisonRows: List<ComparisonRow> = emptyList(),
    val scheduleError: String? = null,
    val meta: Meta = Meta(),
)

@Serializable data class DimComparison(val key: String, val label: String, val theirAvg: Double? = null, val theirN: Int = 0, val restAvg: Double? = null, val restN: Int = 0, val delta: Double? = null)
@Serializable data class AttendanceSunday(val date: String, val attendance: Double = 0.0)
@Serializable data class AttendanceStats(val theirAvg: Double? = null, val restAvg: Double? = null, val allAvg: Double? = null, val perSunday: List<AttendanceSunday> = emptyList())
@Serializable data class Upcoming(val date: String, val planned: Boolean = false, val resourceCount: Int = 0, val totalSec: Int = 0)

@Serializable
data class PreacherPayload(
    val name: String,
    val slug: String = "",
    val sundayCount: Int = 0,
    val avgOverall: Double? = null,
    val q5Series: List<Week> = emptyList(),
    val comparison: List<DimComparison> = emptyList(),
    val quotes: List<String> = emptyList(),
    val attendance: AttendanceStats = AttendanceStats(),
    val upcoming: List<Upcoming> = emptyList(),
    val feedbackDates: List<String> = emptyList(),
    val scheduleError: String? = null,
    val meta: Meta = Meta(),
    val self: Boolean = false,
)

// ---- Program duminică

@Serializable
data class SundayRow(
    val date: String,
    val preacher_name: String = "",
    val start_time: String = "10:00",
    val attendance: Int? = null,
    val total_sec: Int = 0,
    val resource_count: Int = 0,
    val isPast: Boolean = false,
    val mine: Boolean = false,
)

@Serializable data class ScheduleEntry(val date: String, val speaker: String)
@Serializable data class CopySource(val date: String, val preacher_name: String = "")

@Serializable
data class ProgramListPayload(
    val today: String = "",
    val sundays: List<SundayRow> = emptyList(),
    val unplanned: List<ScheduleEntry> = emptyList(),
    val schedule: List<ScheduleEntry> = emptyList(),
    val nextFreeSunday: String? = null,
    val copySources: List<CopySource> = emptyList(),
    val dbReady: Boolean = true,
)

@Serializable
data class PlanSunday(
    val date: String,
    val preacher_name: String = "",
    val start_time: String = "10:00",
    val attendance: Int? = null,
    val notes: String = "",
    val updated_at: String? = null,
    val updated_by: String? = null,
)

@Serializable
data class PlanItem(
    val id: Long,
    val kind: String,
    val length_sec: Int = 0,
    val title: String = "",
    val person: String = "",
    val song_key: String = "",
    val notes: String = "",
    val section: String = "",
    val canEdit: Boolean = false,
    val canDelete: Boolean = false,
    val canAddAfter: Boolean = false,
    val canAddResource: Boolean = false,
) {
    val isHeader get() = kind == "header"
    val isSong get() = kind == "song"
}

@Serializable
data class PlanResource(
    val id: Long,
    val item_id: Long? = null,
    val kind: String,
    val name: String,
    val url: String,
    val size: Long? = null,
    val content_type: String? = null,
    val uploaded_by: String = "",
    val created_at: String? = null,
    val canDelete: Boolean = false,
) {
    val isLink get() = kind == "link"
}

@Serializable data class PlanPerms(val admin: Boolean = false, val ownSunday: Boolean = false, val canAddResource: Boolean = false, val uploadsEnabled: Boolean = false)

@Serializable
data class Plan(
    val sunday: PlanSunday,
    val items: List<PlanItem> = emptyList(),
    val resources: List<PlanResource> = emptyList(),
    val perms: PlanPerms = PlanPerms(),
    val isPast: Boolean = false,
)

@Serializable data class ProgramEditPayload(val plan: Plan, val preachers: List<String> = emptyList(), val hasFeedback: Boolean = false)

// ---- Prezență (/prezenta) — al treilea Sheet, separat de getComputedPayload

@Serializable
data class AttendanceWeek(
    val date: String,
    val slug: String = "",
    val members: Int? = null,
    val percent: Double? = null,
    val guests: Int? = null,
    val total: Int = 0,
)

@Serializable
data class AttendanceMeta(
    val stale: Boolean = false,
    val error: String? = null,
    val totalSundays: Int = 0,
    val dateRangeLabel: String = "",
    val generatedAtLabel: String = "",
)

@Serializable
data class AttendancePayload(val series: List<AttendanceWeek> = emptyList(), val meta: AttendanceMeta = AttendanceMeta())

@Serializable data class Account(val id: Long, val username: String, val display_name: String, val preacher_name: String, val created_at: String? = null)
@Serializable data class AccountsReply(val accounts: List<Account> = emptyList())

@Serializable
data class AccountsPayload(
    val accounts: List<Account> = emptyList(),
    val preachers: List<String> = emptyList(),
    val scheduleError: String? = null,
    val dbReady: Boolean = true,
)
