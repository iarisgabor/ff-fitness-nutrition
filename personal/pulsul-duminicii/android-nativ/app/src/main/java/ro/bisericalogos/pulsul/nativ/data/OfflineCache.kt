package ro.bisericalogos.pulsul.nativ.data

import android.content.Context
import java.io.File
import java.security.MessageDigest

// Copia ultimei încărcări a fiecărei pagini, pentru folosire fără semnal. Aceleași reguli ca
// public/sw.js: rețeaua are mereu prioritate; copia se arată DOAR când serverul nu răspunde;
// maximum 40 de pagini; conturile nu se salvează niciodată; totul se șterge la ieșire.
class OfflineCache(context: Context) {
    private val dir = File(context.filesDir, "pagini").apply { mkdirs() }
    private val neverSave = listOf("/admin/")
    private val maxPages = 40

    private fun fileFor(path: String): File {
        val hash = MessageDigest.getInstance("SHA-256").digest(path.toByteArray()).joinToString("") { "%02x".format(it) }
        return File(dir, hash.take(32) + ".json")
    }

    fun save(path: String, body: String) {
        if (neverSave.any { path.startsWith(it) }) return
        runCatching {
            fileFor(path).writeText(body)
            val files = dir.listFiles().orEmpty().sortedByDescending { it.lastModified() }
            files.drop(maxPages).forEach { it.delete() }
        }
    }

    // (conținut, momentul salvării în ms)
    fun read(path: String): Pair<String, Long>? {
        val f = fileFor(path)
        if (!f.exists()) return null
        return runCatching { f.readText() to f.lastModified() }.getOrNull()
    }

    fun clear() {
        dir.listFiles().orEmpty().forEach { it.delete() }
    }
}
