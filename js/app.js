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
    SHOWCASE_PREFIX: "nkmm_showcase_",
    SYNC_QUEUE: "nkmm_sync_queue",
    ADMIN_AUTH: "nkmm_admin_auth"
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
    // Przywrócenie trwałej sesji administratora z localStorage
    try {
        const savedAuth = localStorage.getItem(CACHE_KEYS.ADMIN_AUTH);
        if (savedAuth) {
            state.isAdmin = true;
            state.adminPassword = savedAuth;
        }
    } catch (e) {}

    initEvents();
    initSessionCache();
    loadSyncQueueFromStorage();
    applyAdminUiState();
    showWelcomeScreen();
});

window.addEventListener("beforeunload", (e) => {
    saveSyncQueueToStorage();
    const pendingCount = state.syncQueue.filter(t => t.status === "pending" || t.status === "in_progress").length;
    if (pendingCount > 0) {
        e.preventDefault();
        e.returnValue = "Trwa synchronizacja danych. Twoje zmiany są bezpiecznie zapisane w kolejce i zostaną przesłane po powrocie.";
    }
});

function initEvents() {
    // Nawigacja
    document.getElementById("btnNavHome").addEventListener("click", showWelcomeScreen);
    const footerHomeLink = document.getElementById("footerHomeLink");
    if (footerHomeLink) {
        footerHomeLink.addEventListener("click", (e) => {
            e.preventDefault();
            showWelcomeScreen();
        });
    }

    // Obsługa szuflady mobilnej (Drawer ☰)
    const mobileMenuToggle = document.getElementById("btnMobileMenuToggle");
    const mobileNavDrawer = document.getElementById("mobileNavDrawer");
    const closeDrawerBtn = document.getElementById("btnCloseMobileDrawer");
    const drawerBackdrop = document.getElementById("mobileDrawerBackdrop");

    const openMobileDrawer = () => { if (mobileNavDrawer) mobileNavDrawer.style.display = "flex"; };
    const closeMobileDrawer = () => { if (mobileNavDrawer) mobileNavDrawer.style.display = "none"; };

    if (mobileMenuToggle) mobileMenuToggle.addEventListener("click", openMobileDrawer);
    if (closeDrawerBtn) closeDrawerBtn.addEventListener("click", closeMobileDrawer);
    if (drawerBackdrop) drawerBackdrop.addEventListener("click", closeMobileDrawer);

    const btnMobileHome = document.getElementById("btnMobileHome");
    if (btnMobileHome) btnMobileHome.addEventListener("click", () => { closeMobileDrawer(); showWelcomeScreen(); });

    const btnMobileSettings = document.getElementById("btnMobileSettings");
    if (btnMobileSettings) btnMobileSettings.addEventListener("click", () => { closeMobileDrawer(); openStatsModal(); });

    const btnMobileAdmin = document.getElementById("btnMobileAdmin");
    if (btnMobileAdmin) btnMobileAdmin.addEventListener("click", () => {
        closeMobileDrawer();
        if (state.isAdmin) {
            handleAdminLogout();
        } else {
            openModal("adminLoginModal");
        }
    });

    const btnMobileRefresh = document.getElementById("btnMobileRefresh");
    if (btnMobileRefresh) btnMobileRefresh.addEventListener("click", handleForceRefreshAll);

    // Przełącznik widoczności filtrów na telefonie
    const btnToggleMobileFilters = document.getElementById("btnToggleMobileFilters");
    const filtersRow = document.getElementById("filtersRow");
    if (btnToggleMobileFilters && filtersRow) {
        btnToggleMobileFilters.addEventListener("click", () => {
            const isOpen = filtersRow.classList.toggle("mobile-open");
            btnToggleMobileFilters.classList.toggle("active", isOpen);
        });
    }

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

    const btnMobileSyncStatus = document.getElementById("btnMobileSyncStatus");
    if (btnMobileSyncStatus) {
        btnMobileSyncStatus.addEventListener("click", (e) => {
            e.stopPropagation();
            const isOpen = syncQueuePanel.style.display === "block";
            syncQueuePanel.style.display = isOpen ? "none" : "block";
        });
    }

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

    // Obsługa edycji i usuwania ze słowników (Ustawienia Bazy)
    document.addEventListener("click", (e) => {
        const editBtn = e.target.closest(".btn-setting-edit");
        if (editBtn) {
            const cat = editBtn.getAttribute("data-category");
            const val = editBtn.getAttribute("data-val");
            const desc = editBtn.getAttribute("data-desc");
            openEditSettingModal(cat, val, desc);
            return;
        }
        const delBtn = e.target.closest(".btn-setting-delete");
        if (delBtn) {
            const cat = delBtn.getAttribute("data-category");
            const val = delBtn.getAttribute("data-val");
            handleDeleteSettingItem(cat, val);
            return;
        }
        const retryBtn = e.target.closest(".btn-reload-games");
        if (retryBtn) {
            const sheet = retryBtn.getAttribute("data-sheet") || (state.currentUser ? state.currentUser.sheetName : "");
            if (sheet) loadGamesForUser(sheet, true);
            return;
        }
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
            if (modalId === "gameEditModal") {
                attemptCloseGameEditModal();
            } else {
                closeModal(modalId);
            }
        });
    });

    document.querySelectorAll(".modal-backdrop").forEach(modal => {
        modal.addEventListener("click", (e) => {
            if (e.target === modal) {
                if (modal.id === "gameEditModal") {
                    attemptCloseGameEditModal();
                } else if (modal.id !== "unsavedChangesModal") {
                    closeModal(modal.id);
                }
            }
        });
    });

    // Obsługa potwierdzenia niezapisanych zmian
    const btnUnsavedSave = document.getElementById("btnUnsavedSave");
    const btnUnsavedDiscard = document.getElementById("btnUnsavedDiscard");
    const btnUnsavedStay = document.getElementById("btnUnsavedStay");

    if (btnUnsavedSave) {
        btnUnsavedSave.addEventListener("click", () => {
            closeModal("unsavedChangesModal");
            const form = document.getElementById("gameEditForm");
            if (form) {
                if (typeof form.requestSubmit === "function") {
                    form.requestSubmit();
                } else {
                    form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
                }
            }
        });
    }

    if (btnUnsavedDiscard) {
        btnUnsavedDiscard.addEventListener("click", () => {
            state.formInitialSnapshot = null;
            closeModal("unsavedChangesModal");
            closeModal("gameEditModal");
        });
    }

    if (btnUnsavedStay) {
        btnUnsavedStay.addEventListener("click", () => {
            closeModal("unsavedChangesModal");
        });
    }

    // Globalne skróty klawiszowe (Enter na formularzach, Escape do zamykania)
    document.addEventListener("keydown", (e) => {
        // ESCAPE: zamykanie aktywnego modalu / szuflady
        if (e.key === "Escape") {
            const unsavedModal = document.getElementById("unsavedChangesModal");
            if (unsavedModal && unsavedModal.style.display !== "none") {
                closeModal("unsavedChangesModal");
                return;
            }

            const gameModal = document.getElementById("gameEditModal");
            if (gameModal && gameModal.style.display !== "none") {
                attemptCloseGameEditModal();
                return;
            }

            const openModals = Array.from(document.querySelectorAll(".modal-backdrop")).filter(m => m.style.display !== "none");
            if (openModals.length > 0) {
                closeModal(openModals[openModals.length - 1].id);
                return;
            }

            const drawer = document.getElementById("mobileNavDrawer");
            if (drawer && drawer.style.display !== "none") {
                drawer.style.display = "none";
                return;
            }
        }

        // ENTER: zatwierdzanie aktywnego formularza w modalu (chyba że fokus jest w <textarea>)
        if (e.key === "Enter") {
            const activeEl = document.activeElement;
            if (activeEl && activeEl.tagName && activeEl.tagName.toLowerCase() === "textarea") {
                return; // w textarea zachowujemy tworzenie nowej linii
            }

            const openModals = Array.from(document.querySelectorAll(".modal-backdrop")).filter(m => m.style.display !== "none");
            if (openModals.length > 0) {
                const topModal = openModals[openModals.length - 1];
                if (topModal.id === "unsavedChangesModal") {
                    e.preventDefault();
                    if (btnUnsavedSave) btnUnsavedSave.click();
                    return;
                }

                const form = topModal.querySelector("form");
                if (form) {
                    e.preventDefault();
                    if (typeof form.requestSubmit === "function") {
                        form.requestSubmit();
                    } else {
                        form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
                    }
                }
            }
        }
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
    document.getElementById("editSettingForm").addEventListener("submit", handleSaveEditSetting);

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
// SYSTEM KOLEJKI SYNCHRONIZACJI W TLE (OPTIMISTIC UI + LOCALSTORAGE)
// ===================================================

function saveSyncQueueToStorage() {
    try {
        const serializableTasks = state.syncQueue
            .filter(t => t.status === "pending" || t.status === "in_progress")
            .map(t => ({
                id: t.id,
                title: t.title,
                apiParams: t.apiParams,
                status: "pending",
                errorMsg: t.errorMsg || "",
                createdAt: t.createdAt || new Date().toISOString()
            }));
        localStorage.setItem(CACHE_KEYS.SYNC_QUEUE, JSON.stringify(serializableTasks));
    } catch (e) {}
}

function loadSyncQueueFromStorage() {
    try {
        const stored = localStorage.getItem(CACHE_KEYS.SYNC_QUEUE);
        if (stored) {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed) && parsed.length > 0) {
                parsed.forEach(t => {
                    if (t.apiParams) {
                        t.executeFn = () => sendApiRequest(t.apiParams);
                        t.status = "pending";
                        state.syncQueue.push(t);
                    }
                });
                updateSyncQueueUi();
                processSyncQueue();
            }
        }
    } catch (e) {}
}

function enqueueSyncTask(title, executeFn, rollbackFn, apiParams = null) {
    const task = {
        id: "task_" + Date.now() + "_" + Math.round(Math.random() * 1000),
        title: title,
        apiParams: apiParams,
        executeFn: executeFn || (apiParams ? () => sendApiRequest(apiParams) : null),
        rollbackFn: rollbackFn,
        status: "pending",
        errorMsg: "",
        createdAt: new Date()
    };

    state.syncQueue.push(task);
    saveSyncQueueToStorage();
    updateSyncQueueUi();
    processSyncQueue();
}

async function processSyncQueue() {
    if (state.isSyncing) return;

    const pendingTask = state.syncQueue.find(t => t.status === "pending");
    if (!pendingTask) {
        updateSyncQueueUi();
        saveSyncQueueToStorage();
        return;
    }

    state.isSyncing = true;
    pendingTask.status = "in_progress";
    saveSyncQueueToStorage();
    updateSyncQueueUi();

    try {
        let response = null;
        if (typeof pendingTask.executeFn === "function") {
            response = await pendingTask.executeFn();
        } else if (pendingTask.apiParams) {
            response = await sendApiRequest(pendingTask.apiParams);
        }

        if (response && response.status === "success") {
            pendingTask.status = "done";
            saveSyncQueueToStorage();
            updateSyncQueueUi();

            setTimeout(() => {
                state.syncQueue = state.syncQueue.filter(t => t.id !== pendingTask.id);
                saveSyncQueueToStorage();
                updateSyncQueueUi();
            }, 3000);
        } else {
            throw new Error((response && response.message) || "Błąd zapisu na serwerze.");
        }
    } catch (err) {
        pendingTask.status = "error";
        pendingTask.errorMsg = err.message;
        saveSyncQueueToStorage();
        updateSyncQueueUi();

        if (typeof pendingTask.rollbackFn === "function") {
            pendingTask.rollbackFn();
        }

        console.error(`[NKMM Sync] Błąd synchronizacji: ${pendingTask.title}`, err);
    } finally {
        state.isSyncing = false;
        processSyncQueue();
    }
}

function updateSyncQueueUi() {
    const syncStatusImg = document.getElementById("syncStatusImg");
    const mobileSyncStatusImg = document.getElementById("mobileSyncStatusImg");
    const syncQueueCount = document.getElementById("syncQueueCount");
    const syncQueueList = document.getElementById("syncQueueList");

    const pendingOrProgressCount = state.syncQueue.filter(t => t.status === "pending" || t.status === "in_progress").length;

    const iconSrc = pendingOrProgressCount > 0 ? "assets/sync.gif" : "assets/sync.png";
    if (syncStatusImg) syncStatusImg.src = iconSrc;
    if (mobileSyncStatusImg) mobileSyncStatusImg.src = iconSrc;

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

// ===================================================
// PASTELOWE KOLORY TAGÓW (ZAPIS W LOCALSTORAGE)
// ===================================================

function getTagColors() {
    try {
        const stored = localStorage.getItem("nkmm_tag_colors");
        if (stored) return JSON.parse(stored);
    } catch (e) {}
    return {};
}

function saveTagColors(colors) {
    try {
        localStorage.setItem("nkmm_tag_colors", JSON.stringify(colors));
    } catch (e) {}
}

function getTagColor(tagName) {
    if (!tagName) return { bg: "#1f242d", border: "#333c48", text: "#cbd5e1" };
    const clean = tagName.trim();
    const colors = getTagColors();
    if (colors[clean]) {
        return colors[clean];
    }
    // Deterministyczno-losowy pastelowy kolor HSL o zbalansowanym kontraście
    let hash = 0;
    for (let i = 0; i < clean.length; i++) {
        hash = clean.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = Math.abs(hash) % 360;
    const colorObj = {
        bg: `hsl(${h}, 36%, 17%)`,
        border: `hsl(${h}, 48%, 34%)`,
        text: `hsl(${h}, 70%, 86%)`
    };
    colors[clean] = colorObj;
    saveTagColors(colors);
    return colorObj;
}

// ===================================================
// GABLOTA WYRÓŻNIONYCH GIER (OPARTA NA TAGU "GABLOTA")
// ===================================================

function isGameInShowcase(game) {
    if (!game) return false;
    const cols = (game["Kolekcje"] || "").split(",").map(c => c.trim().toLowerCase());
    return cols.includes("gablota");
}

function renderProfileShowcase() {
    const grid = document.getElementById("showcaseGrid");
    if (!grid || !state.currentUser) return;

    const showcaseGames = state.games.filter(g => isGameInShowcase(g));

    if (showcaseGames.length === 0) {
        grid.innerHTML = '<p class="showcase-empty-hint">Brak wyróżnionych gier w gablocie. Dodaj tag "Gablota" w edycji gry lub użyj przycisku poniżej.</p>';
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

    checklist.innerHTML = "";
    state.games.forEach(game => {
        const label = document.createElement("label");
        label.className = "showcase-check-item";
        const isChecked = isGameInShowcase(game);

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

    const checkboxes = document.querySelectorAll("#showcaseGamesChecklist input[type='checkbox']");
    const selectedIds = new Set();
    checkboxes.forEach(cb => {
        if (cb.checked) selectedIds.add(cb.value);
    });

    // Modyfikacja tagu "Gablota" w state.games
    state.games.forEach(game => {
        const gameIdStr = String(game.id);
        const shouldBeInShowcase = selectedIds.has(gameIdStr);
        let tags = (game["Kolekcje"] || "").split(",").map(t => t.trim()).filter(Boolean);
        const hasTag = tags.some(t => t.toLowerCase() === "gablota");

        let changed = false;
        if (shouldBeInShowcase && !hasTag) {
            tags.push("Gablota");
            changed = true;
        } else if (!shouldBeInShowcase && hasTag) {
            tags = tags.filter(t => t.toLowerCase() !== "gablota");
            changed = true;
        }

        if (changed) {
            game["Kolekcje"] = tags.join(", ");
            const gameDetails = { ...game };
            const apiParams = {
                action: "editGame",
                user: state.currentUser.sheetName,
                gameId: game.id,
                gameDetails: JSON.stringify(gameDetails)
            };
            enqueueSyncTask(
                `Aktualizacja gabloty: ${game["Tytuł"]}`,
                async () => {
                    return await sendApiRequest(apiParams);
                },
                null,
                apiParams
            );
        }
    });

    setCachedGames(state.currentUser.sheetName, state.games);
    renderProfileShowcase();
    renderGamesGrid();
    closeModal("showcaseEditModal");
}

// ===================================================
// SEKCJA WYKRESÓW I PORÓWNAŃ GRACZY (TAB 2)
// ===================================================

// ===================================================
// INTERAKTYWNE WYKRESY I DYMKI (TOOLTIP SYSTEM)
// ===================================================

function getOrCreateChartTooltip() {
    let el = document.getElementById("chartInteractiveTooltip");
    if (!el) {
        el = document.createElement("div");
        el.id = "chartInteractiveTooltip";
        el.className = "chart-interactive-tooltip";
        document.body.appendChild(el);

        document.addEventListener("click", (e) => {
            if (e.target.closest(".chart-tooltip-close")) {
                hideChartTooltip();
                return;
            }
            if (!e.target.closest(".chart-interactive-tooltip") && !e.target.closest(".chart-interactive-item") && !e.target.closest(".chart-dual-row") && !e.target.closest(".chart-data-point")) {
                hideChartTooltip();
            }
        });

        // Globalna delegacja kliknięć w elementy z danymi dymków (odporna na unescaped characters)
        document.addEventListener("click", (e) => {
            const item = e.target.closest("[data-tooltip-header]");
            if (item) {
                e.stopPropagation();
                const header = item.getAttribute("data-tooltip-header") || "";
                const rowsJson = decodeURIComponent(item.getAttribute("data-tooltip-rows") || "%5B%5D");
                try {
                    const rows = JSON.parse(rowsJson);
                    showChartTooltip(e, header, rows);
                } catch (err) {
                    console.warn("Błąd parsowania danych tooltipa:", err);
                }
            }
        });
    }
    return el;
}

window.showChartTooltip = function(event, headerText, rows) {
    if (event && event.stopPropagation) event.stopPropagation();
    const tooltip = getOrCreateChartTooltip();
    
    let html = `
        <div class="chart-tooltip-header">
            <span>${escapeHtml(headerText)}</span>
            <span class="chart-tooltip-close">✕</span>
        </div>
    `;

    rows.forEach(r => {
        const colorDot = r.color ? `<span class="legend-dot" style="background-color: ${r.color}; display:inline-block; margin-right:4px;"></span>` : "";
        html += `
            <div class="chart-tooltip-row">
                <span>${colorDot}${escapeHtml(r.label)}</span>
                <strong>${escapeHtml(String(r.value))}</strong>
            </div>
        `;
    });

    tooltip.innerHTML = html;
    tooltip.classList.add("active");

    let clientX = 0;
    let clientY = 0;

    if (event.touches && event.touches.length > 0) {
        clientX = event.touches[0].clientX;
        clientY = event.touches[0].clientY;
    } else if (event.clientX !== undefined) {
        clientX = event.clientX;
        clientY = event.clientY;
    } else if (event.currentTarget) {
        const rect = event.currentTarget.getBoundingClientRect();
        clientX = rect.left + rect.width / 2;
        clientY = rect.top;
    }

    const tipWidth = 260;
    const tipHeight = 120;
    let left = clientX + 12;
    let top = clientY - 40;

    if (left + tipWidth > window.innerWidth - 10) {
        left = clientX - tipWidth - 12;
    }
    if (left < 10) left = 10;
    if (top + tipHeight > window.innerHeight - 10) {
        top = window.innerHeight - tipHeight - 10;
    }
    if (top < 10) top = 10;

    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
};

window.hideChartTooltip = function() {
    const tooltip = document.getElementById("chartInteractiveTooltip");
    if (tooltip) tooltip.classList.remove("active");
};

// ===================================================
// SEKCJA WYKRESÓW I PORÓWNAŃ GRACZY (TAB 2)
// ===================================================

let chartsState = {
    donutUser: "ALL", // "ALL" | "MM" | "NK"
    donutMetric: "count", // "count" | "hours"
    allUsersGames: {} // { "MM": [...], "NK": [...] }
};

async function fetchAllUsersGamesForCharts() {
    const users = state.users;
    for (const u of users) {
        if (!chartsState.allUsersGames[u.code]) {
            const cached = getCachedGames(u.sheetName);
            if (cached) {
                chartsState.allUsersGames[u.code] = cached;
            } else {
                try {
                    const res = await sendApiRequest({ action: "getAllGames", user: u.sheetName });
                    if (res.status === "success" && Array.isArray(res.data)) {
                        chartsState.allUsersGames[u.code] = res.data;
                        setCachedGames(u.sheetName, res.data);
                    }
                } catch (e) {
                    chartsState.allUsersGames[u.code] = [];
                }
            }
        }
    }
}

async function renderChartsComparisonSection() {
    const container = document.getElementById("chartsComparisonContent");
    if (!container) return;

    container.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--color-text-muted);">Ładowanie danych analitycznych graczy...</div>';

    await fetchAllUsersGamesForCharts();

    const users = state.users;
    if (users.length === 0) {
        container.innerHTML = '<p class="modal-hint">Brak zdefiniowanych profili graczy.</p>';
        return;
    }

    const mmUser = users.find(u => u.code === "MM") || users[0];
    const nkUser = users.find(u => u.code === "NK") || users[1] || users[0];

    const mmGames = chartsState.allUsersGames[mmUser.code] || [];
    const nkGames = chartsState.allUsersGames[nkUser.code] || [];

    const mmColor = mmUser.color || "#13a71f";
    const nkColor = nkUser.color || "#A81214";

    let html = `
        <div class="chart-legend" style="margin-bottom: 16px; padding: 10px 14px; background: var(--color-bg); border-radius: 4px; border: 1px solid var(--color-border);">
            <div class="legend-item"><span class="legend-dot" style="background-color: ${mmColor};"></span><strong>${escapeHtml(mmUser.name)} (${mmGames.length} gier)</strong></div>
            <div class="legend-item"><span class="legend-dot" style="background-color: ${nkColor};"></span><strong>${escapeHtml(nkUser.name)} (${nkGames.length} gier)</strong></div>
            <div style="font-size: 11px; color: var(--color-text-muted); margin-left: auto;">* Kliknij lub dotknij dowolny element wykresu, aby zobaczyć szczegóły</div>
        </div>

        <div class="charts-grid">
            <!-- WYKRES 1: SŁUPKOWY - PODZIAŁ WEDŁUG STANÓW GRY -->
            <div class="chart-card">
                <div class="chart-card-header">
                    <h3>1. Stan gier</h3>
                </div>
                <div id="chartStatusContent" class="chart-bars-list">
                    ${renderStatusComparisonBars(mmGames, nkGames, mmUser, nkUser)}
                </div>
            </div>

            <!-- WYKRES 2: KOŁOWY / PIERŚCIENIOWY (DONUT) - UDZIAŁ PLATFORM -->
            <div class="chart-card">
                <div class="chart-card-header">
                    <h3>2. Udział platform</h3>
                    <div class="chart-controls-bar">
                        <select id="chartDonutUserSelect" class="chart-select">
                            <option value="ALL" ${chartsState.donutUser === "ALL" ? "selected" : ""}>Wszyscy gracze</option>
                            <option value="${mmUser.code}" ${chartsState.donutUser === mmUser.code ? "selected" : ""}>${escapeHtml(mmUser.name)}</option>
                            <option value="${nkUser.code}" ${chartsState.donutUser === nkUser.code ? "selected" : ""}>${escapeHtml(nkUser.name)}</option>
                        </select>
                        <select id="chartDonutMetricSelect" class="chart-select">
                            <option value="count" ${chartsState.donutMetric === "count" ? "selected" : ""}>Liczba gier</option>
                            <option value="hours" ${chartsState.donutMetric === "hours" ? "selected" : ""}>Godziny</option>
                        </select>
                    </div>
                </div>
                <div id="chartDonutContainer">
                    ${renderPlatformDonutChart(mmGames, nkGames, mmUser, nkUser)}
                </div>
            </div>

            <!-- WYKRES 3: LINIOWY - UKOŃCZENIA GIER W CZASIE -->
            <div class="chart-card">
                <div class="chart-card-header">
                    <h3>3. Oś czasu ukończeń</h3>
                </div>
                <div id="chartLineContainer">
                    ${renderCompletionsTimelineChart(mmGames, nkGames, mmUser, nkUser)}
                </div>
            </div>

            <!-- WYKRES 4: ROZKŁAD OCEN (HISTOGRAM) -->
            <div class="chart-card">
                <div class="chart-card-header">
                    <h3>4. Rozkład ocen</h3>
                </div>
                <div id="chartRatingsContent" class="chart-bars-list">
                    ${renderRatingsComparisonBars(mmGames, nkGames, mmUser, nkUser)}
                </div>
            </div>
        </div>
    `;

    container.innerHTML = html;

    // Obsługa zdarzeń kontrolek wykresu kołowego
    const userSelect = document.getElementById("chartDonutUserSelect");
    const metricSelect = document.getElementById("chartDonutMetricSelect");

    if (userSelect) {
        userSelect.addEventListener("change", (e) => {
            chartsState.donutUser = e.target.value;
            const content = document.getElementById("chartDonutContainer");
            if (content) content.innerHTML = renderPlatformDonutChart(mmGames, nkGames, mmUser, nkUser);
        });
    }

    if (metricSelect) {
        metricSelect.addEventListener("change", (e) => {
            chartsState.donutMetric = e.target.value;
            const content = document.getElementById("chartDonutContainer");
            if (content) content.innerHTML = renderPlatformDonutChart(mmGames, nkGames, mmUser, nkUser);
        });
    }
}

// 1. WYKRES SŁUPKOWY - STANY GIER
function renderStatusComparisonBars(mmGames, nkGames, mmUser, nkUser) {
    const statuses = new Set();
    mmGames.forEach(g => { if (g["Stan"]) statuses.add(g["Stan"].trim()); });
    nkGames.forEach(g => { if (g["Stan"]) statuses.add(g["Stan"].trim()); });

    const statusList = Array.from(statuses).sort();
    if (statusList.length === 0) return '<p class="modal-hint">Brak danych o stanach gier.</p>';

    let maxVal = 1;
    const statsData = statusList.map(st => {
        const mmCount = mmGames.filter(g => (g["Stan"] || "").trim() === st).length;
        const nkCount = nkGames.filter(g => (g["Stan"] || "").trim() === st).length;
        if (mmCount > maxVal) maxVal = mmCount;
        if (nkCount > maxVal) maxVal = nkCount;
        return { status: st, mm: mmCount, nk: nkCount };
    });

    return statsData.map(item => {
        const mmPct = Math.round((item.mm / maxVal) * 100);
        const nkPct = Math.round((item.nk / maxVal) * 100);
        const mmTotalPct = mmGames.length > 0 ? ((item.mm / mmGames.length) * 100).toFixed(1) : "0";
        const nkTotalPct = nkGames.length > 0 ? ((item.nk / nkGames.length) * 100).toFixed(1) : "0";

        const tooltipRows = [
            { label: `${mmUser.name}`, value: `${item.mm} gier (${mmTotalPct}%)`, color: mmUser.color },
            { label: `${nkUser.name}`, value: `${item.nk} gier (${nkTotalPct}%)`, color: nkUser.color },
            { label: "Łącznie", value: `${item.mm + item.nk} gier`, color: "#ffffff" }
        ];
        const rowsEncoded = encodeURIComponent(JSON.stringify(tooltipRows));

        return `
            <div class="chart-dual-row chart-interactive-item" data-tooltip-header="${escapeHtml(item.status)}" data-tooltip-rows="${rowsEncoded}">
                <span class="chart-bar-label" title="${escapeHtml(item.status)}">${escapeHtml(item.status)}</span>
                <div class="chart-dual-bars">
                    <div class="chart-single-bar-container">
                        <div class="chart-single-bar-fill" style="width: ${Math.max(mmPct, 3)}%; background-color: ${mmUser.color || '#13a71f'};"></div>
                        <span class="chart-single-bar-val">${item.mm}</span>
                    </div>
                    <div class="chart-single-bar-container">
                        <div class="chart-single-bar-fill" style="width: ${Math.max(nkPct, 3)}%; background-color: ${nkUser.color || '#A81214'};"></div>
                        <span class="chart-single-bar-val">${item.nk}</span>
                    </div>
                </div>
            </div>
        `;
    }).join("");
}

// 2. WYKRES KOŁOWY / PIERŚCIENIOWY SVG - PLATFORMY
function renderPlatformDonutChart(mmGames, nkGames, mmUser, nkUser) {
    let targetGames = [];
    let titlePrefix = "Wszyscy gracze";

    if (chartsState.donutUser === mmUser.code) {
        targetGames = mmGames;
        titlePrefix = mmUser.name;
    } else if (chartsState.donutUser === nkUser.code) {
        targetGames = nkGames;
        titlePrefix = nkUser.name;
    } else {
        targetGames = [...mmGames, ...nkGames];
    }

    if (targetGames.length === 0) return '<p class="modal-hint">Brak danych gier dla wybranego profilu.</p>';

    const platformMap = new Map();
    const isHours = chartsState.donutMetric === "hours";

    targetGames.forEach(g => {
        const plat = (g["Platforma"] || "Inna").trim();
        const val = isHours ? (parseFloat(g["Liczba godzin"]) || 0) : 1;
        platformMap.set(plat, (platformMap.get(plat) || 0) + val);
    });

    const entries = Array.from(platformMap.entries())
        .map(([k, v]) => ({ platform: k, val: Math.round(v) }))
        .filter(item => item.val > 0);

    entries.sort((a, b) => b.val - a.val);

    const totalVal = entries.reduce((acc, curr) => acc + curr.val, 0);
    if (totalVal === 0) return '<p class="modal-hint">Brak danych dla wykresu kołowego.</p>';

    // Kolory pastelowe dla platform
    const platformPalette = [
        "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
        "#ec4899", "#06b6d4", "#14b8a6", "#84cc16", "#eab308"
    ];

    const radius = 70;
    const circumference = 2 * Math.PI * radius;
    let accumulatedOffset = 0;

    let svgCirclesHtml = "";
    const legendItemsHtml = entries.map((item, idx) => {
        const color = platformPalette[idx % platformPalette.length];
        const pct = ((item.val / totalVal) * 100).toFixed(1);
        const strokeLength = (item.val / totalVal) * circumference;
        const strokeDash = `${strokeLength} ${circumference - strokeLength}`;
        const offset = -accumulatedOffset;
        accumulatedOffset += strokeLength;

        const unit = isHours ? "h" : " gier";

        const tooltipRows = [
            { label: "Wartość", value: `${item.val}${unit}`, color: color },
            { label: "Udział procentowy", value: `${pct}%`, color: "#ffffff" },
            { label: "Profil", value: titlePrefix, color: "var(--color-primary)" }
        ];
        const rowsEncoded = encodeURIComponent(JSON.stringify(tooltipRows));

        svgCirclesHtml += `
            <circle cx="95" cy="95" r="${radius}" fill="transparent"
                    stroke="${color}" stroke-width="26"
                    stroke-dasharray="${strokeDash}"
                    stroke-dashoffset="${offset}"
                    class="chart-interactive-item"
                    data-tooltip-header="${escapeHtml(item.platform)}"
                    data-tooltip-rows="${rowsEncoded}">
            </circle>
        `;

        return `
            <div class="donut-legend-item chart-interactive-item" data-tooltip-header="${escapeHtml(item.platform)}" data-tooltip-rows="${rowsEncoded}">
                <span style="display:flex; align-items:center; gap:6px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                    <span class="legend-dot" style="background-color: ${color}; flex-shrink:0;"></span>
                    <span>${escapeHtml(item.platform)}</span>
                </span>
                <span style="font-weight:bold; color:var(--color-text-main); flex-shrink:0;">${item.val}${isHours ? "h" : ""} (${pct}%)</span>
            </div>
        `;
    }).join("");

    const topItem = entries[0];
    const topPct = ((topItem.val / totalVal) * 100).toFixed(0);

    return `
        <div class="donut-wrapper">
            <div class="donut-svg-box">
                <svg width="190" height="190" viewBox="0 0 190 190">
                    <circle cx="95" cy="95" r="${radius}" fill="transparent" stroke="var(--color-bg)" stroke-width="26"></circle>
                    <g transform="rotate(-90 95 95)">
                        ${svgCirclesHtml}
                    </g>
                </svg>
                <div class="donut-center-info">
                    <span class="donut-center-title">${escapeHtml(topItem.platform)}</span>
                    <span class="donut-center-val">${topItem.val}${isHours ? "h" : ""}</span>
                    <span class="donut-center-sub">${topPct}%</span>
                </div>
            </div>
            <div class="donut-legend-list">
                ${legendItemsHtml}
            </div>
        </div>
    `;
}

// 3. WYKRES LINIOWY SVG - OŚ CZASU UKOŃCZEŃ
function renderCompletionsTimelineChart(mmGames, nkGames, mmUser, nkUser) {
    const parseYearMonth = (game) => {
        const d = (game["Data ukończenia"] || "").trim();
        if (!d) return null;
        const match = d.match(/^(\d{4})[-/](\d{1,2})/);
        if (match) {
            return `${match[1]}-${match[2].padStart(2, '0')}`;
        }
        const yearMatch = d.match(/^(\d{4})/);
        if (yearMatch) {
            return `${yearMatch[1]}-01`;
        }
        return null;
    };

    const timeBuckets = new Map();

    const processGames = (games, isMM) => {
        games.forEach(g => {
            const ym = parseYearMonth(g);
            if (!ym) return;
            if (!timeBuckets.has(ym)) {
                timeBuckets.set(ym, { ym: ym, mm: 0, nk: 0, mmTitles: [], nkTitles: [] });
            }
            const bucket = timeBuckets.get(ym);
            if (isMM) {
                bucket.mm++;
                if (bucket.mmTitles.length < 3) bucket.mmTitles.push(g["Tytuł"]);
            } else {
                bucket.nk++;
                if (bucket.nkTitles.length < 3) bucket.nkTitles.push(g["Tytuł"]);
            }
        });
    };

    processGames(mmGames, true);
    processGames(nkGames, false);

    const sortedBuckets = Array.from(timeBuckets.values()).sort((a, b) => a.ym.localeCompare(b.ym));

    // Jeśli brak danych z datami, generujemy poglądowe przedziały
    if (sortedBuckets.length === 0) {
        return '<p class="modal-hint">Brak dat ukończenia gier w bazie do wygenerowania osi czasu.</p>';
    }

    // Ograniczamy do ostatnich 12 okresów dla przejrzystości
    const displayBuckets = sortedBuckets.slice(-12);

    let maxCount = 1;
    displayBuckets.forEach(b => {
        if (b.mm > maxCount) maxCount = b.mm;
        if (b.nk > maxCount) maxCount = b.nk;
    });

    const svgWidth = 500;
    const svgHeight = 200;
    const paddingLeft = 35;
    const paddingRight = 20;
    const paddingTop = 20;
    const paddingBottom = 35;

    const plotWidth = svgWidth - paddingLeft - paddingRight;
    const plotHeight = svgHeight - paddingTop - paddingBottom;

    const stepX = displayBuckets.length > 1 ? plotWidth / (displayBuckets.length - 1) : plotWidth / 2;

    const getY = (val) => paddingTop + plotHeight - ((val / maxCount) * plotHeight);

    let pathMM = "";
    let pathNK = "";
    let pointsHtml = "";
    let gridLinesHtml = "";

    // Linie poziome siatki
    for (let i = 0; i <= 3; i++) {
        const gridY = paddingTop + (plotHeight / 3) * i;
        const gridVal = Math.round(maxCount - (maxCount / 3) * i);
        gridLinesHtml += `
            <line x1="${paddingLeft}" y1="${gridY}" x2="${svgWidth - paddingRight}" y2="${gridY}" class="chart-gridline"></line>
            <text x="${paddingLeft - 8}" y="${gridY + 4}" text-anchor="end" class="chart-axis-label">${gridVal}</text>
        `;
    }

    displayBuckets.forEach((b, idx) => {
        const x = paddingLeft + idx * stepX;
        const yMM = getY(b.mm);
        const yNK = getY(b.nk);

        if (idx === 0) {
            pathMM += `M ${x} ${yMM}`;
            pathNK += `M ${x} ${yNK}`;
        } else {
            pathMM += ` L ${x} ${yMM}`;
            pathNK += ` L ${x} ${yNK}`;
        }

        // Etykieta osi X
        gridLinesHtml += `
            <text x="${x}" y="${svgHeight - 10}" text-anchor="middle" class="chart-axis-label">${b.ym.substring(2)}</text>
        `;

        // Punkty danych (kropki)
        const tooltipRowsMM = [
            { label: `${mmUser.name}`, value: `${b.mm} ukończonych`, color: mmUser.color },
            { label: "Przykłady", value: b.mmTitles.join(", ") || "-", color: "#ffffff" }
        ];
        const rowsMMEncoded = encodeURIComponent(JSON.stringify(tooltipRowsMM));

        const tooltipRowsNK = [
            { label: `${nkUser.name}`, value: `${b.nk} ukończonych`, color: nkUser.color },
            { label: "Przykłady", value: b.nkTitles.join(", ") || "-", color: "#ffffff" }
        ];
        const rowsNKEncoded = encodeURIComponent(JSON.stringify(tooltipRowsNK));

        pointsHtml += `
            <circle cx="${x}" cy="${yMM}" r="5" fill="${mmUser.color || '#13a71f'}" stroke="#ffffff" stroke-width="1.5" class="chart-data-point" data-tooltip-header="${escapeHtml(b.ym)} (${escapeHtml(mmUser.name)})" data-tooltip-rows="${rowsMMEncoded}"></circle>
            <circle cx="${x}" cy="${yNK}" r="5" fill="${nkUser.color || '#A81214'}" stroke="#ffffff" stroke-width="1.5" class="chart-data-point" data-tooltip-header="${escapeHtml(b.ym)} (${escapeHtml(nkUser.name)})" data-tooltip-rows="${rowsNKEncoded}"></circle>
        `;
    });

    return `
        <div style="width: 100%; overflow-x: auto;">
            <svg viewBox="0 0 ${svgWidth} ${svgHeight}" class="line-chart-svg" style="min-width: 380px;">
                ${gridLinesHtml}
                <path d="${pathMM}" stroke="${mmUser.color || '#13a71f'}" class="chart-line-path"></path>
                <path d="${pathNK}" stroke="${nkUser.color || '#A81214'}" class="chart-line-path"></path>
                ${pointsHtml}
            </svg>
        </div>
    `;
}

// 4. WYKRES SŁUPKOWY / HISTOGRAM OCEN
function renderRatingsComparisonBars(mmGames, nkGames, mmUser, nkUser) {
    const buckets = [
        { label: "9.0 - 10.0 (Wybitne)", min: 9.0, max: 10.0 },
        { label: "7.0 - 8.9 (Dobre)", min: 7.0, max: 8.99 },
        { label: "5.0 - 6.9 (Przeciętne)", min: 5.0, max: 6.99 },
        { label: "1.0 - 4.9 (Słabe)", min: 1.0, max: 4.99 },
        { label: "Brak oceny", min: -1, max: -1 }
    ];

    let maxVal = 1;
    const data = buckets.map(b => {
        const countMM = mmGames.filter(g => {
            const r = parseFloat(g["Ocena gry"]);
            if (isNaN(r) || r <= 0) return b.min === -1;
            return b.min !== -1 && r >= b.min && r <= b.max;
        }).length;

        const countNK = nkGames.filter(g => {
            const r = parseFloat(g["Ocena gry"]);
            if (isNaN(r) || r <= 0) return b.min === -1;
            return b.min !== -1 && r >= b.min && r <= b.max;
        }).length;

        if (countMM > maxVal) maxVal = countMM;
        if (countNK > maxVal) maxVal = countNK;

        return { label: b.label, mm: countMM, nk: countNK };
    });

    return data.map(item => {
        const mmPct = Math.round((item.mm / maxVal) * 100);
        const nkPct = Math.round((item.nk / maxVal) * 100);

        const tooltipRows = [
            { label: `${mmUser.name}`, value: `${item.mm} gier`, color: mmUser.color },
            { label: `${nkUser.name}`, value: `${item.nk} gier`, color: nkUser.color },
            { label: "Łącznie", value: `${item.mm + item.nk} gier`, color: "#ffffff" }
        ];
        const rowsEncoded = encodeURIComponent(JSON.stringify(tooltipRows));

        return `
            <div class="chart-dual-row chart-interactive-item" data-tooltip-header="${escapeHtml(item.label)}" data-tooltip-rows="${rowsEncoded}">
                <span class="chart-bar-label" style="font-size: 11px;">${escapeHtml(item.label)}</span>
                <div class="chart-dual-bars">
                    <div class="chart-single-bar-container">
                        <div class="chart-single-bar-fill" style="width: ${Math.max(mmPct, 3)}%; background-color: ${mmUser.color || '#13a71f'};"></div>
                        <span class="chart-single-bar-val">${item.mm}</span>
                    </div>
                    <div class="chart-single-bar-container">
                        <div class="chart-single-bar-fill" style="width: ${Math.max(nkPct, 3)}%; background-color: ${nkUser.color || '#A81214'};"></div>
                        <span class="chart-single-bar-val">${item.nk}</span>
                    </div>
                </div>
            </div>
        `;
    }).join("");
}

// ===================================================
// ZARZĄDZANIE PROFILAMI UŻYTKOWNIKÓW
// ===================================================

function switchUserProfile(user) {
    state.currentUser = user;
    applyUserTheme(user);
    showDashboardScreen();

    // Natychmiastowa aktualizacja nagłówka oraz belki profilu
    document.getElementById("activeProfileAvatar").src = user.avatar;
    document.getElementById("activeProfileName").textContent = user.name;
    document.getElementById("bannerProfileAvatar").src = user.avatar;
    document.getElementById("bannerProfileName").textContent = user.name;
    document.getElementById("bannerProfileSheet").textContent = user.sheetName;

    // Mobile avatar & code
    const mobileActiveAvatar = document.getElementById("mobileActiveAvatar");
    const mobileActiveName = document.getElementById("mobileActiveName");
    if (mobileActiveAvatar) mobileActiveAvatar.src = user.avatar;
    if (mobileActiveName) mobileActiveName.textContent = user.code;

    renderProfileDropdownMenu();
    loadGamesForUser(user.sheetName, false);
}

function renderProfileDropdownMenu() {
    const menu = document.getElementById("profileDropdownMenu");
    if (menu) menu.innerHTML = "";

    const mobileList = document.getElementById("mobileProfileList");
    if (mobileList) mobileList.innerHTML = "";

    const otherUsers = state.users.filter(u => !state.currentUser || u.code !== state.currentUser.code);

    if (menu) {
        if (otherUsers.length === 0) {
            menu.innerHTML = '<div style="padding:10px 14px; font-size:13px; color:#888;">Brak innych profili</div>';
        } else {
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
    }

    if (mobileList) {
        state.users.forEach(u => {
            const isActive = state.currentUser && state.currentUser.code === u.code;
            const btn = document.createElement("button");
            btn.className = `mobile-profile-item ${isActive ? "active" : ""}`;
            btn.innerHTML = `
                <img src="${u.avatar}" alt="${u.code}" class="mini-avatar" onerror="this.src='assets/matthewmill.PNG'">
                <span>${escapeHtml(u.name)}</span>
            `;
            btn.addEventListener("click", () => {
                const drawer = document.getElementById("mobileNavDrawer");
                if (drawer) drawer.style.display = "none";
                switchUserProfile(u);
            });
            mobileList.appendChild(btn);
        });
    }
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
            fetchSettingsAndStats(false); // Wczytanie tabel ustawień w tle
            return;
        }
    }

    // Resetowanie widoków i statystyk na czas pobierania, aby nie pokazywać danych poprzedniego gracza
    state.games = [];
    document.getElementById("statTotalGames").textContent = "-";
    document.getElementById("statCompletedGames").textContent = "-";
    document.getElementById("statTotalHours").textContent = "-";
    document.getElementById("statAvgRating").textContent = "-";
    const showcaseGrid = document.getElementById("showcaseGrid");
    if (showcaseGrid) showcaseGrid.innerHTML = '<p class="showcase-empty-hint">Wczytywanie gabloty...</p>';

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
            fetchSettingsAndStats(false); // Wczytanie tabel ustawień w tle zaraz po załadowaniu gier
        } else {
            console.error("[NKMM Baza Gier] Serwer zwrócił błąd w odpowiedzi:", response.message);
            resultsCount.innerHTML = `Błąd: ${escapeHtml(response.message || "Nie udało się pobrać gier")} <button type="button" class="btn-link btn-reload-games" data-sheet="${escapeHtml(sheetName)}" style="color: var(--color-primary); font-weight: bold; margin-left: 8px;">[Spróbuj ponownie]</button>`;
            skeletonLoader.style.display = "none";
        }
    } catch (error) {
        console.error("[NKMM Baza Gier] Błąd sieciowy / wyjątek w loadGamesForUser:", error);
        resultsCount.innerHTML = `Błąd sieciowy podczas pobierania danych. <button type="button" class="btn-link btn-reload-games" data-sheet="${escapeHtml(sheetName)}" style="color: var(--color-primary); font-weight: bold; margin-left: 8px;">[Spróbuj ponownie]</button>`;
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

        // Tagi: wykrycie Demo i wykluczenie Demo oraz Gablota z pastylek
        const rawTags = (game["Kolekcje"] || "").split(",").map(t => t.trim()).filter(Boolean);
        const isDemo = rawTags.some(t => t.toLowerCase() === "demo");
        const visibleTags = rawTags.filter(t => {
            const low = t.toLowerCase();
            return low !== "demo" && low !== "gablota";
        });

        const demoBadgeHtml = isDemo ? `<span class="demo-tag-label">Demo</span>` : "";
        const tagsHtml = visibleTags.map(t => {
            const col = getTagColor(t);
            return `<span class="tag-pill" style="background-color: ${col.bg}; border-color: ${col.border}; color: ${col.text};">${escapeHtml(t)}</span>`;
        }).join("");

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
                    <h3 class="game-title">${title}${demoBadgeHtml}</h3>
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
            updateMobileFiltersBadge();
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

function updateMobileFiltersBadge() {
    const badge = document.getElementById("mobileFiltersBadge");
    if (!badge) return;
    const total = state.filters.statuses.size + state.filters.platforms.size + state.filters.collections.size;
    if (total > 0) {
        badge.textContent = total;
        badge.style.display = "inline-block";
    } else {
        badge.style.display = "none";
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
    updateMobileFiltersBadge();
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
            try {
                localStorage.setItem(CACHE_KEYS.ADMIN_AUTH, enteredPass);
            } catch (e) {}

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
    try {
        localStorage.removeItem(CACHE_KEYS.ADMIN_AUTH);
    } catch (e) {}
    applyAdminUiState();
    renderGamesGrid();
    updateProfileBanner();
}

function applyAdminUiState() {
    const syncStatusWrapper = document.getElementById("syncStatusWrapper");
    const mobileSyncWrapper = document.getElementById("mobileSyncWrapper");
    const btnAdminLogin = document.getElementById("btnAdminLoginModal");
    const adminActionsBar = document.getElementById("adminActionsBar");
    const btnEditShowcase = document.getElementById("btnEditShowcase");
    const adminOnlyBlocks = document.querySelectorAll(".admin-only-block");
    const mobileAdminLabel = document.getElementById("mobileAdminLabel");

    if (state.isAdmin) {
        if (syncStatusWrapper) syncStatusWrapper.style.display = "flex";
        if (mobileSyncWrapper) mobileSyncWrapper.style.display = "flex";
        if (btnAdminLogin) btnAdminLogin.style.display = "none";
        if (adminActionsBar) adminActionsBar.style.display = "flex";
        if (btnEditShowcase) btnEditShowcase.style.display = "inline-block";
        if (mobileAdminLabel) mobileAdminLabel.textContent = "Wyloguj administratora";
        adminOnlyBlocks.forEach(el => el.style.display = "flex");
    } else {
        if (syncStatusWrapper) syncStatusWrapper.style.display = "none";
        if (mobileSyncWrapper) mobileSyncWrapper.style.display = "none";
        if (btnAdminLogin) btnAdminLogin.style.display = "inline-block";
        if (adminActionsBar) adminActionsBar.style.display = "none";
        if (btnEditShowcase) btnEditShowcase.style.display = "none";
        if (mobileAdminLabel) mobileAdminLabel.textContent = "Dostęp administratora";
        adminOnlyBlocks.forEach(el => el.style.display = "none");
    }
}

// ===================================================
// DODAWANIE / EDYCJA GRY (OPTIMISTIC UI + UNCHOSEN DIRTY PROTECTION)
// ===================================================

function getGameFormSnapshot() {
    return {
        title: (document.getElementById("formGameTitle").value || "").trim(),
        status: (document.getElementById("formGameStatus").value || "").trim(),
        platform: (document.getElementById("formGamePlatform").value || "").trim(),
        ratingFabuła: (document.getElementById("formRatingFabuła").value || "").trim(),
        ratingGrafika: (document.getElementById("formRatingGrafika").value || "").trim(),
        ratingMechanika: (document.getElementById("formRatingMechanika").value || "").trim(),
        ratingOgólna: (document.getElementById("formRatingOgólna").value || "").trim(),
        hours: (document.getElementById("formHours").value || "").trim(),
        completionDate: (document.getElementById("formCompletionDate").value || "").trim(),
        collections: (document.getElementById("formCollections").value || "").trim(),
        review: (document.getElementById("formReview").value || "").trim()
    };
}

function isGameFormDirty() {
    if (!state.formInitialSnapshot) return false;
    const current = getGameFormSnapshot();
    return JSON.stringify(current) !== JSON.stringify(state.formInitialSnapshot);
}

function attemptCloseGameEditModal() {
    if (isGameFormDirty()) {
        openModal("unsavedChangesModal");
    } else {
        state.formInitialSnapshot = null;
        closeModal("gameEditModal");
    }
}

function openGameEditModal(game = null) {
    if (!state.isAdmin) return;

    const form = document.getElementById("gameEditForm");
    form.reset();
    document.getElementById("gameEditError").style.display = "none";

    if (game) {
        document.getElementById("gameEditModalTitle").textContent = "Edycja gry";
        document.getElementById("formGameId").value = game.id || "";
        document.getElementById("formGameTitle").value = game["Tytuł"] || "";
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
        document.getElementById("formCollections").value = "";
    }

    populateSelectOptionsForForm();

    if (game) {
        document.getElementById("formGameStatus").value = game["Stan"] || "";
        document.getElementById("formGamePlatform").value = game["Platforma"] || "";
    }

    // Zapisanie migawki początkowego stanu formularza do wykrywania niezapisanych zmian
    state.formInitialSnapshot = getGameFormSnapshot();

    openModal("gameEditModal");
}

function populateSelectOptionsForForm() {
    const statusSelect = document.getElementById("formGameStatus");
    const platformSelect = document.getElementById("formGamePlatform");
    const tagsContainer = document.getElementById("formAvailableTagsContainer");
    const collectionsInput = document.getElementById("formCollections");

    // 1. Stany ze słownika state.settings.stan (lub domyślne)
    statusSelect.innerHTML = "";
    const settingsStatuses = (state.settings.stan && state.settings.stan.rows)
        ? state.settings.stan.rows.map(r => r["Stan"]).filter(Boolean)
        : [];
    const defaultStatuses = ["Gram teraz", "Chcę zagrać", "Singleplayer", "Multiplayer", "Wstrzymana", "Pozostawiona", "Ukończona", "Ukończona+", "100'%", "PLATYNA"];
    const statusesToUse = settingsStatuses.length > 0 ? settingsStatuses : defaultStatuses;
    statusesToUse.forEach(st => {
        const opt = document.createElement("option");
        opt.value = st;
        opt.textContent = st;
        statusSelect.appendChild(opt);
    });

    // 2. Platformy ze słownika state.settings.platformy (lub domyślne)
    platformSelect.innerHTML = "";
    const settingsPlatforms = (state.settings.platformy && state.settings.platformy.rows)
        ? state.settings.platformy.rows.map(r => r["Platformy"]).filter(Boolean)
        : [];
    const defaultPlatforms = ["Komputer", "Playstation 5", "Switch", "Switch 2", "Mobilka", "Inne"];
    const platformsToUse = settingsPlatforms.length > 0 ? settingsPlatforms : defaultPlatforms;
    platformsToUse.forEach(pl => {
        const opt = document.createElement("option");
        opt.value = pl;
        opt.textContent = pl;
        platformSelect.appendChild(opt);
    });

    // 3. Tagi ze słownika state.settings.kolekcje + z gier w bazie + tagi specjalne
    const allTags = new Set(["Demo", "Gablota"]);
    if (state.settings.kolekcje && state.settings.kolekcje.rows) {
        state.settings.kolekcje.rows.forEach(r => {
            const val = (r["Kolekcje"] || "").trim();
            if (val) allTags.add(val);
        });
    }
    state.games.forEach(g => {
        if (g["Kolekcje"]) {
            g["Kolekcje"].split(",").forEach(t => {
                const clean = t.trim();
                if (clean) allTags.add(clean);
            });
        }
    });

    if (tagsContainer) {
        tagsContainer.innerHTML = "";
        const sortedTags = Array.from(allTags).sort((a, b) => a.localeCompare(b));

        const getSelectedTags = () => {
            return (collectionsInput.value || "")
                .split(",")
                .map(t => t.trim().toLowerCase())
                .filter(Boolean);
        };

        const refreshTagPills = () => {
            const currentSelected = getSelectedTags();
            tagsContainer.querySelectorAll(".form-tag-badge").forEach(badge => {
                const tagVal = badge.getAttribute("data-tag").toLowerCase();
                const isSelected = currentSelected.includes(tagVal);
                if (isSelected) {
                    badge.classList.add("selected");
                    badge.style.outline = "2px solid var(--color-primary)";
                    badge.style.fontWeight = "bold";
                } else {
                    badge.classList.remove("selected");
                    badge.style.outline = "none";
                    badge.style.fontWeight = "normal";
                }
            });
        };

        sortedTags.forEach(tag => {
            const col = getTagColor(tag);
            const badge = document.createElement("button");
            badge.type = "button";
            badge.className = "form-tag-badge tag-pill";
            badge.setAttribute("data-tag", tag);
            badge.style.backgroundColor = col.bg;
            badge.style.borderColor = col.border;
            badge.style.color = col.text;
            badge.style.cursor = "pointer";
            badge.style.fontSize = "12px";
            badge.style.padding = "3px 8px";
            badge.style.borderRadius = "4px";
            badge.textContent = tag;

            badge.addEventListener("click", (e) => {
                e.preventDefault();
                const currentArr = (collectionsInput.value || "")
                    .split(",")
                    .map(t => t.trim())
                    .filter(Boolean);
                const tagIdx = currentArr.findIndex(t => t.toLowerCase() === tag.toLowerCase());
                if (tagIdx !== -1) {
                    currentArr.splice(tagIdx, 1);
                } else {
                    currentArr.push(tag);
                }
                collectionsInput.value = currentArr.join(", ");
                refreshTagPills();
            });

            tagsContainer.appendChild(badge);
        });

        refreshTagPills();

        collectionsInput.oninput = refreshTagPills;
    }
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
    state.formInitialSnapshot = null;
    closeModal("gameEditModal");

    const taskTitle = isEdit ? `Edycja gry: ${title}` : `Dodanie gry: ${title}`;
    const apiParams = {
        action: isEdit ? "editGame" : "addGame",
        user: currentSheet,
        gameId: gameId,
        gameDetails: JSON.stringify(gameDetails)
    };

    enqueueSyncTask(
        taskTitle,
        async () => {
            const res = await sendApiRequest(apiParams);

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
        },
        apiParams
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

    const apiParams = {
        action: "deleteGame",
        user: currentSheet,
        gameId: gameId
    };

    enqueueSyncTask(
        `Usunięcie gry: ${title}`,
        async () => {
            const res = await sendApiRequest(apiParams);
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
        },
        apiParams
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

    const apiParams = {
        action: "addUser",
        userName: userName,
        userCode: userCode,
        tabColor: userColor
    };

    enqueueSyncTask(
        `Tworzenie profilu: ${userCode}`,
        async () => {
            const res = await sendApiRequest(apiParams);

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
        },
        apiParams
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
    renderUsersSettingsTable();
}

function renderUsersSettingsTable() {
    const container = document.getElementById("tableUzytkownicyContainer");
    if (!container) return;

    if (!state.users || state.users.length === 0) {
        container.innerHTML = "<p style='padding:10px; color:#888;'>Brak danych użytkowników.</p>";
        return;
    }

    let html = "<table class='data-table'><thead><tr><th>Awatar</th><th>Kod</th><th>Nazwa gracza</th><th>Arkusz kalkulacyjny</th></tr></thead><tbody>";
    state.users.forEach(u => {
        html += `
            <tr>
                <td><img src="${u.avatar}" alt="${u.code}" class="mini-avatar" onerror="this.src='assets/matthewmill.PNG'"></td>
                <td><strong>${escapeHtml(u.code)}</strong></td>
                <td>${escapeHtml(u.name)}</td>
                <td>${escapeHtml(u.sheetName)}</td>
            </tr>
        `;
    });
    html += "</tbody></table>";
    container.innerHTML = html;
}

function renderTable(containerId, tableData, category = null) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!tableData || !tableData.headers || tableData.headers.length === 0) {
        container.innerHTML = "<p style='padding:10px; color:#888;'>Brak danych tabeli.</p>";
        return;
    }

    // Filtrujemy nagłówki - w Ustawieniach wyświetlamy TYLKO kolumny konfiguracyjne (Lp, Nazwa, Opis), ukrywając kolumny statystyczne graczy
    let displayedHeaders = tableData.headers;
    if (category) {
        displayedHeaders = tableData.headers.filter(h => {
            const low = h.toLowerCase();
            if (h.startsWith(category + " ") || low.includes("godziny na platformę") || low.includes("stan ") || low.includes("kolekcje ") || low.includes("platformy ")) {
                return false;
            }
            return true;
        });
    }

    let html = "<table class='data-table'><thead><tr>";
    displayedHeaders.forEach(h => {
        html += `<th>${escapeHtml(h)}</th>`;
    });
    if (state.isAdmin && category) {
        html += "<th>Akcje</th>";
    }
    html += "</tr></thead><tbody>";

    const descColName = category === "Stan" ? "Opis stanu" : (category === "Kolekcje" ? "Opis kolekcji" : null);

    tableData.rows.forEach(row => {
        html += "<tr>";
        displayedHeaders.forEach(h => {
            const val = row[h] !== undefined && row[h] !== null ? row[h] : "";
            html += `<td>${escapeHtml(String(val))}</td>`;
        });

        if (state.isAdmin && category) {
            const primaryVal = row[category] || "";
            const descVal = descColName ? (row[descColName] || "") : "";
            html += `
                <td style="white-space: nowrap;">
                    <button type="button" class="btn-card-action btn-card-edit btn-setting-edit" data-category="${escapeHtml(category)}" data-val="${escapeHtml(primaryVal)}" data-desc="${escapeHtml(descVal)}">Edytuj</button>
                    <button type="button" class="btn-card-action btn-card-delete btn-setting-delete" data-category="${escapeHtml(category)}" data-val="${escapeHtml(primaryVal)}">Usuń</button>
                </td>
            `;
        }
        html += "</tr>";
    });

    html += "</tbody></table>";
    container.innerHTML = html;
}

window.openEditSettingModal = function(category, value, description) {
    if (!state.isAdmin) return;
    document.getElementById("editSettingCategory").value = category;
    document.getElementById("editSettingOldValue").value = value;
    document.getElementById("editSettingNewValue").value = value;
    document.getElementById("editSettingModalTitle").textContent = `Edytuj: ${category}`;
    document.getElementById("editSettingValueLabel").textContent = `${category}:`;
    
    const descGroup = document.getElementById("editSettingDescGroup");
    const descInput = document.getElementById("editSettingNewDesc");
    if (category === "Platformy") {
        descGroup.style.display = "none";
        descInput.value = "";
    } else {
        descGroup.style.display = "block";
        descInput.value = description || "";
    }

    openModal("editSettingModal");
};

function handleSaveEditSetting(e) {
    e.preventDefault();
    if (!state.isAdmin) return;

    const category = document.getElementById("editSettingCategory").value;
    const oldValue = document.getElementById("editSettingOldValue").value;
    const newValue = document.getElementById("editSettingNewValue").value.trim();
    const newDesc = document.getElementById("editSettingNewDesc").value.trim();

    if (!newValue) {
        alert("Wartość nie może być pusta.");
        return;
    }

    closeModal("editSettingModal");

    // Optimistic UI - natychmiastowa aktualizacja w pamięci
    const catData = getSettingsCategoryData(category);
    let previousRows = null;
    const descColName = category === "Stan" ? "Opis stanu" : (category === "Kolekcje" ? "Opis kolekcji" : null);

    if (catData && catData.rows) {
        previousRows = JSON.parse(JSON.stringify(catData.rows));
        catData.rows.forEach(r => {
            if (String(r[category]) === String(oldValue)) {
                r[category] = newValue;
                if (descColName) {
                    r[descColName] = newDesc;
                }
            }
        });
        renderStatsTables();
        populateFilterOptions();
    }

    // Aktualizacja w bieżącej bibliotece gier (jeśli zmieniono stan lub platformę)
    if (category === "Stan" || category === "Platformy") {
        state.games.forEach(g => {
            if (g[category] === oldValue) {
                g[category] = newValue;
            }
        });
        renderGamesGrid();
    }

    const apiParams = {
        action: "updateSettingsItem",
        category: category,
        oldValue: oldValue,
        newValue: newValue,
        newDescription: newDesc
    };

    enqueueSyncTask(
        `Edycja słownika [${category}]: ${oldValue} -> ${newValue}`,
        async () => {
            const res = await sendApiRequest(apiParams);
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
        },
        apiParams
    );
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

    const apiParams = {
        action: "addSettingsItem",
        category: category,
        value: val,
        description: desc
    };

    enqueueSyncTask(
        `Dodawanie do słownika [${category}]: ${val}`,
        async () => {
            const res = await sendApiRequest(apiParams);
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
        },
        apiParams
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

    const apiParams = {
        action: "deleteSettingsItem",
        category: category,
        value: value
    };

    enqueueSyncTask(
        `Usuwanie ze słownika [${category}]: ${value}`,
        async () => {
            const res = await sendApiRequest(apiParams);
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
        },
        apiParams
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