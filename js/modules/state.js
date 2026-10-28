/**
 * NKMM Baza Gier - Centralny stan aplikacji i stałe konfiguracyjne
 */

// Klucze pamięci sesyjnej i lokalnej
const CACHE_KEYS = {
    USERS: "nkmm_cache_users",
    GAMES_PREFIX: "nkmm_cache_games_",
    SETTINGS: "nkmm_cache_settings",
    SHOWCASE_PREFIX: "nkmm_showcase_",
    SYNC_QUEUE: "nkmm_sync_queue",
    ADMIN_AUTH: "nkmm_admin_auth"
};

function getUserAvatarPath(userOrSheet) {
    if (!userOrSheet) return "assets/icon.jpg";
    const sheetName = typeof userOrSheet === "string" ? userOrSheet.trim() : (userOrSheet.sheetName || userOrSheet.name || "").trim();
    if (!sheetName) return "assets/icon.jpg";
    return `assets/${sheetName}.PNG`;
}

// Stan aplikacji
const state = {
    currentScreen: "welcome", // "welcome" | "dashboard"
    currentTab: "tabViewGames", // "tabViewGames" | "tabViewCharts"
    currentUser: null,
    users: [
        { code: "MM", name: "Baza gier MM", sheetName: "Baza gier MM", avatar: "assets/Baza gier MM.PNG", color: "#13a71f", hoverColor: "#0f8518" },
        { code: "NK", name: "Baza gier NK", sheetName: "Baza gier NK", avatar: "assets/Baza gier NK.PNG", color: "#A81214", hoverColor: "#860e10" }
    ],
    games: [],
    // Pamięć podręczna w ramach sesji
    cache: {
        games: {},
        settings: null,
        users: null
    },
    // Kolejka synchronizacji zadań w tle
    syncQueue: [],
    isSyncing: false,
    settings: {
        stan: { headers: [], rows: [] },
        kolekcje: { headers: [], rows: [] },
        platformy: { headers: [], rows: [] },
        liczbaOcen: { headers: [], rows: [] },
        sredniaOcen: { headers: [], rows: [] },
        ukonczoneMiesiecznie: { headers: [], rows: [] }
    },
    isAdmin: false,
    adminPassword: "",
    filters: {
        search: "",
        statuses: new Set(),
        platforms: new Set(),
        collections: new Set(),
        sort: "updated_desc",
        group: "none"
    },
    pagination: {
        currentPage: 1,
        totalPages: 1
    }
};
