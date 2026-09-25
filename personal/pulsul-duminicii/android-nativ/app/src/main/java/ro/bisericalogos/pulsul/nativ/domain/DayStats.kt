package ro.bisericalogos.pulsul.nativ.domain

import ro.bisericalogos.pulsul.nativ.data.DimLabel
import ro.bisericalogos.pulsul.nativ.data.Response

// Mini-dashboard-ul de sus al unei duminici — port din src/day.html (ratings/perDim/best/worst).
data class DimAvg(val key: String, val label: String, val avg: Double, val n: Int)

data class DayStats(val dayAvg: Double?, val delta: Double?, val best: DimAvg?, val worst: DimAvg?, val count: Int)

fun dayStats(items: List<Response>, dims: List<DimLabel>, overallAvg: Double?): DayStats {
    val ratings = items.flatMap { r -> dims.mapNotNull { d -> r.answers[d.key]?.r } }
    val dayAvg = if (ratings.isNotEmpty()) ratings.average() else null
    val perDim = dims.map { d ->
        val vals = items.mapNotNull { it.answers[d.key]?.r }
        DimAvg(d.key, d.label, if (vals.isNotEmpty()) vals.average() else 0.0, vals.size)
    }.filter { it.n > 0 }
    // sortare stabilă, ca Array.prototype.sort: la egalitate rămâne ordinea categoriilor
    val best = perDim.sortedByDescending { it.avg }.firstOrNull()
    val worst = perDim.sortedBy { it.avg }.firstOrNull()
    val delta = if (dayAvg != null && overallAvg != null && overallAvg != 0.0) dayAvg - overallAvg else null
    return DayStats(dayAvg, delta, best, if (worst?.key != best?.key) worst else null, items.size)
}

// Categoriile care au măcar un răspuns (notă sau text) în ziua asta, în ordinea formularului.
fun catsWithData(items: List<Response>, dims: List<DimLabel>): List<DimLabel> =
    dims.filter { d -> items.any { it.answers[d.key]?.hasContent == true } }

data class Slide(val r: Int?, val rawR: String, val t: String, val name: String, val age: String, val time: String)

fun slidesFor(items: List<Response>, key: String): List<Slide> =
    items.mapNotNull { r ->
        val a = r.answers[key]?.takeIf { it.hasContent } ?: return@mapNotNull null
        Slide(a.r, a.rawR, a.t, r.name, r.age, r.time)
    }
