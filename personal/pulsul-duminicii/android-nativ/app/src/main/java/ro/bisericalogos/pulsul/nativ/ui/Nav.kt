package ro.bisericalogos.pulsul.nativ.ui

import androidx.compose.runtime.staticCompositionLocalOf
import androidx.navigation.NavHostController

// Rutele oglindesc căile site-ului: /zile/:slug -> day/{slug}, /eu -> me etc.
object Routes {
    const val WELCOME = "welcome"
    const val LOGIN = "login"
    const val HOME = "home"
    const val DAYS = "days"
    const val DAY = "day/{slug}"
    const val CATEGORIES = "categories"
    const val CATEGORY = "category/{key}"
    const val PREACHERS = "preachers"
    const val PREACHER = "preacher/{slug}"
    const val ME = "me"
    const val PROGRAM = "program"
    const val PROGRAM_EDIT = "program/{date}"
    const val ACCOUNTS = "accounts"
    const val PASSWORD = "password"

    val TABS = setOf(HOME, DAYS, CATEGORIES, PREACHERS, ME, PROGRAM)

    fun day(slug: String) = "day/$slug"
    fun category(key: String) = "category/$key"
    fun preacher(slug: String) = "preacher/$slug"
    fun programEdit(date: String) = "program/$date"

    // tab-ul evidențiat în bara de jos pentru o rută (ca `match` din navDestinations)
    fun tabOf(route: String?): String? = when (route) {
        HOME -> "home"
        DAYS, DAY -> "days"
        CATEGORIES, CATEGORY -> "categories"
        PREACHERS, PREACHER -> "preachers"
        ME -> "me"
        PROGRAM, PROGRAM_EDIT -> "program"
        else -> null
    }

    // „adâncimea" pentru direcția tranziției: tab-urile sunt rădăcini (NAV_ROOTS din shared.txt)
    fun depth(route: String?): Int = if (route in TABS || route == ACCOUNTS || route == PASSWORD) 1 else 2
}

class Nav(
    private val controller: NavHostController,
    val openAccount: () -> Unit,
) {
    fun to(route: String) = controller.navigate(route) { launchSingleTop = true }

    // înlocuiește pagina curentă (ex. săgețile ← → între duminici), fără să lungească stiva
    fun replace(route: String) {
        val current = controller.currentBackStackEntry?.destination?.route
        controller.navigate(route) {
            if (current != null) popUpTo(current) { inclusive = true }
            launchSingleTop = true
        }
    }

    fun back() {
        if (!controller.popBackStack()) controller.navigate(Routes.HOME)
    }

    fun tab(route: String) = controller.navigate(route) {
        popUpTo(controller.graph.startDestinationId) { saveState = true }
        launchSingleTop = true
        restoreState = true
    }

    // după login / la ieșire: stiva de navigare pornește de la zero
    fun reset(route: String) = controller.navigate(route) {
        popUpTo(0) { inclusive = true }
        launchSingleTop = true
    }
}

val LocalNav = staticCompositionLocalOf<Nav> { error("Nav lipsește") }
