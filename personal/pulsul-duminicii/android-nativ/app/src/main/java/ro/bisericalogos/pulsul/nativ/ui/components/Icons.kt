package ro.bisericalogos.pulsul.nativ.ui.components

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.unit.dp

// Iconițele site-ului: aceleași path-uri ca ICONS din src/shared.txt (contur, grilă 24,
// grosime 1.9, capete rotunjite). <rect>/<circle> din SVG sunt rescrise ca arce echivalente.
private val SITE = mapOf(
    "home" to "M3.5 10.2 12 3.5l8.5 6.7v9.3a1 1 0 0 1-1 1H15v-6H9v6H4.5a1 1 0 0 1-1-1z",
    "days" to "M6 5h12a2.5 2.5 0 0 1 2.5 2.5v10.5a2.5 2.5 0 0 1-2.5 2.5H6a2.5 2.5 0 0 1-2.5-2.5V7.5A2.5 2.5 0 0 1 6 5zM3.5 9.5h17M8 3v4M16 3v4",
    "categories" to "M5 20v-6M12 20V5M19 20v-10",
    "preachers" to "M9 6a3 3 0 0 1 6 0v5a3 3 0 0 1-6 0zM5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21",
    "program" to "M9.5 6.5h10M9.5 12h10M9.5 17.5h10M3.9 6.5a1.1 1.1 0 1 0 2.2 0a1.1 1.1 0 1 0-2.2 0zM3.9 12a1.1 1.1 0 1 0 2.2 0a1.1 1.1 0 1 0-2.2 0zM3.9 17.5a1.1 1.1 0 1 0 2.2 0a1.1 1.1 0 1 0-2.2 0z",
    "me" to "M2.5 12h4.5l2.8-7.5 4.4 15 2.8-7.5h4.5",
    "moon" to "M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z",
    "key" to "M3.5 15a4.5 4.5 0 1 0 9 0a4.5 4.5 0 1 0-9 0zM11.2 11.8 20 3M16.5 6.5l2.5 2.5M14.5 8.5l2 2",
    "users" to "M5.5 8a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0-7 0zM2.5 20a6.5 6.5 0 0 1 13 0M16 4.8a3.5 3.5 0 0 1 0 6.4M18 14.2A6.5 6.5 0 0 1 21.5 20",
    "logout" to "M14 4h4.5a1.5 1.5 0 0 1 1.5 1.5v13a1.5 1.5 0 0 1-1.5 1.5H14M9 16l-4-4 4-4M5 12h10",
    "eye" to "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM9 12a3 3 0 1 0 6 0a3 3 0 1 0-6 0z",
)

// Iconițe noi, doar din Phosphor (regular), SVG-urile oficiale din phosphor-icons/core.
private val PHOSPHOR = mapOf(
    "sparkle" to "M197.58,129.06,146,110l-19-51.62a15.92,15.92,0,0,0-29.88,0L78,110l-51.62,19a15.92,15.92,0,0,0,0,29.88L78,178l19,51.62a15.92,15.92,0,0,0,29.88,0L146,178l51.62-19a15.92,15.92,0,0,0,0-29.88ZM137,164.22a8,8,0,0,0-4.74,4.74L112,223.85,91.78,169A8,8,0,0,0,87,164.22L32.15,144,87,123.78A8,8,0,0,0,91.78,119L112,64.15,132.22,119a8,8,0,0,0,4.74,4.74L191.85,144ZM144,40a8,8,0,0,1,8-8h16V16a8,8,0,0,1,16,0V32h16a8,8,0,0,1,0,16H184V64a8,8,0,0,1-16,0V48H152A8,8,0,0,1,144,40ZM248,88a8,8,0,0,1-8,8h-8v8a8,8,0,0,1-16,0V96h-8a8,8,0,0,1,0-16h8V72a8,8,0,0,1,16,0v8h8A8,8,0,0,1,248,88Z",
    "link" to "M165.66,90.34a8,8,0,0,1,0,11.32l-64,64a8,8,0,0,1-11.32-11.32l64-64A8,8,0,0,1,165.66,90.34ZM215.6,40.4a56,56,0,0,0-79.2,0L106.34,70.45a8,8,0,0,0,11.32,11.32l30.06-30a40,40,0,0,1,56.57,56.56l-30.07,30.06a8,8,0,0,0,11.31,11.32L215.6,119.6a56,56,0,0,0,0-79.2ZM138.34,174.22l-30.06,30.06a40,40,0,1,1-56.56-56.57l30.05-30.05a8,8,0,0,0-11.32-11.32L40.4,136.4a56,56,0,0,0,79.2,79.2l30.06-30.07a8,8,0,0,0-11.32-11.31Z",
    "upload" to "M224,144v64a8,8,0,0,1-8,8H40a8,8,0,0,1-8-8V144a8,8,0,0,1,16,0v56H208V144a8,8,0,0,1,16,0ZM93.66,77.66,120,51.31V144a8,8,0,0,0,16,0V51.31l26.34,26.35a8,8,0,0,0,11.32-11.32l-40-40a8,8,0,0,0-11.32,0l-40,40A8,8,0,0,0,93.66,77.66Z",
    "clip" to "M209.66,122.34a8,8,0,0,1,0,11.32l-82.05,82a56,56,0,0,1-79.2-79.21L147.67,35.73a40,40,0,1,1,56.61,56.55L105,193A24,24,0,1,1,71,159L154.3,74.38A8,8,0,1,1,165.7,85.6L82.39,170.31a8,8,0,1,0,11.27,11.36L192.93,81A24,24,0,1,0,159,47L59.76,147.68a40,40,0,1,0,56.53,56.62l82.06-82A8,8,0,0,1,209.66,122.34Z",
    "plus" to "M224,128a8,8,0,0,1-8,8H136v80a8,8,0,0,1-16,0V136H40a8,8,0,0,1,0-16h80V40a8,8,0,0,1,16,0v80h80A8,8,0,0,1,224,128Z",
    "open" to "M224,104a8,8,0,0,1-16,0V59.32l-66.33,66.34a8,8,0,0,1-11.32-11.32L196.68,48H152a8,8,0,0,1,0-16h64a8,8,0,0,1,8,8Zm-40,24a8,8,0,0,0-8,8v72H48V80h72a8,8,0,0,0,0-16H48A16,16,0,0,0,32,80V208a16,16,0,0,0,16,16H176a16,16,0,0,0,16-16V136A8,8,0,0,0,184,128Z",
)

private val cache = HashMap<String, ImageVector>()

object PulsIcons {
    fun get(name: String, strokeWidth: Float = 1.9f): ImageVector = cache.getOrPut("$name@$strokeWidth") {
        SITE[name]?.let { stroked(name, it, 24f, strokeWidth) }
            ?: PHOSPHOR[name]?.let { filled(name, it) }
            ?: error("iconiță necunoscută: $name")
    }

    val back: ImageVector get() = cache.getOrPut("back") { stroked("back", "M15 5l-7 7 7 7", 24f, 2.2f) }

    // logo-ul: linia de puls, 26×26, grosime 2 (ca .brand-mark)
    val pulse: ImageVector get() = cache.getOrPut("pulse") { stroked("pulse", PULSE_PATH, 26f, 2f) }

    private fun stroked(name: String, d: String, box: Float, w: Float) =
        ImageVector.Builder(name, 24.dp, 24.dp, box, box).addPath(
            pathData = PathParser().parsePathString(d).toNodes(),
            fill = null, stroke = SolidColor(Color.Black), strokeLineWidth = w,
            strokeLineCap = StrokeCap.Round, strokeLineJoin = StrokeJoin.Round,
        ).build()

    private fun filled(name: String, d: String) =
        ImageVector.Builder(name, 24.dp, 24.dp, 256f, 256f).addPath(
            pathData = PathParser().parsePathString(d).toNodes(), fill = SolidColor(Color.Black),
        ).build()
}

const val PULSE_PATH = "M1 13H7L10 4L16 22L19 13H25"
