package ro.bisericalogos.pulsul.nativ.domain

import ro.bisericalogos.pulsul.nativ.data.Week
import java.util.Calendar
import kotlin.math.pow
import kotlin.math.sqrt

// Filtrarea pe interval și tot ce se calculează pe pagina unei categorii — port 1:1 din
// src/category.html (applyRange și funcțiile lui). Datele sunt la miezul nopții, ora locală.

data class Agg(val n: Int, val avg: Double, val dist: List<Int>)
data class Streak(val len: Int, val from: Week, val to: Week)
data class Yoy(val prevLabel: String, val curLabel: String, val prev: Agg, val cur: Agg) {
    val delta get() = cur.avg - prev.avg
}

data class RangeResult(
    val weeks: List<Week>,          // săptămânile cu date din interval, cronologic
    val agg: Agg,
    val prevAgg: Agg?,
    val best: Week,
    val worst: Week?,
    val goodStreak: Streak?,
    val badStreak: Streak?,
    val globalAvg: Double,
    val yoy: Yoy?,
)

val RANGE_OPTIONS = listOf("1" to "1 lună", "3" to "3 luni", "6" to "6 luni", "12" to "12 luni", "all" to "Tot", "custom" to "Personalizat")

object CategoryRange {
    fun dateOf(w: Week): Long {
        val d = parseDMY(w.date)
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

    // Date.prototype.setMonth(getMonth() - n): calendarul „lenient" depășește luna ca JS
    // (31 mai minus 3 luni = 3 martie), nu se oprește la ultima zi ca Calendar.add.
    private fun minusMonths(ms: Long, months: Int): Long {
        val c = Calendar.getInstance().apply { isLenient = true; timeInMillis = ms }
        c.set(Calendar.MONTH, c.get(Calendar.MONTH) - months)
        return c.timeInMillis
    }

    fun aggregate(weeks: List<Week>): Agg {
        val dist = IntArray(5)
        weeks.forEach { w -> w.dist.forEachIndexed { i, c -> if (i < 5) dist[i] += c } }
        val n = dist.sum()
        val sum = dist.withIndex().sumOf { (i, c) -> c * (i + 1) }
        return Agg(n, if (n > 0) sum.toDouble() / n else 0.0, dist.toList())
    }

    fun weekStdDev(dist: List<Int>, avg: Double): Double {
        val n = dist.sum()
        if (n == 0) return 0.0
        val variance = dist.withIndex().sumOf { (i, c) -> c * ((i + 1) - avg).pow(2) } / n
        return sqrt(variance)
    }

    fun longestStreak(weeks: List<Week>, predicate: (Week) -> Boolean): Streak? {
        var bestLen = 0; var bestStart = -1; var bestEnd = -1
        var curLen = 0; var curStart = -1
        weeks.forEachIndexed { i, w ->
            if (predicate(w)) {
                if (curLen == 0) curStart = i
                curLen++
                if (curLen > bestLen) { bestLen = curLen; bestStart = curStart; bestEnd = i }
            } else curLen = 0
        }
        return if (bestLen > 0) Streak(bestLen, weeks[bestStart], weeks[bestEnd]) else null
    }

    private fun cal(ms: Long) = Calendar.getInstance().apply { timeInMillis = ms }

    private fun isMonthLikelyComplete(ms: Long): Boolean {
        val c = cal(ms)
        return c.get(Calendar.DAY_OF_MONTH) + 7 > c.getActualMaximum(Calendar.DAY_OF_MONTH)
    }

    private fun monthsCovered(weeks: List<Week>): Int {
        if (weeks.size < 2) return 0
        val a = cal(dateOf(weeks.first())); val b = cal(dateOf(weeks.last()))
        return (b.get(Calendar.YEAR) - a.get(Calendar.YEAR)) * 12 + (b.get(Calendar.MONTH) - a.get(Calendar.MONTH))
    }

    private fun weeksInMonth(all: List<Week>, year: Int, month: Int) = all.filter {
        val c = cal(dateOf(it))
        it.n > 0 && c.get(Calendar.YEAR) == year && c.get(Calendar.MONTH) == month
    }

    private fun yoy(series: List<Week>, weeksWithData: List<Week>): Yoy? {
        if (monthsCovered(series.filter { it.n > 0 }) < 12) return null
        if (weeksWithData.isEmpty()) return null
        var idx = weeksWithData.size - 1
        if (!isMonthLikelyComplete(dateOf(weeksWithData[idx]))) idx--
        if (idx < 0) return null
        val t = cal(dateOf(weeksWithData[idx]))
        val year = t.get(Calendar.YEAR); val month = t.get(Calendar.MONTH)
        val cur = weeksInMonth(series, year, month)
        val prev = weeksInMonth(series, year - 1, month)
        if (cur.isEmpty() || prev.isEmpty()) return null
        return Yoy("${MONTHS_RO_FULL[month]} ${year - 1}", "${MONTHS_RO_FULL[month]} $year", aggregate(prev), aggregate(cur))
    }

    // null = niciun răspuns în intervalul ales
    fun compute(series: List<Week>, rangeKey: String, customFrom: String?, customTo: String?, now: Long = System.currentTimeMillis()): RangeResult? {
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

        val allWithData = series.filter { it.n > 0 }
        val global = aggregate(allWithData)
        val weeks = allWithData.filter { inRange(dateOf(it), since, until) }
        if (weeks.isEmpty()) return null

        val agg = aggregate(weeks)
        val best = weeks.sortedByDescending { it.avg }.first()
        val worstCandidate = weeks.sortedBy { it.avg }.first()
        val worst = if (worstCandidate.slug != best.slug) worstCandidate else null

        var prevAgg: Agg? = null
        if (since != null) {
            val prevUntil = since - 86_400_000L
            val prevSince = if (months != null) minusMonths(since, months) else since - ((until ?: now) - since)
            val prevWeeks = allWithData.filter { inRange(dateOf(it), prevSince, prevUntil) }
            if (prevWeeks.isNotEmpty()) prevAgg = aggregate(prevWeeks)
        }

        return RangeResult(
            weeks = weeks, agg = agg, prevAgg = prevAgg, best = best, worst = worst,
            goodStreak = longestStreak(weeks) { it.avg >= global.avg },
            badStreak = longestStreak(weeks) { it.avg < global.avg },
            globalAvg = global.avg,
            yoy = yoy(series, weeks),
        )
    }
}
