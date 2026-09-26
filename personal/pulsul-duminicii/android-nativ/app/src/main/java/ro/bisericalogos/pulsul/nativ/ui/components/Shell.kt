package ro.bisericalogos.pulsul.nativ.ui.components

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.pulltorefresh.rememberPullToRefreshState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import ro.bisericalogos.pulsul.nativ.PulsulApp
import ro.bisericalogos.pulsul.nativ.data.PageState
import ro.bisericalogos.pulsul.nativ.data.PageVM
import ro.bisericalogos.pulsul.nativ.data.User
import ro.bisericalogos.pulsul.nativ.domain.savedAtLabel
import ro.bisericalogos.pulsul.nativ.ui.theme.body
import ro.bisericalogos.pulsul.nativ.ui.theme.display
import ro.bisericalogos.pulsul.nativ.ui.theme.mix

// ---------------------------------------------------------------- bara de sus (telefon)

@Composable
fun BrandMark(size: Int = 26) {
    Icon(PulsIcons.pulse, null, tint = puls.accent, modifier = Modifier.size(size.dp))
}

@Composable
fun AppTopBar(
    title: String,
    titleVisible: Boolean,
    onBack: (() -> Unit)?,
    user: User?,
    onAccount: () -> Unit,
) {
    val c = puls
    val titleAlpha by animateFloatAsState(if (titleVisible) 1f else 0f, tween(150), label = "titlu")
    Column(
        Modifier.fillMaxWidth().background(c.bg.copy(alpha = .96f))
            .drawBehind { drawLine(c.border, Offset(0f, size.height), Offset(size.width, size.height), 1.dp.toPx()) }
            .statusBarsPadding(),
    ) {
        Row(Modifier.fillMaxWidth().heightIn(min = 56.dp).padding(horizontal = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            if (onBack != null) {
                Box(
                    Modifier.size(44.dp).clip(RoundedCornerShape(12.dp)).clickable(role = Role.Button, onClick = onBack)
                        .semantics { contentDescription = "Înapoi" },
                    contentAlignment = Alignment.Center,
                ) { Icon(PulsIcons.back, null, tint = c.text, modifier = Modifier.size(22.dp)) }
            } else {
                Row(Modifier.heightIn(min = 44.dp).padding(horizontal = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                    BrandMark()
                    if (!titleVisible) {
                        Spacer(Modifier.width(10.dp))
                        Text("PULSUL DUMINICII", style = display(14.sp, 700, c.text).copy(letterSpacing = .28.sp), maxLines = 1)
                    }
                }
            }
            Text(
                title, style = display(16.sp, 700, c.text), maxLines = 1, overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f).padding(horizontal = 4.dp).graphicsLayer { alpha = titleAlpha },
            )
            if (user != null) {
                Box(
                    Modifier.size(44.dp).clip(CircleShape).clickable(role = Role.Button, onClick = onAccount)
                        .semantics { contentDescription = "Contul meu" },
                    contentAlignment = Alignment.Center,
                ) { Avatar(user.shownName) }
            }
        }
    }
}

// ---------------------------------------------------------------- bara de jos, pe roluri

data class Dest(val key: String, val route: String, val label: String)

fun destinations(user: User?): List<Dest> = when {
    user == null -> emptyList()
    user.isPreacher -> listOf(
        Dest("me", "me", "Statistici"),
        Dest("attendance", "attendance", "Prezență"),
        Dest("program", "program", "Program"),
    )
    else -> listOf(
        Dest("home", "home", "Acasă"),
        Dest("days", "days", "Duminici"),
        Dest("categories", "categories", "Categorii"),
        Dest("preachers", "preachers", "Predicatori"),
        Dest("attendance", "attendance", "Prezență"),
        Dest("program", "program", "Program"),
    )
}

@Composable
fun BottomNav(dests: List<Dest>, activeKey: String?, onSelect: (Dest) -> Unit) {
    val c = puls
    Row(
        Modifier.fillMaxWidth().background(c.surface.copy(alpha = .97f))
            .drawBehind { drawLine(c.border, Offset(0f, 0f), Offset(size.width, 0f), 1.dp.toPx()) }
            .navigationBarsPadding().padding(horizontal = 6.dp, vertical = 5.dp),
    ) {
        dests.forEach { d ->
            val active = d.key == activeKey
            val color by animateColorAsState(if (active) c.accentMark else c.text3, tween(150), label = "tab")
            val pill by animateColorAsState(if (active) c.accentMark.copy(alpha = .15f) else c.accentMark.copy(alpha = 0f), tween(150), label = "pastila")
            Column(
                Modifier.weight(1f).heightIn(min = 54.dp).clip(RoundedCornerShape(14.dp))
                    .clickable(role = Role.Tab) { onSelect(d) },
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                Box(Modifier.size(width = 56.dp, height = 30.dp).clip(CircleShape).background(pill), contentAlignment = Alignment.Center) {
                    Icon(PulsIcons.get(d.key), null, tint = color, modifier = Modifier.size(23.dp))
                }
                Spacer(Modifier.height(3.dp))
                Text(d.label, style = body(11.sp, 700, color), maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
    }
}

// ---------------------------------------------------------------- benzi de sus

@Composable
fun StaleBanner() {
    val c = puls
    Text(
        "Date posibil neactualizate. Nu am reușit să citim Sheet-ul live la ultima încercare; se arată ultima versiune bună cunoscută.",
        style = body(12.5.sp, 500, c.text2, 18.sp).center(),
        modifier = Modifier.fillMaxWidth().background(mix(c.r1, .16f, c.surface)).padding(horizontal = 12.dp, vertical = 7.dp),
    )
}

@Composable
fun OfflineBanner(savedAt: Long?, online: Boolean) {
    val c = puls
    val text = when {
        savedAt == null -> "Ești offline. Vezi ultima versiune încărcată. Modificările nu se pot salva până revine conexiunea."
        online -> "Conexiune slabă. Versiunea salvată ${savedAtLabel(savedAt)}. Trage în jos pentru cea nouă."
        else -> "Offline. Versiunea salvată ${savedAtLabel(savedAt)}. Modificările nu se pot salva până revine conexiunea."
    }
    Text(
        text, style = body(12.5.sp, 600, c.text, 18.sp).center(),
        modifier = Modifier.fillMaxWidth().background(mix(c.accent2Mark, .14f, c.surface)).padding(horizontal = 14.dp, vertical = 8.dp),
    )
}

// ---------------------------------------------------------------- tragere în jos = reîncarcă

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PulseRefresh(refreshing: Boolean, onRefresh: () -> Unit, modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    val c = puls
    val state = rememberPullToRefreshState()
    val density = LocalDensity.current
    PullToRefreshBox(
        isRefreshing = refreshing, onRefresh = onRefresh, state = state, modifier = modifier,
        indicator = {
            val f = if (refreshing) 1f else state.distanceFraction
            val armed = f >= 1f
            val beat by animateFloatAsState(if (refreshing) 1.15f else 1f, tween(350), label = "puls")
            Box(
                Modifier.align(Alignment.TopCenter)
                    .graphicsLayer {
                        translationY = with(density) { (f.coerceAtMost(1.4f) * 64.dp.toPx()) - 44.dp.toPx() }
                        alpha = (f * 1.2f).coerceIn(0f, 1f)
                        scaleX = beat; scaleY = beat
                    }
                    .size(38.dp).shadow(6.dp, CircleShape).clip(CircleShape).background(c.surface)
                    .border(1.dp, if (armed) c.accentMark else c.border, CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Icon(PulsIcons.pulse, "Reîncarcă", tint = if (armed) c.accentMark else c.text3, modifier = Modifier.size(20.dp))
            }
        },
    ) { content() }
}

// ---------------------------------------------------------------- pagina: încărcare, eroare, conținut

class PageChrome(val listState: LazyListState)

@Composable
fun <T> PageFrame(
    vm: PageVM<T>,
    title: String,
    onBack: (() -> Unit)?,
    onAccount: () -> Unit,
    skeleton: @Composable () -> Unit,
    listState: LazyListState = rememberLazyListState(),
    stale: (T) -> Boolean = { false },
    overlay: @Composable (T, User) -> Unit = { _, _ -> },
    content: LazyListScope.(T, User) -> Unit,
) {
    val c = puls
    val g = PulsulApp.graph
    val online by g.online.collectAsState()
    val sessionUser by g.session.user.collectAsState()
    val tips = LocalTips.current
    LaunchedEffect(Unit) { vm.onResume() }
    LaunchedEffect(listState.isScrollInProgress) { if (listState.isScrollInProgress) tips.hide() }
    val titleVisible by remember { derivedStateOf { listState.firstVisibleItemIndex > 0 || listState.firstVisibleItemScrollOffset > 150 } }

    Column(Modifier.fillMaxSize().background(c.bg)) {
        AppTopBar(title, titleVisible, onBack, sessionUser, onAccount)
        when (val s = vm.state) {
            PageState.Loading -> Column(Modifier.fillMaxSize()) { skeleton() }
            is PageState.Failed -> PageError(s.message, s.status, onRetry = { vm.refresh() }, onBack = onBack)
            is PageState.Ready -> {
                Box(Modifier.fillMaxSize()) {
                    PulseRefresh(vm.refreshing, { vm.refresh() }, Modifier.fillMaxSize()) {
                        LazyColumn(Modifier.fillMaxSize(), state = listState, contentPadding = PaddingValues(bottom = 40.dp)) {
                            if (s.savedAt != null || !online) item(key = "offline") { OfflineBanner(s.savedAt, online) }
                            if (stale(s.data)) item(key = "stale") { StaleBanner() }
                            content(s.data, s.user)
                        }
                    }
                    overlay(s.data, s.user)
                }
            }
        }
    }
}

@Composable
fun PageError(message: String, status: Int, onRetry: () -> Unit, onBack: (() -> Unit)?) {
    val c = puls
    Column(Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
        Icon(PulsIcons.pulse, null, tint = c.text3, modifier = Modifier.size(34.dp))
        Spacer(Modifier.height(14.dp))
        Text(
            if (status == 404) "Pagina nu mai există" else if (status == 403) "Nu ai acces aici" else "Nu s-a putut încărca",
            style = display(18.sp, 700, c.text).center(),
        )
        Text(message, style = body(14.sp, 400, c.text2, 21.sp).center(), modifier = Modifier.padding(top = 8.dp, bottom = 20.dp))
        if (status == 403 || status == 404) {
            if (onBack != null) PBtn("Înapoi", onBack)
        } else PBtn("Încearcă din nou", onRetry, kind = BtnKind.Primary)
    }
}

// ---------------------------------------------------------------- schelete (forma paginii finale)

@Composable
fun Bone(width: Float = 1f, height: Int = 14, radius: Int = 6, modifier: Modifier = Modifier) {
    Box(modifier.fillMaxWidth(width).height(height.dp).clip(RoundedCornerShape(radius.dp)).background(puls.surface2))
}

@Composable
fun SkeletonCard(height: Int, modifier: Modifier = Modifier) {
    val c = puls
    Box(modifier.fillMaxWidth().height(height.dp).clip(CardShape).background(c.surface).border(1.dp, c.border, CardShape))
}

@Composable
fun ListSkeleton(rows: Int = 6, rowHeight: Int = 64, head: Boolean = true) {
    Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (head) {
            Spacer(Modifier.height(24.dp))
            Bone(.55f, 26, 8)
            Bone(.9f, 13)
            Bone(.7f, 13)
            Spacer(Modifier.height(12.dp))
        }
        repeat(rows) { SkeletonCard(rowHeight) }
    }
}
