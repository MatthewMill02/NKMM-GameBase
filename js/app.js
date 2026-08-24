/**
 * NKMM Baza Gier - Główny skrypt aplikacji (ES6+)
 * Wytyczne: Czysty JavaScript, brak emotek, optymalizacja mobilna,
 * optymistyczna synchronizacja w tle (Optimistic UI) z kolejką zadań,
 * belka profilu ze statystykami i edytowalną gablotą gier (w stylu Steam),
 * 2 główne zakładki: Baza gier oraz Wykresy.
 */

// Adres wdrożonej aplikacji Google Apps Script
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwMoziDDLE2_1OcBPpwt4kNhF1jLmbPkumknpOmAeAgsJ5W_Vud6V12WrLjbOrJo43e/exec";

// Klucze pamięci sesyjnej i lokalnej
const CACHE_KEYS = {
    USERS: "nkmm_cache_users",
    GAMES_PREFIX: "nkmm_cache_games_",
    SETTINGS: "nkmm_cache_settings",
    SHOWCASE_PREFIX: "nkmm_showcase_"
};

// Stan aplikacji
const state = {
    currentScreen: "welcome", // "welcome" | "dashboard"
    currentTab: "tabViewGames", // "tabViewGames" | "tabViewCharts"
    currentUser: null,
    users: [
        { code: "MM", name: "MatthewMill (MM)", sheetName: "Baza gier MM", avatar: "assets/matthewmill.PNG", color: "#13a71f", hoverColor: "#0f8518" },
        { code: "NK", name: "R4sheg (NK)", sheetName: "Baza gier NK", avatar: "assets/rasheg.PNG", color: "#A81214", hoverColor: "#860e10" }
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
        sort: "title_asc"
    }
};

// ===================================================
// INICJALIZACJA APLIKACJI
// ===================================================

document.addEventListener("DOMContentLoaded", () => {
    initEvents();
    initSessionCache();
    showWelcomeScreen();
});

function initEvents() {
    // Nawigacja
    document.getElementById("btnNavHome").addEventListener("click", showWelcomeScreen);
    document.getElementById("footerHomeLink").addEventListener("click", (e) => {
        e.preventDefault();
        showWelcomeScreen();
    });

    // Przycisk wymuszonego odświeżenia danych
    document.getElementById("btnRefreshData").addEventListener("click", handleForceRefreshAll);

    // Rozwijane menu profili w nagłówku
    const profileBtn = document.getElementById("activeProfileBtn");
    const profileMenu = document.getElementById("profileDropdownMenu");

    profileBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const isOpen = profileMenu.style.display === "block";
        profileMenu.style.display = isOpen ? "none" : "block";
    });

    // Panel kolejki synchronizacji
    const syncStatusBtn = document.getElementById("btnSyncStatus");
    const syncQueuePanel = document.getElementById("syncQueuePanel");

    syncStatusBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const isOpen = syncQueuePanel.style.display === "block";
        syncQueuePanel.style.display = isOpen ? "none" : "block";
    });

    // Filtry - rozwijane checklisty
    setupFilterDropdown("btnFilterStatus", "menuFilterStatus");
    setupFilterDropdown("btnFilterPlatform", "menuFilterPlatform");
    setupFilterDropdown("btnFilterCollection", "menuFilterCollection");

    // Zamykanie rozwijanych menu po kliknięciu poza nimi
    document.addEventListener("click", (e) => {
        if (!e.target.closest(".profile-dropdown-wrapper")) {
            profileMenu.style.display = "none";
        }
        if (!e.target.closest(".sync-status-wrapper")) {
            syncQueuePanel.style.display = "none";
        }
        if (!e.target.closest(".filter-dropdown-wrapper")) {
            closeAllFilterDropdowns();
        }
    });

    // GŁÓWNE ZAKŁADKI NAWIGACJI (TABY)
    document.querySelectorAll(".main-tab-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const targetTab = btn.getAttribute("data-target");
            switchMainTab(targetTab);
        });
    });

    // Gablota - edycja
    document.getElementById("btnEditShowcase").addEventListener("click", openShowcaseEditModal);
    document.getElementById("btnSaveShowcase").addEventListener("click", handleSaveShowcase);

    const showcaseSearchInput = document.getElementById("showcaseSearchInput");
    if (showcaseSearchInput) {
        showcaseSearchInput.addEventListener("input", (e) => {
            filterShowcaseChecklist(e.target.value.trim().toLowerCase());
        });
    }

    // Wyszukiwarka i sortowanie w bazie gier
    const searchInput = document.getElementById("searchInput");
    const clearSearchBtn = document.getElementById("btnClearSearch");

    searchInput.addEventListener("input", (e) => {
        state.filters.search = e.target.value.trim().toLowerCase();
        clearSearchBtn.style.display = state.filters.search ? "inline-block" : "none";
        renderGamesGrid();
    });

    clearSearchBtn.addEventListener("click", () => {
        searchInput.value = "";
        state.filters.search = "";
        clearSearchBtn.style.display = "none";
        renderGamesGrid();
    });

    document.getElementById("sortSelect").addEventListener("change", (e) => {
        state.filters.sort = e.target.value;
        renderGamesGrid();
    });

    document.getElementById("btnResetFilters").addEventListener("click", resetFilters);

    // Modale - zamykanie (tylko przyciski w stopce lub kliknięcie w tło)
    document.querySelectorAll("[data-close]").forEach(btn => {
        btn.addEventListener("click", (e) => {
            const modalId = e.currentTarget.getAttribute("data-close");
            closeModal(modalId);
        });
    });

    document.querySelectorAll(".modal-backdrop").forEach(modal => {
        modal.addEventListener("click", (e) => {
            if (e.target === modal) closeModal(modal.id);
        });
    });

    // Administrator
    document.getElementById("btnAdminLoginModal").addEventListener("click", () => openModal("adminLoginModal"));
    document.getElementById("adminLoginForm").addEventListener("submit", handleAdminLogin);
    document.getElementById("btnLogoutAdmin").addEventListener("click", handleAdminLogout);

    // Dodawanie / edycja gry
    document.getElementById("btnOpenAddGameModal").addEventListener("click", () => openGameEditModal(null));
    document.getElementById("gameEditForm").addEventListener("submit", handleGameFormSubmit);

    // Dodawanie użytkownika
    document.getElementById("btnOpenAddUserModal").addEventListener("click", () => openModal("addUserModal"));
    document.getElementById("addUserForm").addEventListener("submit", handleAddUserSubmit);

    // Statystyki / Ustawienia
    document.getElementById("btnToggleStats").addEventListener("click", openStatsModal);
    initStatsTabs();

    // Dodawanie do słowników
    document.getElementById("btnAddStan").addEventListener("click", () => handleAddSetting("Stan", "newStanVal", "newStanDesc"));
    document.getElementById("btnAddKol").addEventListener("click", () => handleAddSetting("Kolekcje", "newKolVal", "newKolDesc"));
    document.getElementById("btnAddPlat").addEventListener("click", () => handleAddSetting("Platformy", "newPlatVal"));

    // Zmiana rozmiaru okna
    window.addEventListener("resize", () => {
        if (state.currentScreen === "welcome") {
            renderWelcomeHeads();
        }
    });
}

// ===================================================
// WARSTWA PAMIĘCI PODRĘCZNEJ SESJI (CACHE)
// ===================================================

function initSessionCache() {
    try {
        const cachedUsers = sessionStorage.getItem(CACHE_KEYS.USERS);
        if (cachedUsers) {
            const parsed = JSON.parse(cachedUsers);
            if (Array.isArray(parsed) && parsed.length > 0) {
                state.users = parsed;
                state.cache.users = parsed;
            }
        }

        const cachedSettings = sessionStorage.getItem(CACHE_KEYS.SETTINGS);
        if (cachedSettings) {
            const parsed = JSON.parse(cachedSettings);
            state.settings = parsed;
            state.cache.settings = parsed;
        }
    } catch (e) {
        console.warn("Błąd odczytu pamięci sesyjnej:", e);
    }
}

function getCachedGames(sheetName) {
    if (state.cache.games[sheetName]) {
        return state.cache.games[sheetName];
    }
    try {
        const stored = sessionStorage.getItem(CACHE_KEYS.GAMES_PREFIX + sheetName);
        if (stored) {
            const parsed = JSON.parse(stored);
            state.cache.games[sheetName] = parsed;
            return parsed;
        }
    } catch (e) {}
    return null;
}

function setCachedGames(sheetName, games) {
    state.cache.games[sheetName] = games;
    try {
        sessionStorage.setItem(CACHE_KEYS.GAMES_PREFIX + sheetName, JSON.stringify(games));
    } catch (e) {}
}

function invalidateGamesCache(sheetName = null) {
    if (sheetName) {
        delete state.cache.games[sheetName];
        try {
            sessionStorage.removeItem(CACHE_KEYS.GAMES_PREFIX + sheetName);
        } catch (e) {}
    } else {
        state.cache.games = {};
        try {
            Object.keys(sessionStorage).forEach(key => {
                if (key.startsWith(CACHE_KEYS.GAMES_PREFIX)) {
                    sessionStorage.removeItem(key);
                }
            });
        } catch (e) {}
    }
}

function invalidateSettingsCache() {
    state.cache.settings = null;
    try {
        sessionStorage.removeItem(CACHE_KEYS.SETTINGS);
    } catch (e) {}
}

function invalidateUsersCache() {
    state.cache.users = null;
    try {
        sessionStorage.removeItem(CACHE_KEYS.USERS);
    } catch (e) {}
}

async function handleForceRefreshAll() {
    const btn = document.getElementById("btnRefreshData");
    btn.disabled = true;
    btn.textContent = "Odświeżanie...";

    invalidateGamesCache();
    invalidateSettingsCache();
    invalidateUsersCache();

    await fetchUsersList(true);
    await fetchSettingsAndStats(true);

    if (state.currentUser) {
        await loadGamesForUser(state.currentUser.sheetName, true);
    }

    btn.disabled = false;
    btn.textContent = "[Odśwież]";
}

// ===================================================
// SYSTEM KOLEJKI SYNCHRONIZACJI W TLE (OPTIMISTIC UI)
// ===================================================

function enqueueSyncTask(title, executeFn, rollbackFn) {
    const task = {
        id: "task_" + Date.now() + "_" + Math.round(Math.random() * 1000),
        title: title,
        executeFn: executeFn,
        rollbackFn: rollbackFn,
        status: "pending",
        errorMsg: "",
        createdAt: new Date()
    };

    state.syncQueue.push(task);
    updateSyncQueueUi();
    processSyncQueue();
}

async function processSyncQueue() {
    if (state.isSyncing) return;

    const pendingTask = state.syncQueue.find(t => t.status === "pending");
    if (!pendingTask) {
        updateSyncQueueUi();
        return;
    }

    state.isSyncing = true;
    pendingTask.status = "in_progress";
    updateSyncQueueUi();

    try {
        const response = await pendingTask.executeFn();

        if (response && response.status === "success") {
            pendingTask.status = "done";
            updateSyncQueueUi();

            setTimeout(() => {
                state.syncQueue = state.syncQueue.filter(t => t.id !== pendingTask.id);
                updateSyncQueueUi();
            }, 4000);
        } else {
            throw new Error((response && response.message) || "Błąd zapisu na serwerze.");
        }
    } catch (err) {
        pendingTask.status = "error";
        pendingTask.errorMsg = err.message;
        updateSyncQueueUi();

        if (typeof pendingTask.rollbackFn === "function") {
            pendingTask.rollbackFn();
        }

        alert(`Błąd synchronizacji w tle:\n"${pendingTask.title}" nie powiodło się.\n\nPowód: ${err.message}`);
    } finally {
        state.isSyncing = false;
        processSyncQueue();
    }
}

function updateSyncQueueUi() {
    const syncStatusImg = document.getElementById("syncStatusImg");
    const syncQueueCount = document.getElementById("syncQueueCount");
    const syncQueueList = document.getElementById("syncQueueList");

    const pendingOrProgressCount = state.syncQueue.filter(t => t.status === "pending" || t.status === "in_progress").length;

    if (pendingOrProgressCount > 0) {
        if (syncStatusImg) syncStatusImg.src = "assets/sync.gif";
    } else {
        if (syncStatusImg) syncStatusImg.src = "assets/sync.png";
    }

    if (syncQueueCount) {
        syncQueueCount.textContent = `${state.syncQueue.length} zadań`;
    }

    if (state.syncQueue.length === 0) {
        if (syncQueueList) syncQueueList.innerHTML = '<p class="queue-empty-msg">Wszystkie zmiany są zsynchronizowane.</p>';
        return;
    }

    if (syncQueueList) {
        syncQueueList.innerHTML = "";
        state.syncQueue.forEach(task => {
            const item = document.createElement("div");
            item.className = "queue-item";

            let statusClass = "queue-status-pending";
            let statusLabel = "W kolejce";

            if (task.status === "in_progress") {
                statusClass = "queue-status-progress";
                statusLabel = "W toku...";
            } else if (task.status === "done") {
                statusClass = "queue-status-done";
                statusLabel = "Zapisano";
            } else if (task.status === "error") {
                statusClass = "queue-status-error";
                statusLabel = "Błąd";
            }

            item.innerHTML = `
                <span class="queue-item-name" title="${escapeHtml(task.title)}">${escapeHtml(task.title)}</span>
                <span class="queue-item-status ${statusClass}">${statusLabel}</span>
            `;

            syncQueueList.appendChild(item);
        });
    }
}

// ===================================================
// EKRAN POWITALNY - WYBÓR PROFILU GRACZA
// ===================================================

function renderWelcomeHeads() {
    const container = document.getElementById("headsScatterContainer");
    const centerBox = document.getElementById("welcomeCenterBox");
    if (!container || !centerBox) return;

    container.innerHTML = "";

    const containerRect = container.getBoundingClientRect();
    const boxRect = centerBox.getBoundingClientRect();

    const headWidth = 100;
    const headHeight = 100;
    const padding = 16;

    const forbiddenZone = {
        left: (boxRect.left - containerRect.left) - 20,
        top: (boxRect.top - containerRect.top) - 20,
        right: (boxRect.right - containerRect.left) + 20,
        bottom: (boxRect.bottom - containerRect.top) + 20
    };

    const placedPositions = [];

    state.users.forEach(user => {
        let attempts = 0;
        let x = 0;
        let y = 0;
        let valid = false;

        while (attempts < 100 && !valid) {
            attempts++;
            const maxX = Math.max(containerRect.width - headWidth - padding, padding);
            const maxY = Math.max(containerRect.height - headHeight - padding, padding);

            x = Math.floor(Math.random() * (maxX - padding)) + padding;
            y = Math.floor(Math.random() * (maxY - padding)) + padding;

            const overlapsCenter = (
                x + headWidth > forbiddenZone.left &&
                x < forbiddenZone.right &&
                y + headHeight > forbiddenZone.top &&
                y < forbiddenZone.bottom
            );

            const overlapsOther = placedPositions.some(pos => {
                return Math.abs(pos.x - x) < (headWidth + 16) && Math.abs(pos.y - y) < (headHeight + 16);
            });

            if (!overlapsCenter && !overlapsOther) {
                valid = true;
            }
        }

        placedPositions.push({ x, y });

        const card = document.createElement("div");
        card.className = "scatter-head-card";
        card.style.left = `${x}px`;
        card.style.top = `${y}px`;
        if (user.color) {
            card.style.borderTopColor = user.color;
        }
        card.setAttribute("title", `Kliknij, aby otworzyć bazę gracza: ${user.name}`);

        card.innerHTML = `
            <img src="${user.avatar}" alt="${user.code}" class="scatter-head-img" onerror="this.src='assets/matthewmill.PNG'">
            <span class="scatter-head-name">${user.name}</span>
        `;

        card.addEventListener("click", () => {
            switchUserProfile(user);
        });

        container.appendChild(card);
    });
}

function applyUserTheme(user) {
    if (user && user.color) {
        document.documentElement.style.setProperty("--color-primary", user.color);
        document.documentElement.style.setProperty("--color-primary-hover", user.hoverColor || user.color);
    } else {
        document.documentElement.style.setProperty("--color-primary", "#2a4365");
        document.documentElement.style.setProperty("--color-primary-hover", "#1e314b");
    }
}

function showWelcomeScreen() {
    state.currentScreen = "welcome";
    applyUserTheme(null);

    document.getElementById("appHeader").style.display = "none";
    document.getElementById("appFooter").style.display = "none";
    document.getElementById("welcomeScreen").style.display = "flex";
    document.getElementById("dashboardScreen").style.display = "none";

    renderWelcomeHeads();
}

function showDashboardScreen() {
    state.currentScreen = "dashboard";

    document.getElementById("appHeader").style.display = "flex";
    document.getElementById("appFooter").style.display = "block";
    document.getElementById("welcomeScreen").style.display = "none";
    document.getElementById("dashboardScreen").style.display = "block";

    switchMainTab(state.currentTab);
}

// ===================================================
// GŁÓWNE ZAKŁADKI NAWIGACJI (TABY)
// ===================================================

function switchMainTab(targetTabId) {
    state.currentTab = targetTabId;

    document.querySelectorAll(".main-tab-btn").forEach(btn => {
        if (btn.getAttribute("data-target") === targetTabId) {
            btn.classList.add("active");
        } else {
            btn.classList.remove("active");
        }
    });

    document.querySelectorAll(".main-tab-view").forEach(view => {
        if (view.id === targetTabId) {
            view.style.display = "block";
        } else {
            view.style.display = "none";
        }
    });

    if (targetTabId === "tabViewCharts") {
        renderChartsComparisonSection();
    }
}

// ===================================================
// BELKA PROFILU: STATYSTYKI I GABLOTA
// ===================================================

function updateProfileBanner() {
    if (!state.currentUser) return;

    const user = state.currentUser;
    document.getElementById("bannerProfileAvatar").src = user.avatar;
    document.getElementById("bannerProfileName").textContent = user.name;
    document.getElementById("bannerProfileSheet").textContent = user.sheetName;

    // Obliczanie statystyk
    const totalGames = state.games.length;
    
    let totalHours = 0;
    let sumRatings = 0;
    let ratedCount = 0;
    let completedCount = 0;

    const completedStates = ["Ukończona", "Ukończona+", "100'%", "100%", "PLATYNA"];

    state.games.forEach(g => {
        const hours = parseFloat(g["Liczba godzin"]) || 0;
        totalHours += hours;

        const rating = parseFloat(g["Ocena gry"]);
        if (!isNaN(rating)) {
            sumRatings += rating;
            ratedCount++;
        }

        const st = (g["Stan"] || "").trim();
        if (completedStates.includes(st)) {
            completedCount++;
        }
    });

    const avgRating = ratedCount > 0 ? (sumRatings / ratedCount).toFixed(2) : "-";

    document.getElementById("statTotalGames").textContent = totalGames;
    document.getElementById("statCompletedGames").textContent = completedCount;
    document.getElementById("statTotalHours").textContent = `${Math.round(totalHours)}h`;
    document.getElementById("statAvgRating").textContent = avgRating;

    renderProfileShowcase();
}

function getShowcaseGameIds(userCode) {
    try {
        const key = CACHE_KEYS.SHOWCASE_PREFIX + userCode;
        const stored = localStorage.getItem(key);
        if (stored) {
            return JSON.parse(stored);
        }
    } catch (e) {}
    return [];
}

function saveShowcaseGameIds(userCode, ids) {
    try {
        const key = CACHE_KEYS.SHOWCASE_PREFIX + userCode;
        localStorage.setItem(key, JSON.stringify(ids));
    } catch (e) {}
}

function renderProfileShowcase() {
    const grid = document.getElementById("showcaseGrid");
    if (!grid || !state.currentUser) return;

    const featuredIds = getShowcaseGameIds(state.currentUser.code);

    if (featuredIds.length === 0) {
        grid.innerHTML = '<p class="showcase-empty-hint">Brak wyróżnionych gier w gablocie.</p>';
        return;
    }

    const showcaseGames = state.games.filter(g => featuredIds.includes(String(g.id)));

    if (showcaseGames.length === 0) {
        grid.innerHTML = '<p class="showcase-empty-hint">Brak wyróżnionych gier w gablocie.</p>';
        return;
    }

    grid.innerHTML = "";
    showcaseGames.forEach(game => {
        const card = document.createElement("div");
        card.className = "showcase-card";
        
        const title = escapeHtml(game["Tytuł"] || "Brak tytułu");
        const rawRating = game["Ocena gry"];
        const hasRating = rawRating !== "" && rawRating !== undefined && rawRating !== null && rawRating !== "-";
        const rating = hasRating ? `${rawRating}/10` : "";
        const ratingBadgeHtml = hasRating ? `<span class="game-rating-badge">${rating}</span>` : "";
        const platform = escapeHtml(game["Platforma"] || "-");
        const status = escapeHtml(game["Stan"] || "-");

        card.innerHTML = `
            <div class="showcase-title" title="${title}">${title}</div>
            <div class="showcase-meta">
                <span>${platform} | ${status}</span>
                ${ratingBadgeHtml}
            </div>
        `;

        card.addEventListener("click", () => {
            openGameDetailsModal(game);
        });

        grid.appendChild(card);
    });
}

function openShowcaseEditModal() {
    if (!state.currentUser || !state.isAdmin) return;

    const checklist = document.getElementById("showcaseGamesChecklist");
    const searchInput = document.getElementById("showcaseSearchInput");
    if (searchInput) searchInput.value = "";

    const selectedIds = getShowcaseGameIds(state.currentUser.code);

    checklist.innerHTML = "";
    state.games.forEach(game => {
        const label = document.createElement("label");
        label.className = "showcase-check-item";
        const isChecked = selectedIds.includes(String(game.id));

        label.innerHTML = `
            <input type="checkbox" value="${escapeHtml(String(game.id))}" ${isChecked ? "checked" : ""}>
            <span><strong>${escapeHtml(game["Tytuł"] || "Brak")}</strong> (${escapeHtml(game["Platforma"] || "-")} - ${game["Ocena gry"] || "-"})</span>
        `;

        checklist.appendChild(label);
    });

    openModal("showcaseEditModal");
}

function filterShowcaseChecklist(query) {
    const items = document.querySelectorAll(".showcase-check-item");
    items.forEach(item => {
        const text = item.textContent.toLowerCase();
        item.style.display = text.includes(query) ? "flex" : "none";
    });
}

function handleSaveShowcase() {
    if (!state.currentUser) return;

    const checkboxes = document.querySelectorAll("#showcaseGamesChecklist input[type='checkbox']:checked");
    const selectedIds = Array.from(checkboxes).map(cb => cb.value);

    saveShowcaseGameIds(state.currentUser.code, selectedIds);
    renderProfileShowcase();
    closeModal("showcaseEditModal");
}

// ===================================================
// SEKCJA WYKRESÓW I PORÓWNAŃ (TAB 2)
// ===================================================

function renderChartsComparisonSection() {
    const container = document.getElementById("chartsComparisonContent");
    if (!container) return;

    let html = `
        <div style="margin-top: 14px; display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 14px;">
            <div style="background: var(--color-bg); padding: 14px; border: 1px solid var(--color-border); border-radius: 6px;">
                <h4 style="color: var(--color-text-main); margin-bottom: 10px;">Zestawienie średnich ocen</h4>
                <div id="chartsSredniaMini"></div>
            </div>
            <div style="background: var(--color-bg); padding: 14px; border: 1px solid var(--color-border); border-radius: 6px;">
                <h4 style="color: var(--color-text-main); margin-bottom: 10px;">Liczba ukończonych gier wg platform</h4>
                <div id="chartsPlatformyMini"></div>
            </div>
        </div>
    `;

    container.innerHTML = html;

    renderTable("chartsSredniaMini", state.settings.sredniaOcen);
    renderTable("chartsPlatformyMini", state.settings.platformy);
}

// ===================================================
// ZARZĄDZANIE PROFILAMI UŻYTKOWNIKÓW
// ===================================================

function switchUserProfile(user) {
    state.currentUser = user;
    applyUserTheme(user);
    showDashboardScreen();

    document.getElementById("activeProfileAvatar").src = user.avatar;
    document.getElementById("activeProfileName").textContent = user.name;

    renderProfileDropdownMenu();
    loadGamesForUser(user.sheetName, false);
}

function renderProfileDropdownMenu() {
    const menu = document.getElementById("profileDropdownMenu");
    menu.innerHTML = "";

    const otherUsers = state.users.filter(u => !state.currentUser || u.code !== state.currentUser.code);

    if (otherUsers.length === 0) {
        menu.innerHTML = '<div style="padding:10px 14px; font-size:13px; color:#888;">Brak innych profili</div>';
        return;
    }

    otherUsers.forEach(u => {
        const item = document.createElement("button");
        item.className = "profile-menu-item";
        item.innerHTML = `
            <img src="${u.avatar}" alt="${u.code}" class="mini-avatar" onerror="this.src='assets/matthewmill.PNG'">
            <span>${escapeHtml(u.name)}</span>
        `;
        item.addEventListener("click", () => {
            menu.style.display = "none";
            switchUserProfile(u);
        });
        menu.appendChild(item);
    });
}

async function fetchUsersList(forceRefresh = false) {
    if (!forceRefresh && state.cache.users) {
        state.users = state.cache.users;
        return;
    }

    try {
        const response = await sendApiRequest({ action: "getAllUsers" });
        if (response.status === "success" && Array.isArray(response.data) && response.data.length > 0) {
            let usersChanged = false;

            response.data.forEach(remoteUser => {
                let existing = state.users.find(u => u.code === remoteUser.code);
                const isMM = remoteUser.code === "MM";
                const isNK = remoteUser.code === "NK";
                const defaultName = isMM ? "MatthewMill (MM)" : (isNK ? "R4sheg (NK)" : `${remoteUser.name} (${remoteUser.code})`);
                const defaultColor = isMM ? "#13a71f" : (isNK ? "#A81214" : (remoteUser.tabColor || "#2a4365"));
                const defaultHover = isMM ? "#0f8518" : (isNK ? "#860e10" : (remoteUser.tabColor || "#1e314b"));

                if (!existing) {
                    existing = {
                        code: remoteUser.code,
                        name: defaultName,
                        sheetName: remoteUser.sheetName,
                        avatar: isMM ? "assets/matthewmill.PNG" : (isNK ? "assets/rasheg.PNG" : "assets/matthewmill.PNG"),
                        color: defaultColor,
                        hoverColor: defaultHover
                    };
                    state.users.push(existing);
                    usersChanged = true;
                } else {
                    if (existing.name !== defaultName || existing.color !== defaultColor) {
                        existing.name = defaultName;
                        existing.color = defaultColor;
                        existing.hoverColor = defaultHover;
                        usersChanged = true;
                    }
                }
            });

            state.cache.users = state.users;
            try {
                sessionStorage.setItem(CACHE_KEYS.USERS, JSON.stringify(state.users));
            } catch (e) {}

            // Re-renderuj tylko jeśli lista użytkowników rzeczywiście uległa zmianie
            if (usersChanged) {
                if (state.currentScreen === "welcome") {
                    renderWelcomeHeads();
                }
                renderProfileDropdownMenu();
            }
        }
    } catch (e) {
        console.warn("Użyto lokalnej konfiguracji użytkowników.");
    }
}

// ===================================================
// KOMUNIKACJA SIECIOWA (FETCH CORS + JSONP FALLBACK)
// ===================================================

async function sendApiRequest(params, customPassword = null, timeoutMs = 25000) {
    const passwordToSend = customPassword !== null ? customPassword : state.adminPassword;
    const queryParams = new URLSearchParams(params);
    if (passwordToSend) {
        queryParams.append("pass", passwordToSend);
    }
    const url = GOOGLE_SCRIPT_URL + "?" + queryParams.toString();

    // 1. Próba natywnego fetch() (tylko na serwerze http/https, pomijane na lokalnym file://)
    if (window.location.protocol === "http:" || window.location.protocol === "https:") {
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeoutMs);
            const res = await fetch(url, {
                method: "GET",
                redirect: "follow",
                signal: controller.signal
            });
            clearTimeout(timer);
            if (res.ok) {
                const data = await res.json();
                return data;
            }
        } catch (fetchErr) {
            // Jeśli przeglądarka zablokowała fetch, przechodzimy do JSONP
        }
    }

    // 2. Fallback: JSONP
    return new Promise((resolve, reject) => {
        const callbackName = "jsonp_cb_" + Math.round(1000000 * Math.random());
        const jsonpParams = new URLSearchParams(params);
        jsonpParams.append("callback", callbackName);
        if (passwordToSend) {
            jsonpParams.append("pass", passwordToSend);
        }

        let isDone = false;
        let timer = null;

        const cleanup = () => {
            if (timer) clearTimeout(timer);
            delete window[callbackName];
            const el = document.getElementById(callbackName);
            if (el && el.parentNode) el.parentNode.removeChild(el);
        };

        window[callbackName] = function(data) {
            if (isDone) return;
            isDone = true;
            cleanup();
            resolve(data);
        };

        const script = document.createElement("script");
        script.id = callbackName;
        script.src = GOOGLE_SCRIPT_URL + "?" + jsonpParams.toString();
        script.onerror = () => {
            if (isDone) return;
            isDone = true;
            cleanup();
            reject(new Error("Błąd połączenia z serwerem Google Apps Script."));
        };

        timer = setTimeout(() => {
            if (isDone) return;
            isDone = true;
            cleanup();
            reject(new Error("Przekroczono limit czasu oczekiwania na odpowiedź serwera."));
        }, timeoutMs);

        document.body.appendChild(script);
    });
}

async function sendApiRequestWithRetry(params, customPassword = null, retries = 2) {
    let lastError = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            return await sendApiRequest(params, customPassword);
        } catch (err) {
            lastError = err;
            if (attempt < retries) {
                // Krótkie opóźnienie przed kolejną próbą (np. cold start)
                await new Promise(r => setTimeout(r, 1200 * (attempt + 1)));
            }
        }
    }
    throw lastError;
}

// ===================================================
// POBIERANIE I WYŚWIETLANIE GIER
// ===================================================

async function loadGamesForUser(sheetName, forceRefresh = false) {
    console.log("[NKMM Baza Gier] >>> loadGamesForUser wywołane dla arkusza:", sheetName, "forceRefresh:", forceRefresh);
    const skeletonLoader = document.getElementById("skeletonLoader");
    const gamesGrid = document.getElementById("gamesGrid");
    const emptyResults = document.getElementById("emptyResultsMessage");
    const resultsCount = document.getElementById("resultsCount");

    if (!forceRefresh) {
        const cached = getCachedGames(sheetName);
        if (cached !== null) {
            console.log("[NKMM Baza Gier] Wczytano z pamięci podręcznej (cache):", cached.length, "gier");
            state.games = cached;
            updateProfileBanner();
            populateFilterOptions();
            renderGamesGrid();
            return;
        }
    }

    skeletonLoader.style.display = "grid";
    gamesGrid.style.display = "none";
    emptyResults.style.display = "none";
    resultsCount.textContent = "Pobieranie bazy gier z chmury...";

    try {
        console.log("[NKMM Baza Gier] Wysyłanie zapytania getAllGames do Google Apps Script...");
        const response = await sendApiRequestWithRetry({
            action: "getAllGames",
            user: sheetName
        }, null, 2);

        console.log("[NKMM Baza Gier] Odpowiedź serwera dla getAllGames:", response);

        if (response.status === "success") {
            state.games = Array.isArray(response.data) ? response.data : [];
            console.log("[NKMM Baza Gier] Sukces pobierania! Liczba gier w bazie:", state.games.length);
            setCachedGames(sheetName, state.games);
            updateProfileBanner();
            populateFilterOptions();
            renderGamesGrid();
        } else {
            console.error("[NKMM Baza Gier] Serwer zwrócił błąd w odpowiedzi:", response.message);
            resultsCount.innerHTML = `Błąd: ${escapeHtml(response.message || "Nie udało się pobrać gier")} <button class="btn-link" onclick="loadGamesForUser('${escapeHtml(sheetName)}', true)" style="color: var(--color-primary); font-weight: bold; margin-left: 8px;">[Spróbuj ponownie]</button>`;
            skeletonLoader.style.display = "none";
        }
    } catch (error) {
        console.error("[NKMM Baza Gier] Błąd sieciowy / wyjątek w loadGamesForUser:", error);
        resultsCount.innerHTML = `Błąd sieciowy podczas pobierania danych. <button class="btn-link" onclick="loadGamesForUser('${escapeHtml(sheetName)}', true)" style="color: var(--color-primary); font-weight: bold; margin-left: 8px;">[Spróbuj ponownie]</button>`;
        skeletonLoader.style.display = "none";
    }
}

function renderGamesGrid() {
    const skeletonLoader = document.getElementById("skeletonLoader");
    const gamesGrid = document.getElementById("gamesGrid");
    const emptyResults = document.getElementById("emptyResultsMessage");
    const resultsCount = document.getElementById("resultsCount");

    skeletonLoader.style.display = "none";

    const selectedStatuses = state.filters.statuses instanceof Set ? state.filters.statuses : new Set();
    const selectedPlatforms = state.filters.platforms instanceof Set ? state.filters.platforms : new Set();
    const selectedCollections = state.filters.collections instanceof Set ? state.filters.collections : new Set();

    console.log("[NKMM Baza Gier] Rozpoczęto renderowanie siatki gier. Łącznie w state.games:", state.games.length);
    console.log("[NKMM Baza Gier] Aktywne filtry:", {
        search: state.filters.search,
        statuses: Array.from(selectedStatuses),
        platforms: Array.from(selectedPlatforms),
        collections: Array.from(selectedCollections),
        sort: state.filters.sort
    });

    let filtered = state.games.filter(game => {
        if (state.filters.search) {
            const query = state.filters.search.toLowerCase();
            const title = (game["Tytuł"] || "").toLowerCase();
            const platform = (game["Platforma"] || "").toLowerCase();
            const collections = (game["Kolekcje"] || "").toLowerCase();
            const review = (game["Recenzja"] || "").toLowerCase();
            if (!title.includes(query) && !platform.includes(query) && !collections.includes(query) && !review.includes(query)) {
                return false;
            }
        }
        if (selectedStatuses.size > 0) {
            const gameStatus = (game["Stan"] || "").trim();
            if (!selectedStatuses.has(gameStatus)) {
                return false;
            }
        }
        if (selectedPlatforms.size > 0) {
            const gamePlatform = (game["Platforma"] || "").trim();
            if (!selectedPlatforms.has(gamePlatform)) {
                return false;
            }
        }
        if (selectedCollections.size > 0) {
            const col = game["Kolekcje"] || "";
            const matchesAny = Array.from(selectedCollections).some(c => col.includes(c));
            if (!matchesAny) {
                return false;
            }
        }
        return true;
    });

    filtered.sort((a, b) => {
        switch (state.filters.sort) {
            case "title_asc":
                return (a["Tytuł"] || "").localeCompare(b["Tytuł"] || "");
            case "title_desc":
                return (b["Tytuł"] || "").localeCompare(a["Tytuł"] || "");
            case "rating_desc":
                return (parseFloat(b["Ocena gry"]) || 0) - (parseFloat(a["Ocena gry"]) || 0);
            case "rating_asc":
                return (parseFloat(a["Ocena gry"]) || 0) - (parseFloat(b["Ocena gry"]) || 0);
            case "hours_desc":
                return (parseFloat(b["Liczba godzin"]) || 0) - (parseFloat(a["Liczba godzin"]) || 0);
            case "date_desc":
                return (b["Data ukończenia"] || "").localeCompare(a["Data ukończenia"] || "");
            default:
                return 0;
        }
    });

    console.log("[NKMM Baza Gier] Gry po przefiltrowaniu do wyświetlenia:", filtered.length);

    resultsCount.textContent = `Wyświetlono: ${filtered.length} z ${state.games.length} tytułów`;

    if (filtered.length === 0) {
        gamesGrid.style.display = "none";
        emptyResults.style.display = "block";
        console.warn("[NKMM Baza Gier] Brak wyników do wyświetlenia po filtracji!");
        return;
    }

    emptyResults.style.display = "none";
    gamesGrid.style.display = "grid";
    gamesGrid.innerHTML = "";

    filtered.forEach(game => {
        const card = document.createElement("article");
        card.className = "game-card";

        const title = escapeHtml(game["Tytuł"] || "Brak tytułu");
        const status = escapeHtml(game["Stan"] || "-");
        const platform = escapeHtml(game["Platforma"] || "-");
        const rawRating = game["Ocena gry"];
        const hasRating = rawRating !== "" && rawRating !== undefined && rawRating !== null && rawRating !== "-";
        const rating = hasRating ? `${rawRating}/10` : "";
        
        // 3 pod-oceny (Fabuła, Grafika, Mechanika)
        const fabuła = game["Ocena fabuły"] !== "" && game["Ocena fabuły"] !== undefined ? `${game["Ocena fabuły"]}/10` : "-";
        const grafika = game["Ocena grafiki"] !== "" && game["Ocena grafiki"] !== undefined ? `${game["Ocena grafiki"]}/10` : "-";
        const mechanika = game["Ocena mechanik"] !== "" && game["Ocena mechanik"] !== undefined ? `${game["Ocena mechanik"]}/10` : "-";

        const hours = game["Liczba godzin"] ? `${game["Liczba godzin"]}h` : "";
        const date = game["Data ukończenia"] ? formatDate(game["Data ukończenia"]) : "";
        const review = escapeHtml(game["Recenzja"] || "");

        const tags = (game["Kolekcje"] || "").split(",").map(t => t.trim()).filter(Boolean);
        const tagsHtml = tags.map(t => `<span class="tag-pill">${escapeHtml(t)}</span>`).join("");

        // Budowa informacji do stopki kafelka (bez ID)
        const footerMetaItems = [];
        if (date) footerMetaItems.push(`Ukończono: ${date}`);
        if (hours) footerMetaItems.push(hours);
        const footerMetaText = footerMetaItems.join(" • ");

        let adminButtonsHtml = "";
        if (state.isAdmin) {
            adminButtonsHtml = `
                <div class="card-actions">
                    <button class="btn-card-action btn-card-edit" data-edit-id="${game.id}">Edytuj</button>
                    <button class="btn-card-action btn-card-delete" data-delete-id="${game.id}">Usuń</button>
                </div>
            `;
        }

        // Plakietka oceny renderowana tylko wtedy, gdy gra posiada ocenę
        let ratingBadgeHtml = "";
        if (hasRating) {
            const ratingTooltip = `Ocena gry: ${rating}\nFabuła: ${fabuła}\nGrafika: ${grafika}\nMechanika: ${mechanika}`;
            ratingBadgeHtml = `<div class="game-rating-badge" title="${escapeHtml(ratingTooltip)}">${rating}</div>`;
        }

        card.innerHTML = `
            <div class="game-card-content">
                <div class="game-card-header">
                    <h3 class="game-title">${title}</h3>
                    ${ratingBadgeHtml}
                </div>
                <div class="game-meta-row">
                    <span class="badge-status">${status}</span>
                    <span class="badge-platform">${platform}</span>
                </div>
                ${tagsHtml ? `<div class="game-tags">${tagsHtml}</div>` : ""}
                ${review ? `<div class="game-review-snippet">${review.substring(0, 140)}${review.length > 140 ? "..." : ""}</div>` : ""}
            </div>
            <div class="game-card-footer">
                <span>${footerMetaText}</span>
                ${adminButtonsHtml}
            </div>
        `;

        card.addEventListener("click", (e) => {
            if (e.target.closest(".btn-card-action")) return;
            openGameDetailsModal(game);
        });

        const editBtn = card.querySelector(".btn-card-edit");
        if (editBtn) {
            editBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                openGameEditModal(game);
            });
        }

        const deleteBtn = card.querySelector(".btn-card-delete");
        if (deleteBtn) {
            deleteBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                handleDeleteGame(game.id, game["Tytuł"]);
            });
        }

        gamesGrid.appendChild(card);
    });
}

// ===================================================
// FILTRY WIELOKROTNEGO WYBORU (CHECKLISTY)
// ===================================================

function setupFilterDropdown(btnId, menuId) {
    const btn = document.getElementById(btnId);
    const menu = document.getElementById(menuId);
    if (!btn || !menu) return;

    btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const isShown = menu.style.display === "block";
        closeAllFilterDropdowns();
        if (!isShown) menu.style.display = "block";
    });

    menu.addEventListener("click", (e) => {
        e.stopPropagation();
    });
}

function closeAllFilterDropdowns() {
    const menus = ["menuFilterStatus", "menuFilterPlatform", "menuFilterCollection"];
    menus.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = "none";
    });
}

function populateFilterOptions() {
    const statuses = new Set();
    const platforms = new Set();
    const collections = new Set();

    state.games.forEach(g => {
        if (g["Stan"]) statuses.add(g["Stan"].trim());
        if (g["Platforma"]) platforms.add(g["Platforma"].trim());
        if (g["Kolekcje"]) {
            g["Kolekcje"].split(",").forEach(t => {
                const clean = t.trim();
                if (clean) collections.add(clean);
            });
        }
    });

    renderChecklist("checklistStatus", Array.from(statuses).sort(), state.filters.statuses, "labelFilterStatus", "Stan");
    renderChecklist("checklistPlatform", Array.from(platforms).sort(), state.filters.platforms, "labelFilterPlatform", "Platforma");
    renderChecklist("checklistCollection", Array.from(collections).sort(), state.filters.collections, "labelFilterCollection", "Kolekcje");
}

function renderChecklist(containerId, items, selectedSet, labelId, prefix) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = "";

    if (items.length === 0) {
        container.innerHTML = '<span style="font-size:12px; color:var(--color-text-muted); padding:4px;">Brak opcji</span>';
        return;
    }

    items.forEach(val => {
        const label = document.createElement("label");
        label.className = "filter-check-item";

        const isChecked = selectedSet.has(val);

        label.innerHTML = `
            <input type="checkbox" value="${escapeHtml(val)}" ${isChecked ? "checked" : ""}>
            <span>${escapeHtml(val)}</span>
        `;

        const checkbox = label.querySelector("input");
        checkbox.addEventListener("change", () => {
            if (checkbox.checked) {
                selectedSet.add(val);
            } else {
                selectedSet.delete(val);
            }
            updateFilterLabel(labelId, prefix, selectedSet);
            renderGamesGrid();
        });

        container.appendChild(label);
    });

    updateFilterLabel(labelId, prefix, selectedSet);
}

function updateFilterLabel(labelId, prefix, selectedSet) {
    const labelEl = document.getElementById(labelId);
    if (!labelEl) return;

    if (selectedSet.size === 0) {
        labelEl.textContent = `${prefix}: Wszystkie`;
    } else if (selectedSet.size === 1) {
        const firstVal = Array.from(selectedSet)[0];
        labelEl.textContent = `${prefix}: ${firstVal}`;
    } else {
        labelEl.textContent = `${prefix} (${selectedSet.size})`;
    }
}

function resetFilters() {
    state.filters.search = "";
    state.filters.statuses.clear();
    state.filters.platforms.clear();
    state.filters.collections.clear();
    state.filters.sort = "title_asc";

    document.getElementById("searchInput").value = "";
    document.getElementById("btnClearSearch").style.display = "none";
    document.getElementById("sortSelect").value = "title_asc";

    closeAllFilterDropdowns();
    populateFilterOptions();
    renderGamesGrid();
}

// ===================================================
// MODAL: SZCZEGÓŁY GRY (ZWIĘZŁY)
// ===================================================

function openGameDetailsModal(game) {
    document.getElementById("modalGameTitle").textContent = game["Tytuł"] || "Szczegóły gry";
    const body = document.getElementById("modalGameBody");

    const fabuła = game["Ocena fabuły"] !== "" && game["Ocena fabuły"] !== undefined ? game["Ocena fabuły"] : "-";
    const grafika = game["Ocena grafiki"] !== "" && game["Ocena grafiki"] !== undefined ? game["Ocena grafiki"] : "-";
    const mechaniki = game["Ocena mechanik"] !== "" && game["Ocena mechanik"] !== undefined ? game["Ocena mechanik"] : "-";
    const ocenaOgólna = game["Ocena gry"] !== "" && game["Ocena gry"] !== undefined ? game["Ocena gry"] : "-";

    body.innerHTML = `
        <div style="margin-bottom: 14px;">
            <div style="font-size: 15px; margin-bottom: 6px; display: flex; flex-wrap: wrap; gap: 8px;">
                <span><strong>Stan:</strong> ${escapeHtml(game["Stan"] || "-")}</span>
                <span>•</span>
                <span><strong>Platforma:</strong> ${escapeHtml(game["Platforma"] || "-")}</span>
                ${game["Liczba godzin"] ? `<span>•</span><span><strong>Czas:</strong> ${game["Liczba godzin"]}h</span>` : ""}
            </div>
            ${game["Data ukończenia"] ? `
                <div style="font-size: 14px; color: var(--color-text-muted); margin-bottom: 6px;">
                    <strong>Data ukończenia:</strong> ${formatDate(game["Data ukończenia"])}
                </div>
            ` : ""}
            ${game["Kolekcje"] ? `
                <div style="font-size: 14px; color: var(--color-text-muted); margin-bottom: 10px;">
                    <strong>Kolekcje / Tagi:</strong> ${escapeHtml(game["Kolekcje"])}
                </div>
            ` : ""}
        </div>

        <div style="background: var(--color-bg); padding: 14px; border-radius: var(--radius-sm); border: 1px solid var(--color-border); margin-bottom: 14px;">
            <h4 style="margin-bottom: 10px; font-size: 15px; color: var(--color-text-main);">Zestawienie ocen (0-10):</h4>
            <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; text-align: center;">
                <div style="background: var(--color-surface); padding: 8px; border: 1px solid var(--color-border); border-radius: 4px;">
                    <div style="font-size: 14px; color: var(--color-text-muted);">Fabuła</div>
                    <div style="font-weight: bold; font-size: 18px; margin-top: 4px;">${fabuła}</div>
                </div>
                <div style="background: var(--color-surface); padding: 8px; border: 1px solid var(--color-border); border-radius: 4px;">
                    <div style="font-size: 14px; color: var(--color-text-muted);">Grafika</div>
                    <div style="font-weight: bold; font-size: 18px; margin-top: 4px;">${grafika}</div>
                </div>
                <div style="background: var(--color-surface); padding: 8px; border: 1px solid var(--color-border); border-radius: 4px;">
                    <div style="font-size: 14px; color: var(--color-text-muted);">Mechanika</div>
                    <div style="font-weight: bold; font-size: 18px; margin-top: 4px;">${mechaniki}</div>
                </div>
                <div style="background: var(--color-surface); padding: 8px; border: 1px solid var(--color-primary); border-radius: 4px;">
                    <div style="font-size: 14px; color: var(--color-text-main);">Ocena Gry</div>
                    <div style="font-weight: bold; font-size: 18px; margin-top: 4px; color: var(--color-text-main);">${ocenaOgólna}</div>
                </div>
            </div>
        </div>

        ${game["Recenzja"] ? `
            <div>
                <h4 style="margin-bottom: 6px; font-size: 15px; color: var(--color-text-main);">Recenzja / Notatka:</h4>
                <div style="white-space: pre-wrap; background: var(--color-bg); padding: 14px; border: 1px solid var(--color-border); border-radius: 4px; font-size: 14px; line-height: 1.5; color: #edf2f7;">${escapeHtml(game["Recenzja"])}</div>
            </div>
        ` : ""}
    `;

    openModal("gameDetailsModal");
}

// ===================================================
// ADMINISTRACJA I LOGOWANIE (ŚCISŁA WERYFIKACJA)
// ===================================================

async function handleAdminLogin(e) {
    e.preventDefault();
    const passInput = document.getElementById("adminPasswordInput");
    const errorDiv = document.getElementById("adminLoginError");
    const submitBtn = document.getElementById("btnSubmitAdminLogin");

    errorDiv.style.display = "none";
    submitBtn.disabled = true;
    submitBtn.textContent = "Weryfikacja...";

    const enteredPass = passInput.value.trim();

    try {
        const response = await sendApiRequest({ action: "verifyAuth" }, enteredPass);

        const isAuthorized = response.status === "success" || 
            (response.status === "error" && response.message && !response.message.includes("Brak autoryzacji") && response.message.includes("Nieznana akcja"));

        if (isAuthorized) {
            state.isAdmin = true;
            state.adminPassword = enteredPass;

            closeModal("adminLoginModal");
            passInput.value = "";
            applyAdminUiState();
            renderGamesGrid();
            updateProfileBanner();
        } else {
            errorDiv.textContent = "Błędne hasło dostępu!";
            errorDiv.style.display = "block";
        }
    } catch (err) {
        errorDiv.textContent = "Błędne hasło dostępu!";
        errorDiv.style.display = "block";
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "Zaloguj";
    }
}

function handleAdminLogout() {
    state.isAdmin = false;
    state.adminPassword = "";
    applyAdminUiState();
    renderGamesGrid();
    updateProfileBanner();
}

function applyAdminUiState() {
    const syncStatusWrapper = document.getElementById("syncStatusWrapper");
    const btnAdminLogin = document.getElementById("btnAdminLoginModal");
    const adminActionsBar = document.getElementById("adminActionsBar");
    const btnEditShowcase = document.getElementById("btnEditShowcase");
    const adminOnlyBlocks = document.querySelectorAll(".admin-only-block");

    if (state.isAdmin) {
        syncStatusWrapper.style.display = "flex";
        btnAdminLogin.style.display = "none";
        adminActionsBar.style.display = "flex";
        if (btnEditShowcase) btnEditShowcase.style.display = "inline-block";
        adminOnlyBlocks.forEach(el => el.style.display = "flex");
    } else {
        syncStatusWrapper.style.display = "none";
        btnAdminLogin.style.display = "inline-block";
        adminActionsBar.style.display = "none";
        if (btnEditShowcase) btnEditShowcase.style.display = "none";
        adminOnlyBlocks.forEach(el => el.style.display = "none");
    }
}

// ===================================================
// DODAWANIE / EDYCJA GRY (OPTIMISTIC UI)
// ===================================================

function openGameEditModal(game = null) {
    if (!state.isAdmin) return;

    const form = document.getElementById("gameEditForm");
    form.reset();
    document.getElementById("gameEditError").style.display = "none";

    populateSelectOptionsForForm();

    if (game) {
        document.getElementById("gameEditModalTitle").textContent = "Edycja gry";
        document.getElementById("formGameId").value = game.id || "";
        document.getElementById("formGameTitle").value = game["Tytuł"] || "";
        document.getElementById("formGameStatus").value = game["Stan"] || "";
        document.getElementById("formGamePlatform").value = game["Platforma"] || "";
        document.getElementById("formRatingFabuła").value = game["Ocena fabuły"] !== undefined ? game["Ocena fabuły"] : "";
        document.getElementById("formRatingGrafika").value = game["Ocena grafiki"] !== undefined ? game["Ocena grafiki"] : "";
        document.getElementById("formRatingMechanika").value = game["Ocena mechanik"] !== undefined ? game["Ocena mechanik"] : "";
        document.getElementById("formRatingOgólna").value = game["Ocena gry"] !== undefined ? game["Ocena gry"] : "";
        document.getElementById("formHours").value = game["Liczba godzin"] !== undefined ? game["Liczba godzin"] : "";
        document.getElementById("formCompletionDate").value = game["Data ukończenia"] || "";
        document.getElementById("formCollections").value = game["Kolekcje"] || "";
        document.getElementById("formReview").value = game["Recenzja"] || "";
    } else {
        document.getElementById("gameEditModalTitle").textContent = "Dodaj nową grę";
        document.getElementById("formGameId").value = "";
    }

    openModal("gameEditModal");
}

function populateSelectOptionsForForm() {
    const statusSelect = document.getElementById("formGameStatus");
    const platformSelect = document.getElementById("formGamePlatform");

    statusSelect.innerHTML = "";
    const defaultStatuses = ["Gram teraz", "Chcę zagrać", "Singleplayer", "Multiplayer", "Wstrzymana", "Pozostawiona", "Ukończona", "Ukończona+", "100'%", "PLATYNA"];
    defaultStatuses.forEach(st => {
        const opt = document.createElement("option");
        opt.value = st;
        opt.textContent = st;
        statusSelect.appendChild(opt);
    });

    platformSelect.innerHTML = "";
    const defaultPlatforms = ["Komputer", "Playstation 5", "Switch", "Switch 2", "Mobilka", "Inne"];
    defaultPlatforms.forEach(pl => {
        const opt = document.createElement("option");
        opt.value = pl;
        opt.textContent = pl;
        platformSelect.appendChild(opt);
    });
}

function handleGameFormSubmit(e) {
    e.preventDefault();
    if (!state.currentUser || !state.isAdmin) return;

    const gameId = document.getElementById("formGameId").value;
    const isEdit = !!gameId;
    const title = document.getElementById("formGameTitle").value.trim();

    const gameDetails = {
        "id": isEdit ? gameId : "ID_TEMP_" + Date.now(),
        "Tytuł": title,
        "Stan": document.getElementById("formGameStatus").value,
        "Platforma": document.getElementById("formGamePlatform").value,
        "Ocena fabuły": parseNum(document.getElementById("formRatingFabuła").value),
        "Ocena grafiki": parseNum(document.getElementById("formRatingGrafika").value),
        "Ocena mechanik": parseNum(document.getElementById("formRatingMechanika").value),
        "Ocena gry": parseNum(document.getElementById("formRatingOgólna").value),
        "Liczba godzin": parseNum(document.getElementById("formHours").value),
        "Data ukończenia": document.getElementById("formCompletionDate").value,
        "Kolekcje": document.getElementById("formCollections").value.trim(),
        "Recenzja": document.getElementById("formReview").value.trim()
    };

    const previousGames = [...state.games];
    const currentSheet = state.currentUser.sheetName;

    // OPTYMISTYCZNA AKTUALIZACJA
    if (isEdit) {
        const idx = state.games.findIndex(g => String(g.id) === String(gameId));
        if (idx !== -1) state.games[idx] = { ...state.games[idx], ...gameDetails };
    } else {
        state.games.unshift(gameDetails);
    }

    setCachedGames(currentSheet, state.games);
    updateProfileBanner();
    populateFilterOptions();
    renderGamesGrid();
    closeModal("gameEditModal");

    const taskTitle = isEdit ? `Edycja gry: ${title}` : `Dodanie gry: ${title}`;

    enqueueSyncTask(
        taskTitle,
        async () => {
            const res = await sendApiRequest({
                action: isEdit ? "editGame" : "addGame",
                user: currentSheet,
                gameId: gameId,
                gameDetails: JSON.stringify(gameDetails)
            });

            if (res.status === "success") {
                invalidateSettingsCache();
                if (!isEdit && res.data && res.data.id) {
                    const tempGame = state.games.find(g => g.id === gameDetails.id);
                    if (tempGame) tempGame.id = res.data.id;
                    setCachedGames(currentSheet, state.games);
                    renderGamesGrid();
                    updateProfileBanner();
                }
            }
            return res;
        },
        () => {
            state.games = previousGames;
            setCachedGames(currentSheet, state.games);
            updateProfileBanner();
            renderGamesGrid();
        }
    );
}

function handleDeleteGame(gameId, title) {
    if (!state.currentUser || !state.isAdmin) return;

    if (!confirm(`Czy na pewno chcesz usunąć grę "${title}" z bazy?`)) return;

    const previousGames = [...state.games];
    const currentSheet = state.currentUser.sheetName;

    state.games = state.games.filter(g => String(g.id) !== String(gameId));
    setCachedGames(currentSheet, state.games);
    updateProfileBanner();
    populateFilterOptions();
    renderGamesGrid();

    enqueueSyncTask(
        `Usunięcie gry: ${title}`,
        async () => {
            const res = await sendApiRequest({
                action: "deleteGame",
                user: currentSheet,
                gameId: gameId
            });
            if (res.status === "success") {
                invalidateSettingsCache();
            }
            return res;
        },
        () => {
            state.games = previousGames;
            setCachedGames(currentSheet, state.games);
            updateProfileBanner();
            renderGamesGrid();
        }
    );
}

// ===================================================
// DODAWANIE NOWEGO UŻYTKOWNIKA (OPTIMISTIC UI)
// ===================================================

function handleAddUserSubmit(e) {
    e.preventDefault();
    if (!state.isAdmin) return;

    const userName = document.getElementById("newUserName").value.trim();
    const userCode = document.getElementById("newUserCode").value.trim().toUpperCase();
    const userColor = document.getElementById("newUserColor").value;

    const previousUsers = [...state.users];

    const newUser = {
        code: userCode,
        name: `${userName} (${userCode})`,
        sheetName: `Baza gier ${userCode}`,
        avatar: "assets/matthewmill.PNG",
        color: userColor,
        hoverColor: userColor
    };

    state.users.push(newUser);
    closeModal("addUserModal");
    document.getElementById("addUserForm").reset();
    renderProfileDropdownMenu();
    switchUserProfile(newUser);

    enqueueSyncTask(
        `Tworzenie profilu: ${userCode}`,
        async () => {
            const res = await sendApiRequest({
                action: "addUser",
                userName: userName,
                userCode: userCode,
                tabColor: userColor
            });

            if (res.status === "success") {
                invalidateUsersCache();
                invalidateSettingsCache();
                try {
                    sessionStorage.setItem(CACHE_KEYS.USERS, JSON.stringify(state.users));
                } catch (e) {}
            }
            return res;
        },
        () => {
            state.users = previousUsers;
            renderProfileDropdownMenu();
            if (state.currentUser && state.currentUser.code === userCode) {
                switchUserProfile(state.users[0]);
            }
        }
    );
}

// ===================================================
// STATYSTYKI I SŁOWNIKI
// ===================================================

async function openStatsModal() {
    openModal("statsModal");
    await fetchSettingsAndStats(false);
    renderStatsTables();
}

async function fetchSettingsAndStats(forceRefresh = false) {
    if (!forceRefresh && state.cache.settings) {
        state.settings = state.cache.settings;
        renderStatsTables();
        return;
    }

    try {
        const response = await sendApiRequest({ action: "getSettingsAndStats" });
        if (response.status === "success" && response.data) {
            state.settings = response.data;
            state.cache.settings = response.data;
            try {
                sessionStorage.setItem(CACHE_KEYS.SETTINGS, JSON.stringify(response.data));
            } catch (e) {}
            renderStatsTables();
        }
    } catch (e) {
        console.warn("Nie udało się odświeżyć statystyk.");
    }
}

function initStatsTabs() {
    document.querySelectorAll(".tab-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
            document.querySelectorAll(".tab-content").forEach(c => c.style.display = "none");

            btn.classList.add("active");
            const targetId = btn.getAttribute("data-tab");
            const content = document.getElementById(targetId);
            if (content) content.style.display = "block";
        });
    });
}

function renderStatsTables() {
    renderTable("tableStanContainer", state.settings.stan, "Stan");
    renderTable("tableKolekcjeContainer", state.settings.kolekcje, "Kolekcje");
    renderTable("tablePlatformyContainer", state.settings.platformy, "Platformy");
    renderTable("tableSrednieContainer", state.settings.sredniaOcen);
    renderTable("tableLiczbaOcenContainer", state.settings.liczbaOcen);
    renderTable("tableUkonczoneContainer", state.settings.ukonczoneMiesiecznie);
}

function renderTable(containerId, tableData, category = null) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!tableData || !tableData.headers || tableData.headers.length === 0) {
        container.innerHTML = "<p style='padding:10px; color:#888;'>Brak danych tabeli.</p>";
        return;
    }

    let html = "<table class='data-table'><thead><tr>";
    tableData.headers.forEach(h => {
        html += `<th>${escapeHtml(h)}</th>`;
    });
    if (state.isAdmin && category) {
        html += "<th>Akcje</th>";
    }
    html += "</tr></thead><tbody>";

    tableData.rows.forEach(row => {
        html += "<tr>";
        tableData.headers.forEach(h => {
            const val = row[h] !== undefined && row[h] !== null ? row[h] : "";
            html += `<td>${escapeHtml(String(val))}</td>`;
        });

        if (state.isAdmin && category) {
            const primaryVal = row[category] || "";
            html += `<td><button class="btn-card-action btn-card-delete" onclick="handleDeleteSettingItem('${category}', '${escapeHtml(primaryVal)}')">Usuń</button></td>`;
        }
        html += "</tr>";
    });

    html += "</tbody></table>";
    container.innerHTML = html;
}

function getSettingsCategoryData(category) {
    if (category === "Stan") return state.settings.stan;
    if (category === "Kolekcje") return state.settings.kolekcje;
    if (category === "Platformy") return state.settings.platformy;
    return null;
}

function handleAddSetting(category, inputValId, inputDescId = null) {
    if (!state.isAdmin) return;

    const valInput = document.getElementById(inputValId);
    const descInput = inputDescId ? document.getElementById(inputDescId) : null;

    const val = valInput ? valInput.value.trim() : "";
    const desc = descInput ? descInput.value.trim() : "";

    if (!val) {
        alert("Podaj wartość do dodania.");
        return;
    }

    if (valInput) valInput.value = "";
    if (descInput) descInput.value = "";

    // Optimistic UI - natychmiastowe dodanie wiersza w pamięci
    const catData = getSettingsCategoryData(category);
    let previousRows = null;

    if (catData && catData.headers) {
        previousRows = [...catData.rows];
        const newRow = {};
        catData.headers.forEach(h => {
            if (h === "Lp") {
                newRow[h] = catData.rows.length + 1;
            } else if (h === category) {
                newRow[h] = val;
            } else if (h === `Opis ${category.toLowerCase()}` || h === "Opis" || h.includes("Opis")) {
                newRow[h] = desc;
            } else {
                newRow[h] = 0;
            }
        });
        catData.rows.push(newRow);
        renderStatsTables();
        populateFilterOptions();
    }

    enqueueSyncTask(
        `Dodawanie do słownika [${category}]: ${val}`,
        async () => {
            const res = await sendApiRequest({
                action: "addSettingsItem",
                category: category,
                value: val,
                description: desc
            });
            if (res.status === "success") {
                invalidateSettingsCache();
                await fetchSettingsAndStats(true);
            }
            return res;
        },
        () => {
            // Rollback w przypadku błędu
            if (catData && previousRows) {
                catData.rows = previousRows;
                renderStatsTables();
                populateFilterOptions();
            }
        }
    );
}

window.handleDeleteSettingItem = function(category, value) {
    if (!state.isAdmin) return;

    if (!confirm(`Czy na pewno chcesz usunąć "${value}" ze słownika ${category}?`)) return;

    // Optimistic UI - natychmiastowe usunięcie wiersza w pamięci
    const catData = getSettingsCategoryData(category);
    let previousRows = null;

    if (catData && catData.rows) {
        previousRows = [...catData.rows];
        catData.rows = catData.rows.filter(r => String(r[category]) !== String(value));
        renderStatsTables();
        populateFilterOptions();
    }

    enqueueSyncTask(
        `Usuwanie ze słownika [${category}]: ${value}`,
        async () => {
            const res = await sendApiRequest({
                action: "deleteSettingsItem",
                category: category,
                value: value
            });
            if (res.status === "success") {
                invalidateSettingsCache();
                await fetchSettingsAndStats(true);
            }
            return res;
        },
        () => {
            // Rollback w przypadku błędu
            if (catData && previousRows) {
                catData.rows = previousRows;
                renderStatsTables();
                populateFilterOptions();
            }
        }
    );
};

// ===================================================
// FUNKCJE POMOCNICZE
// ===================================================

function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.style.display = "flex";
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.style.display = "none";
}

function parseNum(val) {
    if (val === "" || val === null || val === undefined) return "";
    const num = parseFloat(val);
    return isNaN(num) ? "" : num;
}

function formatDate(dateStr) {
    if (!dateStr) return "";
    return String(dateStr).split("T")[0];
}

function escapeHtml(str) {
    if (!str) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}