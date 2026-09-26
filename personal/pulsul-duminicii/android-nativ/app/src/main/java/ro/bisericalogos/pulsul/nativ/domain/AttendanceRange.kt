package ro.bisericalogos.pulsul.nativ.domain

import ro.bisericalogos.pulsul.nativ.data.AttendanceWeek
import java.util.Calendar

// Filtrarea pe interval pentru /prezenta — port 1:1 din applyRange()/currentBounds() din
// src/attendance.html. Nu reutilizează CategoryRange (acela lucrează pe Week cu avg/dist,
// adică note 1-5; aici cifrele sunt persoane/procente) — la fel cum nici site-ul nu partajează
// renderTrend() între category.html și attendance.html.

data class AttendanceAverages(val total: Double?, val members: Double?, val guests: Double?, val percent: Double?)

data class AttendanceRangeResult(
    val weeks: List<AttendanceWeek>, // duminicile din interval, cronologic
    val avg: AttendanceAverages,
    val prevAvg: AttendanceAverages?,
    val best: AttendanceWeek,        // cea mai plină duminică din interval (după total)
)

object AttendanceRange {
    fun dateOf(dateStr: String): Long {
        val d = parseDMY(dateStr)
        return Calendar.getInstance().apply { clear(); set(d.yyyy, d.mm - 1, d.dd, 0, 0, 0) }.timeInMillis
    }

    private fun isoToMs(iso: String?, endOfDay: Boolean): Long? {
        val p = iso?.takeIf { it.isNotBlank() }?.split("-")?.mapNotNull { it.toIntOrNull() } ?: return null
        if (p.size != 3) return null
        return Calendar.getInstance().apply {
            clear()
            if (endOfDay) set(p[0], p[1] - 1, p[2], 23, 59, 59) else set(p[0], p[1] - 1, p[2], 0, 0, 0)
        }.timeInMillis
    }

    fun toIso(ms: Long): String {
        val c = Calendar.getInstance().apply { timeInMillis = ms }
        return "%04d-%02d-%02d".format(c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH))
    }

    // Date.prototype.setMonth(getMonth() - n): vezi CategoryRange.minusMonths — același comportament.
    private fun minusMonths(ms: Long, months: Int): Long {
        val c = Calendar.getInstance().apply { isLenient = true; timeInMillis = ms }
        c.set(Calendar.MONTH, c.get(Calendar.MONTH) - months)
        return c.timeInMillis
    }

    private fun avgOf(weeks: List<AttendanceWeek>, sel: (AttendanceWeek) -> Number?): Double? {
        val vals = weeks.mapNotNull { sel(it)?.toDouble() }
        return if (vals.isNotEmpty()) vals.sum() / vals.size else null
    }

    private fun averages(weeks: List<AttendanceWeek>) = AttendanceAverages(
        total = avgOf(weeks) { it.total },
        members = avgOf(weeks) { it.members },
        guests = avgOf(weeks) { it.guests },
        percent = avgOf(weeks) { it.percent },
    )

    // null = nicio duminică de prezență în intervalul ales
    fun compute(series: List<AttendanceWeek>, rangeKey: String, customFrom: String?, customTo: String?, now: Long = System.currentTimeMillis()): AttendanceRangeResult? {
        var months: Int? = null
        val (since, until) = when (rangeKey) {
            "all" -> null to null
            "custom" -> isoToMs(customFrom, false) to isoToMs(customTo, true)
            else -> {
                months = rangeKey.toIntOrNull() ?: 12
                minusMonths(now, months) to now
            }
        }
        fun inRange(ms: Long, s: Long?, u: Long?) = (s == null || ms >= s) && (u == null || ms <= u)

        val weeks = series.filter { inRange(dateOf(it.date), since, until) }
        if (weeks.isEmpty()) return null

        var prevAvg: AttendanceAverages? = null
        if (since != null) {
            val prevUntil = since - 86_400_000L
            val prevSince = if (months != null) minusMonths(since, months) else since - ((until ?: now) - since)
            val prevWeeks = series.filter { inRange(dateOf(it.date), prevSince, prevUntil) }
            if (prevWeeks.isNotEmpty()) prevAvg = averages(prevWeeks)
        }

        return AttendanceRangeResult(
            weeks = weeks, avg = averages(weeks), prevAvg = prevAvg,
            best = weeks.maxByOrNull { it.total } ?: weeks.first(),
        )
    }
}
