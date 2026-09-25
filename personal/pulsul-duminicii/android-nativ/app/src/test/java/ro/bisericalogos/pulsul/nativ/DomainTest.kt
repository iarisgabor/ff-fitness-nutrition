package ro.bisericalogos.pulsul.nativ

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import ro.bisericalogos.pulsul.nativ.data.Answer
import ro.bisericalogos.pulsul.nativ.data.DimLabel
import ro.bisericalogos.pulsul.nativ.data.Response
import ro.bisericalogos.pulsul.nativ.data.Week
import ro.bisericalogos.pulsul.nativ.data.dashless
import ro.bisericalogos.pulsul.nativ.domain.CategoryRange
import ro.bisericalogos.pulsul.nativ.domain.catsWithData
import ro.bisericalogos.pulsul.nativ.domain.clock
import ro.bisericalogos.pulsul.nativ.domain.dayStats
import ro.bisericalogos.pulsul.nativ.domain.fixed
import ro.bisericalogos.pulsul.nativ.domain.fmtSize
import ro.bisericalogos.pulsul.nativ.domain.formatDuration
import ro.bisericalogos.pulsul.nativ.domain.formatSlugLong
import ro.bisericalogos.pulsul.nativ.domain.initials
import ro.bisericalogos.pulsul.nativ.domain.parseDuration
import ro.bisericalogos.pulsul.nativ.domain.preacherSlug
import ro.bisericalogos.pulsul.nativ.domain.slidesFor
import ro.bisericalogos.pulsul.nativ.domain.usernameFor
import java.util.Calendar

// Cazuri calculate de mână, după funcțiile JS de pe site (shared.txt, day.html, category.html).
class DomainTest {

    @Test fun formatare() {
        assertEquals("27 septembrie 2026", formatSlugLong("2026-09-27"))
        assertEquals("5:30", formatDuration(330))
        assertEquals("1:05:00", formatDuration(3900))
        assertEquals("0:00", formatDuration(null))
        assertEquals(2100, parseDuration("35"))
        assertEquals(330, parseDuration("5:30"))
        assertEquals(3900, parseDuration("1:05:00"))
        assertNull(parseDuration("5m"))
        assertEquals(0, parseDuration(""))
        assertEquals("11:12", clock("10:00", 4320))
        assertEquals("BO", initials("Beni Oz"))
        assertEquals("BL", initials("BisericaLogos"))
        assertEquals("M", initials("Marius"))
        assertEquals("beni-oz", preacherSlug("Beni Oz"))
        assertEquals("beni-i", preacherSlug("Beni I"))
        assertEquals("stefan.tanase", usernameFor("Ștefan Tănase"))
        assertEquals("3 KB", fmtSize(3000))
        assertEquals("1.5 MB", fmtSize(1572864))
        assertEquals("2 MB", fmtSize(2097152))
    }

    @Test fun toFixedCaPeSite() {
        // 1.005 e în binar 1.00499…, deci toFixed(2) dă „1.00", nu „1.01"
        assertEquals("1.00", fixed(1.005))
        assertEquals("4.25", fixed(4.25))
        assertEquals("3.67", fixed(11.0 / 3))
        assertEquals("0", fixed(0.2, 0))
    }

    @Test fun mesajeFaraLinii() {
        assertEquals("Link invalid. Trebuie să înceapă cu https://", dashless("Link invalid — trebuie să înceapă cu https://"))
    }

    private val dims = listOf(DimLabel("q1", "Primire"), DimLabel("q2", "Închinare"), DimLabel("q5", "Predică"))
    private fun resp(vararg a: Pair<String, Answer>) = Response("12:00", "", "", mapOf(*a))

    @Test fun statisticileZilei() {
        val items = listOf(
            resp("q1" to Answer(5, ""), "q2" to Answer(3, "ok"), "q5" to Answer(null, "")),
            resp("q1" to Answer(4, ""), "q2" to Answer(null, "doar text"), "q5" to Answer(5, "")),
        )
        val s = dayStats(items, dims, 4.0)
        assertEquals(17.0 / 4, s.dayAvg!!, 1e-9)
        assertEquals(17.0 / 4 - 4.0, s.delta!!, 1e-9)
        assertEquals("q5", s.best!!.key) // 5.0
        assertEquals("q2", s.worst!!.key) // 3.0
        assertEquals(listOf("q1", "q2", "q5"), catsWithData(items, dims).map { it.key })
        assertEquals(2, slidesFor(items, "q2").size) // al doilea răspuns are doar text
        assertEquals(1, slidesFor(items, "q5").size)
    }

    @Test fun oSinguraCategorieNuEsteSiCeaMaiSlaba() {
        val s = dayStats(listOf(resp("q1" to Answer(4, ""))), dims, null)
        assertEquals("q1", s.best!!.key)
        assertNull(s.worst)
        assertNull(s.delta)
    }

    private fun week(d: String, avg: Double, n: Int = 4): Week {
        // distribuție care dă exact media: n note, suma = avg*n (aici doar note de 3 și 5)
        val fives = ((avg - 3) / 2 * n).toInt()
        return Week(d, d.split(".").reversed().joinToString("-"), n, avg, listOf(0, 0, n - fives, 0, fives))
    }

    private fun ms(y: Int, m: Int, d: Int) = Calendar.getInstance().apply { clear(); set(y, m - 1, d, 12, 0, 0) }.timeInMillis

    @Test fun intervalGolSiTot() {
        val series = listOf(week("06.09.2026", 4.0), week("13.09.2026", 3.0), week("20.09.2026", 5.0))
        val all = CategoryRange.compute(series, "all", null, null, ms(2026, 9, 25))!!
        assertEquals(3, all.weeks.size)
        assertEquals("20.09.2026", all.best.date)
        assertEquals("13.09.2026", all.worst!!.date)
        assertNull(all.prevAgg)
        // interval personalizat fără nicio duminică
        assertNull(CategoryRange.compute(series, "custom", "2025-01-01", "2025-02-01", ms(2026, 9, 25)))
    }

    @Test fun oSinguraSaptamana() {
        val r = CategoryRange.compute(listOf(week("20.09.2026", 4.0)), "all", null, null)!!
        assertEquals("20.09.2026", r.best.date)
        assertNull(r.worst)
        assertEquals(1, r.goodStreak!!.len) // 4.0 >= media generală 4.0
        assertNull(r.badStreak)
    }

    @Test fun intervalDeOLunaSiPeriadaAnterioara() {
        val series = listOf(
            week("09.08.2026", 3.0), week("16.08.2026", 3.0),
            week("30.08.2026", 5.0), week("06.09.2026", 5.0), week("20.09.2026", 5.0),
        )
        // acum = 25 sep 2026 → intervalul începe pe 25 aug; perioada anterioară: 25 iul - 24 aug
        val r = CategoryRange.compute(series, "1", null, null, ms(2026, 9, 25))!!
        assertEquals(listOf("30.08.2026", "06.09.2026", "20.09.2026"), r.weeks.map { it.date })
        assertEquals(3.0, r.prevAgg!!.avg, 1e-9)
        assertEquals(3, r.goodStreak!!.len)
    }

    @Test fun lunaDepasitaCaInJs() {
        // 31 mai minus 3 luni = 3 martie în JS (setMonth), nu 28 februarie
        val series = listOf(week("01.03.2026", 4.0), week("08.03.2026", 4.0))
        val r = CategoryRange.compute(series, "3", null, null, ms(2026, 5, 31))!!
        assertEquals(listOf("08.03.2026"), r.weeks.map { it.date })
    }

    @Test fun deviatiaStandard() {
        assertEquals(1.0, CategoryRange.weekStdDev(listOf(0, 0, 1, 0, 1), 4.0), 1e-9)
        assertEquals(0.0, CategoryRange.weekStdDev(listOf(0, 0, 0, 0, 0), 0.0), 1e-9)
    }
}
