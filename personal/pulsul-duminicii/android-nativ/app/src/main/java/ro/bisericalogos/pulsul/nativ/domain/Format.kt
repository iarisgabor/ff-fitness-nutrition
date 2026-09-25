package ro.bisericalogos.pulsul.nativ.domain

import java.math.BigDecimal
import java.math.RoundingMode
import java.text.Normalizer
import java.util.Calendar

// Funcțiile de formatare din src/shared.txt și din paginile site-ului, 1:1.

val MONTHS_RO = listOf("ian", "feb", "mar", "apr", "mai", "iun", "iul", "aug", "sep", "oct", "noi", "dec")
val MONTHS_RO_FULL = listOf("ianuarie", "februarie", "martie", "aprilie", "mai", "iunie", "iulie", "august", "septembrie", "octombrie", "noiembrie", "decembrie")

data class DMY(val dd: Int, val mm: Int, val yyyy: Int)

// "20.09.2026" -> DMY(20, 9, 2026)
fun parseDMY(d: String): DMY {
    val p = d.split(".").map { it.toIntOrNull() ?: 0 }
    return DMY(p.getOrElse(0) { 0 }, p.getOrElse(1) { 1 }, p.getOrElse(2) { 0 })
}

// "2026-09-20" -> DMY
fun parseSlug(s: String): DMY {
    val p = s.split("-").map { it.toIntOrNull() ?: 0 }
    return DMY(p.getOrElse(2) { 0 }, p.getOrElse(1) { 1 }, p.getOrElse(0) { 0 })
}

fun monthFull(m: Int) = MONTHS_RO_FULL[(m - 1).coerceIn(0, 11)]
fun monthShort(m: Int) = MONTHS_RO[(m - 1).coerceIn(0, 11)]

// "2026-09-27" -> "27 septembrie 2026"
fun formatSlugLong(slug: String): String {
    val d = parseSlug(slug)
    return "${d.dd} ${monthFull(d.mm)} ${d.yyyy}"
}

// "20.09.2026" -> "20 septembrie 2026"
fun fullDateLabel(dmy: String): String {
    val d = parseDMY(dmy)
    return "${d.dd} ${monthFull(d.mm)} ${d.yyyy}"
}

// "2026-09-20" -> "20.09.2026"
fun slugToDots(slug: String) = slug.split("-").reversed().joinToString(".")

fun formatDuration(secIn: Int?): String {
    val sec = maxOf(0, secIn ?: 0)
    val h = sec / 3600
    val m = (sec % 3600) / 60
    val s = sec % 60
    return if (h > 0) "$h:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}"
    else "$m:${s.toString().padStart(2, '0')}"
}

// "35" = 35 de minute, "5:30", "1:05:00"; null = format greșit
fun parseDuration(txt: String): Int? {
    val parts = txt.trim().split(":").map { it.trim() }
    if (parts[0].isEmpty()) return 0
    if (parts.any { !it.matches(Regex("\\d+")) }) return null
    val n = parts.map { it.toInt() }
    return when (n.size) {
        1 -> n[0] * 60
        2 -> n[0] * 60 + n[1]
        3 -> n[0] * 3600 + n[1] * 60 + n[2]
        else -> null
    }
}

fun clock(startHHMM: String?, offsetSec: Int): String {
    val hm = (startHHMM?.takeIf { it.isNotBlank() } ?: "10:00").split(":").map { it.toIntOrNull() ?: 0 }
    val total = Math.round((hm[0] * 3600 + hm.getOrElse(1) { 0 } * 60 + offsetSec) / 60.0).toInt()
    return "${((total / 60) % 24).toString().padStart(2, '0')}:${(total % 60).toString().padStart(2, '0')}"
}

// Number.prototype.toFixed: rotunjire pe valoarea binară exactă, ca pe site
fun fixed(v: Double, digits: Int = 2): String =
    BigDecimal(v).setScale(digits, RoundingMode.HALF_UP).toPlainString()

fun signed(v: Double, digits: Int = 2) = (if (v >= 0) "+" else "") + fixed(v, digits)

fun jsRound(v: Double): Long = Math.round(v)

// "Beni Oz" -> "BO", "BisericaLogos" -> "BL", "Marius" -> "M"
fun initials(name: String): String {
    val words = name.trim().split(Regex("\\s+")).filter { it.isNotEmpty() }
    if (words.size > 1) return (words[0].take(1) + words[1].take(1)).uppercase()
    val w = words.firstOrNull() ?: "?"
    val caps = Regex("[A-ZĂÂÎȘȚ]").find(w.drop(1))?.value.orEmpty()
    return (w.take(1) + caps).uppercase()
}

fun stripDiacritics(s: String): String =
    Normalizer.normalize(s, Normalizer.Form.NFD).replace(Regex("[\\u0300-\\u036f]"), "")

// ca slugify() din admin-accounts.html: "Beni Oz" -> "beni.oz"
fun usernameFor(name: String): String =
    stripDiacritics(name).lowercase().replace(Regex("[^a-z0-9]+"), ".").trim('.')

// ca preacherSlug() din src/preachers.js: "Beni Oz" -> "beni-oz"
fun preacherSlug(name: String): String =
    stripDiacritics(name.lowercase()).trim().replace(Regex("[^a-z0-9]+"), "-").trim('-')

fun fmtSize(b: Long?): String {
    if (b == null || b == 0L) return ""
    if (b < 1024 * 1024) return "${maxOf(1, Math.round(b / 1024.0))} KB"
    return fixed(b / 1024.0 / 1024.0, 1).removeSuffix(".0") + " MB"
}

fun extOf(name: String) = name.substringAfterLast('.', "").take(4).uppercase()

// "azi la 14:05" / "3 sep la 09:12" (savedAtLabel din shared.txt)
fun savedAtLabel(ms: Long): String {
    val c = Calendar.getInstance().apply { timeInMillis = ms }
    val now = Calendar.getInstance()
    val today = c.get(Calendar.YEAR) == now.get(Calendar.YEAR) && c.get(Calendar.DAY_OF_YEAR) == now.get(Calendar.DAY_OF_YEAR)
    val hm = "${c.get(Calendar.HOUR_OF_DAY).toString().padStart(2, '0')}:${c.get(Calendar.MINUTE).toString().padStart(2, '0')}"
    return (if (today) "azi" else "${c.get(Calendar.DAY_OF_MONTH)} ${MONTHS_RO[c.get(Calendar.MONTH)]}") + " la $hm"
}

fun plural(n: Int, one: String, many: String) = if (n == 1) one else many
