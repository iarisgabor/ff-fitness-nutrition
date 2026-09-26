package ro.bisericalogos.pulsul.nativ.ui

import android.graphics.Color as AndroidColor
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.compose.animation.AnimatedContentTransitionScope
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.foundation.background
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavBackStackEntry
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import kotlinx.coroutines.launch
import ro.bisericalogos.pulsul.nativ.PulsulApp
import ro.bisericalogos.pulsul.nativ.data.User
import ro.bisericalogos.pulsul.nativ.ui.components.Avatar
import ro.bisericalogos.pulsul.nativ.ui.components.BottomNav
import ro.bisericalogos.pulsul.nativ.ui.components.DialogHost
import ro.bisericalogos.pulsul.nativ.ui.components.Dialogs
import ro.bisericalogos.pulsul.nativ.ui.components.LocalDialogs
import ro.bisericalogos.pulsul.nativ.ui.components.LocalTips
import ro.bisericalogos.pulsul.nativ.ui.components.PulsIcons
import ro.bisericalogos.pulsul.nativ.ui.components.PulsSheet
import ro.bisericalogos.pulsul.nativ.ui.components.PulsSwitch
import ro.bisericalogos.pulsul.nativ.ui.components.SheetRow
import ro.bisericalogos.pulsul.nativ.ui.components.TipHost
import ro.bisericalogos.pulsul.nativ.ui.components.TipState
import ro.bisericalogos.pulsul.nativ.ui.components.ToastHost
import ro.bisericalogos.pulsul.nativ.ui.components.destinations
import ro.bisericalogos.pulsul.nativ.ui.components.dismissTipsOnTouch
import ro.bisericalogos.pulsul.nativ.ui.components.puls
import ro.bisericalogos.pulsul.nativ.ui.screens.AccountsScreen
import ro.bisericalogos.pulsul.nativ.ui.screens.AttendanceScreen
import ro.bisericalogos.pulsul.nativ.ui.screens.CategoriesScreen
import ro.bisericalogos.pulsul.nativ.ui.screens.CategoryScreen
import ro.bisericalogos.pulsul.nativ.ui.screens.DayScreen
import ro.bisericalogos.pulsul.nativ.ui.screens.DaysScreen
import ro.bisericalogos.pulsul.nativ.ui.screens.HomeScreen
import ro.bisericalogos.pulsul.nativ.ui.screens.LoginScreen
import ro.bisericalogos.pulsul.nativ.ui.screens.PasswordScreen
import ro.bisericalogos.pulsul.nativ.ui.screens.PreacherScreen
import ro.bisericalogos.pulsul.nativ.ui.screens.PreachersScreen
import ro.bisericalogos.pulsul.nativ.ui.screens.ProgramEditScreen
import ro.bisericalogos.pulsul.nativ.ui.screens.ProgramListScreen
import ro.bisericalogos.pulsul.nativ.ui.screens.WelcomeScreen
import ro.bisericalogos.pulsul.nativ.ui.theme.PulsTheme
import ro.bisericalogos.pulsul.nativ.ui.theme.body

// Tranziții ca pe site (shared.css): spre o pagină mai adâncă glisează din dreapta, înapoi
// spre dreapta, între tab-uri doar estompare. Animațiile oprite din sistem le fac instante.
private val easeIn = CubicBezierEasing(.2f, .8f, .2f, 1f)
private val easeOut = CubicBezierEasing(.3f, .7f, .3f, 1f)

private fun AnimatedContentTransitionScope<NavBackStackEntry>.direction(): Int =
    Routes.depth(targetState.destination.route).compareTo(Routes.depth(initialState.destination.route))

private fun AnimatedContentTransitionScope<NavBackStackEntry>.enter(): EnterTransition = when (direction()) {
    1 -> slideInHorizontally(tween(280, easing = easeIn)) { (it * .32f).toInt() } + fadeIn(tween(280, easing = easeIn))
    -1 -> slideInHorizontally(tween(280, easing = easeIn)) { -(it * .12f).toInt() } + fadeIn(tween(280, easing = easeIn))
    else -> fadeIn(tween(140))
}

private fun AnimatedContentTransitionScope<NavBackStackEntry>.exit(): ExitTransition = when (direction()) {
    1 -> slideOutHorizontally(tween(240, easing = easeOut)) { -(it * .12f).toInt() } + fadeOut(tween(240, easing = easeOut))
    -1 -> slideOutHorizontally(tween(240, easing = easeOut)) { (it * .32f).toInt() } + fadeOut(tween(240, easing = easeOut))
    else -> fadeOut(tween(140))
}

@Composable
fun AppRoot() {
    val g = PulsulApp.graph
    val themePref by g.session.theme.collectAsState()
    val dark = when (themePref) { "dark" -> true; "light" -> false; else -> isSystemInDarkTheme() }
    val activity = LocalContext.current as ComponentActivity
    LaunchedEffect(dark) {
        // pictogramele barei de stare urmează tema aleasă, nu doar pe a sistemului
        val style = if (dark) SystemBarStyle.dark(AndroidColor.TRANSPARENT) else SystemBarStyle.light(AndroidColor.TRANSPARENT, AndroidColor.TRANSPARENT)
        activity.enableEdgeToEdge(statusBarStyle = style, navigationBarStyle = style)
    }

    PulsTheme(dark) {
        val c = puls
        val controller = rememberNavController()
        val user by g.session.user.collectAsState()
        var accountOpen by remember { mutableStateOf(false) }
        val nav = remember(controller) { Nav(controller) { accountOpen = true } }
        val dialogs = remember { Dialogs() }
        val tips = remember { TipState() }
        val scope = rememberCoroutineScope()
        val start = remember {
            val u = g.session.user.value
            when {
                u != null -> if (u.isPreacher) Routes.ME else Routes.HOME
                !g.session.welcomeSeen -> Routes.WELCOME
                else -> Routes.LOGIN
            }
        }
        LaunchedEffect(Unit) {
            g.expired.collect {
                accountOpen = false
                nav.reset(Routes.LOGIN)
                g.toast("Sesiunea a expirat. Autentifică-te din nou.", error = true)
            }
        }
        val entry by controller.currentBackStackEntryAsState()
        val route = entry?.destination?.route
        val showNav = user != null && route != null && route != Routes.WELCOME && route != Routes.LOGIN
        val navBarInset = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()

        CompositionLocalProvider(LocalNav provides nav, LocalDialogs provides dialogs, LocalTips provides tips) {
            Box(Modifier.fillMaxSize().background(c.bg).dismissTipsOnTouch(tips)) {
                Column(Modifier.fillMaxSize()) {
                    NavHost(
                        controller, startDestination = start, modifier = Modifier.weight(1f),
                        enterTransition = { enter() }, exitTransition = { exit() },
                        popEnterTransition = { enter() }, popExitTransition = { exit() },
                    ) {
                        composable(Routes.WELCOME) { WelcomeScreen { g.session.welcomeSeen = true; nav.reset(Routes.LOGIN) } }
                        composable(Routes.LOGIN) { LoginScreen { next -> nav.reset(next) } }
                        composable(Routes.HOME) { HomeScreen() }
                        composable(Routes.DAYS) { DaysScreen() }
                        composable(Routes.DAY) { DayScreen(it.arguments?.getString("slug").orEmpty()) }
                        composable(Routes.CATEGORIES) { CategoriesScreen() }
                        composable(Routes.CATEGORY) { CategoryScreen(it.arguments?.getString("key").orEmpty()) }
                        composable(Routes.PREACHERS) { PreachersScreen() }
                        composable(Routes.PREACHER) { PreacherScreen(it.arguments?.getString("slug").orEmpty()) }
                        composable(Routes.ME) { PreacherScreen(null) }
                        composable(Routes.ATTENDANCE) { AttendanceScreen() }
                        composable(Routes.PROGRAM) { ProgramListScreen() }
                        composable(Routes.PROGRAM_EDIT) { ProgramEditScreen(it.arguments?.getString("date").orEmpty()) }
                        composable(Routes.ACCOUNTS) { AccountsScreen() }
                        composable(Routes.PASSWORD) { PasswordScreen(onBack = nav::back, onAccount = nav.openAccount) }
                    }
                    if (showNav) BottomNav(destinations(user), Routes.tabOf(route)) { d -> nav.tab(d.route) }
                }
                ToastHost(bottom = navBarInset + if (showNav) 78.dp else 24.dp)
                TipHost(tips)
                DialogHost(dialogs)
                val u = user
                if (accountOpen && u != null) {
                    AccountSheet(
                        u, dark,
                        onDismiss = { accountOpen = false },
                        onTheme = { g.session.setTheme(if (dark) "light" else "dark") },
                        onPassword = { accountOpen = false; nav.to(Routes.PASSWORD) },
                        onAccounts = { accountOpen = false; nav.to(Routes.ACCOUNTS) },
                        onLogout = {
                            accountOpen = false
                            scope.launch {
                                g.logout()
                                nav.reset(Routes.LOGIN)
                            }
                        },
                    )
                }
            }
        }
    }
}

// Panoul de cont (openAccountSheet din shared.txt): tema, parola sau conturile, ieșirea.
@Composable
private fun AccountSheet(
    user: User, dark: Boolean,
    onDismiss: () -> Unit, onTheme: () -> Unit, onPassword: () -> Unit, onAccounts: () -> Unit, onLogout: () -> Unit,
) {
    val c = puls
    PulsSheet(onDismiss = onDismiss) { sheet ->
        Row(
            Modifier.fillMaxWidth().padding(start = 4.dp, end = 4.dp, top = 2.dp, bottom = 16.dp)
                .drawBehind { drawLine(c.border, Offset(0f, size.height + 6.dp.toPx()), Offset(size.width, size.height + 6.dp.toPx()), 1.dp.toPx()) },
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Avatar(user.shownName, large = true)
            Column(Modifier.padding(start = 14.dp)) {
                Text(user.shownName, style = body(16.sp, 700, c.text))
                Text(if (user.isPreacher) "predicator" else if (user.legacy) "acces fără cont" else "cont general", style = body(12.5.sp, 600, c.text3))
            }
        }
        Column(Modifier.padding(top = 12.dp)) {
            SheetRow("Temă întunecată", onTheme, icon = PulsIcons.get("moon", 1.8f), trailing = { PulsSwitch(dark) })
            if (user.isPreacher) SheetRow("Schimbă parola", { sheet.close(); onPassword() }, icon = PulsIcons.get("key", 1.8f), chevron = true)
            if (user.isAdmin && !user.legacy) SheetRow("Conturi predicatori", { sheet.close(); onAccounts() }, icon = PulsIcons.get("users", 1.8f), chevron = true)
            if (!user.legacy) SheetRow("Ieșire", { sheet.close(); onLogout() }, icon = PulsIcons.get("logout", 1.8f), danger = true)
        }
    }
}
