package ro.bisericalogos.pulsul.nativ.ui.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import ro.bisericalogos.pulsul.nativ.ui.theme.body
import ro.bisericalogos.pulsul.nativ.ui.theme.caps

data class Cell(val text: String, val color: Color? = null, val bold: Boolean = false)

// table.data-table pe telefon: se derulează orizontal, prima coloană rămâne pe loc.
@Composable
fun DataTable(headers: List<String>, rows: List<List<Cell>>, firstColWidth: Dp = 130.dp, colWidth: Dp = 76.dp) {
    val c = puls
    val rowH = 40.dp
    val headH = 46.dp // antetele lungi („Restul duminicilor") trec pe două rânduri, nu se taie
    fun Modifier.line() = drawBehind { drawLine(c.border, Offset(0f, size.height), Offset(size.width, size.height), 1.dp.toPx()) }

    @Composable
    fun cell(cell: Cell, width: Dp, head: Boolean) {
        Box(Modifier.width(width).height(if (head) headH else rowH).line().padding(horizontal = 12.dp), contentAlignment = Alignment.CenterStart) {
            if (head) Text(cell.text.uppercase(), style = caps(11.5.sp, c.text3, .04f).copy(lineHeight = 14.sp), maxLines = 2, overflow = TextOverflow.Ellipsis)
            else Text(
                cell.text, maxLines = 1, overflow = TextOverflow.Ellipsis,
                style = body(12.5.sp, if (cell.bold) 700 else 400, cell.color ?: c.text).copy(fontFeatureSettings = "tnum"),
            )
        }
    }

    Row(Modifier.fillMaxWidth()) {
        Column(Modifier.background(c.surface).drawBehind {
            drawLine(c.border, Offset(size.width, 0f), Offset(size.width, size.height), 1.dp.toPx())
        }) {
            cell(Cell(headers.first()), firstColWidth, head = true)
            rows.forEach { cell(it.first(), firstColWidth, head = false) }
        }
        Column(Modifier.horizontalScroll(rememberScrollState())) {
            Row { headers.drop(1).forEach { cell(Cell(it), colWidth, head = true) } }
            rows.forEach { r -> Row { r.drop(1).forEach { cell(it, colWidth, head = false) } } }
        }
    }
}

// <details class="table-toggle">: „▸ Vezi toate cifrele ca tabel"
@Composable
fun Disclosure(label: String, modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    val c = puls
    var open by rememberSaveable { mutableStateOf(false) }
    val rot by animateFloatAsState(if (open) 90f else 0f, tween(150), label = "sageata")
    Column(modifier.fillMaxWidth()) {
        Row(
            Modifier.heightIn(min = 44.dp).clickable(role = Role.Button) { open = !open },
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("▸", style = body(11.sp, 600, c.text2), modifier = Modifier.graphicsLayer { rotationZ = rot }.padding(end = 6.dp))
            Text(label, style = body(13.sp, 600, c.text2))
        }
        AnimatedVisibility(open, enter = expandVertically(tween(180)) + fadeIn(tween(180)), exit = shrinkVertically(tween(150)) + fadeOut(tween(150))) {
            Box(Modifier.padding(top = 10.dp)) { content() }
        }
    }
}
