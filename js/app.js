/**
 * NKMM Baza Gier - Główny skrypt aplikacji (ES6+)
 * Wytyczne: Czysty JavaScript, brak emotek, optymalizacja mobilna,
 * optymistyczna synchronizacja w tle (Optimistic UI) z kolejką zadań,
 * belka profilu ze statystykami i edytowalną gablotą gier (w stylu Steam),
 * 2 główne zakładki: Baza gier oraz Wykresy.
 */

// Adres wdrożonej aplikacji Google Apps Script
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwMoziDDLE2_1OcBPpwt4kNhF1jLmbPkumknpOmAeAgsJ5W_Vud6V12WrLjbOrJo43e/exec";

// Klucz RAWG API do pobierania okładek gier
const RAWG_API_KEY = "1deb5e6875fb4296b30f7e86ea3c562b";

async function fetchRawgCoverDirect(title) {
    if (!title) return "";
    try {
        let cleanTitle = title.toString().trim();
        cleanTitle = cleanTitle.replace(/\s*[\(\[][^\)\]]*[\)\]]/g, "").trim();
        if (!cleanTitle) cleanTitle = title.toString().trim();

        const url = "https://api.rawg.io/api/games?key=" + RAWG_API_KEY + "&search=" + encodeURIComponent(cleanTitle) + "&page_size=1";
        const res = await fetch(url);
        if (res.ok) {
            const data = await res.json();
            if (data.results && data.results.length > 0) {
                if (data.results[0].background_image) return data.results[0].background_image;
                if (data.results[0].short_screenshots && data.results[0].short_screenshots.length > 0) {
                    return data.results[0].short_screenshots[0].image || "";
                }
            }
        }
    } catch (e) {}
    return "";
}

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
        sort: "updated_desc",
        group: "none"
    }
};

// ===================================================
// INICJALIZACJA APLIKACJI
// ===================================================

document.addEventListener("DOMContentLoaded", () => {
    initEvents();
    initSessionCache();
    loadSyncQueueFromStorage();
    checkAdminStatusForUser(state.currentUser);
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

    const btnMobileSyncCovers = document.getElementById("btnMobileSyncCovers");
    if (btnMobileSyncCovers) {
        btnMobileSyncCovers.addEventListener("click", () => {
            closeMobileDrawer();
            handleSyncMissingCovers();
        });
    }

    const btnMobileAdmin = document.getElementById("btnMobileAdmin");
    if (btnMobileAdmin) btnMobileAdmin.addEventListener("click", () => {
        closeMobileDrawer();
        if (state.isAdmin) {
            handleAdminLogout();
        } else {
            openModal("adminLoginModal");
        }
    });

    const btnMobileAddGame = document.getElementById("btnMobileAddGame");
    if (btnMobileAddGame) {
        btnMobileAddGame.addEventListener("click", () => openGameEditModal(null));
    }

    const btnMobileRefresh = document.getElementById("btnMobileRefresh");
    if (btnMobileRefresh) btnMobileRefresh.addEventListener("click", handleForceRefreshAll);

    // Przełącznik widoczności filtrów (Desktop + Mobile)
    const btnToggleFilters = document.getElementById("btnToggleFilters") || document.getElementById("btnToggleMobileFilters");
    const filtersRow = document.getElementById("filtersRow");
    const filterCaret = document.getElementById("filterToggleCaret");
    if (btnToggleFilters && filtersRow) {
        btnToggleFilters.addEventListener("click", () => {
            const isOpen = filtersRow.classList.toggle("open");
            filtersRow.classList.toggle("mobile-open", isOpen);
            btnToggleFilters.classList.toggle("active", isOpen);
            filtersRow.style.display = isOpen ? "flex" : "none";
            if (filterCaret) filterCaret.textContent = isOpen ? "^" : "v";
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

    // Obsługa edycji, usuwania i menu 3 kropek ze słowników (Ustawienia Bazy)
    document.addEventListener("click", (e) => {
        const menuBtn = e.target.closest(".btn-table-menu");
        if (menuBtn) {
            const parentContainer = menuBtn.closest(".table-menu-container");
            const isOpen = parentContainer.classList.contains("active");
            document.querySelectorAll(".table-menu-container.active").forEach(el => el.classList.remove("active"));
            if (!isOpen) {
                parentContainer.classList.add("active");
            }
            return;
        }

        // Kliknięcie w opcję lub poza menu zamyka wszystkie aktywne menu 3 kropek
        document.querySelectorAll(".table-menu-container.active").forEach(el => el.classList.remove("active"));

        const editBtn = e.target.closest(".btn-setting-edit");
        if (editBtn) {
            const cat = editBtn.getAttribute("data-category");
            const val = editBtn.getAttribute("data-val");
            const desc = editBtn.getAttribute("data-desc");
            const color = editBtn.getAttribute("data-color");
            openEditSettingModal(cat, val, desc, color);
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

    const groupSelect = document.getElementById("groupSelect");
    if (groupSelect) {
        groupSelect.addEventListener("change", (e) => {
            state.filters.group = e.target.value;
            renderGamesGrid();
        });
    }

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
    document.getElementById("btnAddStan").addEventListener("click", () => handleAddSetting("Stan", "newStanVal", "newStanDesc", "newStanColor"));
    document.getElementById("btnAddKol").addEventListener("click", () => handleAddSetting("Kolekcje", "newKolVal", "newKolDesc"));
    document.getElementById("btnAddPlat").addEventListener("click", () => handleAddSetting("Platformy", "newPlatVal"));

    // Synchronizacja wyboru koloru nowego stanu w Ustawieniach
    const newStanColorInput = document.getElementById("newStanColor");
    const newStanColorPicker = document.getElementById("newStanColorPicker");
    if (newStanColorPicker && newStanColorInput) {
        newStanColorPicker.addEventListener("input", (e) => {
            newStanColorInput.value = e.target.value;
        });
        newStanColorInput.addEventListener("input", (e) => {
            const val = e.target.value.trim();
            if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
                newStanColorPicker.value = val;
            }
        });
    }

    // Synchronizacja wyboru koloru w modalu edycji stanu
    const editSettingNewColor = document.getElementById("editSettingNewColor");
    const editSettingNewColorPicker = document.getElementById("editSettingNewColorPicker");
    if (editSettingNewColorPicker && editSettingNewColor) {
        editSettingNewColorPicker.addEventListener("input", (e) => {
            editSettingNewColor.value = e.target.value;
        });
        editSettingNewColor.addEventListener("input", (e) => {
            const val = e.target.value.trim();
            if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
                editSettingNewColorPicker.value = val;
            }
        });
    }

    // Podgląd pastelowy na żywo w formularzu gry po zmianie stanu lub tytułu
    const formGameStatusSelect = document.getElementById("formGameStatus");
    const formTitleInput = document.getElementById("formGameTitle");

    if (formGameStatusSelect) {
        formGameStatusSelect.addEventListener("change", () => {
            updateFormColorPreview();
        });
    }

    if (formTitleInput) {
        formTitleInput.addEventListener("input", (e) => {
            updateFormColorPreview(e.target.value.trim());
        });
    }

    // Obsługa pobierania okładek RAWG w formularzu
    const btnFetchCoverSingle = document.getElementById("btnFetchCoverSingle");
    if (btnFetchCoverSingle) {
        btnFetchCoverSingle.addEventListener("click", async () => {
            const titleInput = document.getElementById("formGameTitle");
            const imageInput = document.getElementById("formGameImage");
            const previewBox = document.getElementById("formCoverPreviewBox");
            const previewImg = document.getElementById("formCoverPreviewImg");

            const title = (titleInput ? titleInput.value : "").trim();
            if (!title) {
                alert("Wpisz najpierw tytuł gry, aby wyszukać okładkę.");
                return;
            }

            btnFetchCoverSingle.disabled = true;
            btnFetchCoverSingle.textContent = "Szukanie...";

            try {
                const res = await sendApiRequest({ action: "fetchCover", title: title });
                if (res.status === "success" && res.data && res.data.coverUrl) {
                    if (imageInput) imageInput.value = res.data.coverUrl;
                    if (previewImg && previewBox) {
                        previewImg.src = res.data.coverUrl;
                        previewBox.style.display = "block";
                    }
                } else {
                    alert(`Nie znaleziono okładki w RAWG dla tytułu: "${title}"`);
                }
            } catch (err) {
                alert("Błąd podczas pobierania okładki z RAWG.");
            } finally {
                btnFetchCoverSingle.disabled = false;
                btnFetchCoverSingle.textContent = "Pobierz z RAWG";
            }
        });
    }

    const formGameImage = document.getElementById("formGameImage");
    if (formGameImage) {
        formGameImage.addEventListener("input", (e) => {
            const previewBox = document.getElementById("formCoverPreviewBox");
            const previewImg = document.getElementById("formCoverPreviewImg");
            const url = e.target.value.trim();
            if (url && previewBox && previewImg) {
                previewImg.src = url;
                previewBox.style.display = "block";
            } else if (previewBox) {
                previewBox.style.display = "none";
            }
        });
    }

    // Masowa synchronizacja brakujących okładek (RAWG)
    const btnSyncCovers = document.getElementById("btnSyncCovers");
    if (btnSyncCovers) {
        btnSyncCovers.addEventListener("click", handleSyncMissingCovers);
    }

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
            const hasColorCol = parsed && parsed.stan && Array.isArray(parsed.stan.rows) && parsed.stan.rows.some(r => r["Kolor"] !== undefined || r["kolor"] !== undefined);
            if (hasColorCol) {
                state.settings = parsed;
                state.cache.settings = parsed;
            } else {
                sessionStorage.removeItem(CACHE_KEYS.SETTINGS);
            }
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
    const container = document.getElementById("showcaseShelfContainer") || document.getElementById("showcaseGrid");
    if (!container || !state.currentUser) return;

    // Aplikacja pozwala na maksymalnie 8 wyróżnionych gier w gablocie
    const showcaseGames = state.games.filter(g => isGameInShowcase(g)).slice(0, 8);

    if (showcaseGames.length === 0) {
        container.innerHTML = '<p class="showcase-empty-hint">Brak wyróżnionych gier w gablocie. Dodaj tag "Gablota" w edycji gry lub użyj przycisku powyżej.</p>';
        return;
    }

    container.innerHTML = "";
    const showcaseShelf = document.createElement("div");
    showcaseShelf.className = "game-shelf-unit shelf-unit-showcase";

    // GÓRNY POZIOM: 3 poziome po lewej + 1 pionowa pochylona o 30 stopni po prawej
    const topTier = document.createElement("div");
    topTier.className = "shelf-tier tier-top";

    const topLeftStack = document.createElement("div");
    topLeftStack.className = "shelf-stack stack-left";
    for (let idx = 0; idx < 3; idx++) {
        const game = showcaseGames[idx];
        if (game) {
            topLeftStack.appendChild(createSpineElement(game, "horizontal"));
        }
    }
    topTier.appendChild(topLeftStack);

    const topRightSlot = document.createElement("div");
    topRightSlot.className = "shelf-lean-slot";
    const topLeanGame = showcaseGames[3];
    if (topLeanGame) {
        topRightSlot.appendChild(createSpineElement(topLeanGame, "vertical", "leaned-right"));
    }
    topTier.appendChild(topRightSlot);

    showcaseShelf.appendChild(topTier);

    // DOLNY POZIOM: 1 pionowa po lewej + 3 poziome po prawej
    const bottomTier = document.createElement("div");
    bottomTier.className = "shelf-tier tier-bottom";

    const bottomLeftSlot = document.createElement("div");
    bottomLeftSlot.className = "shelf-vertical-slot";
    const bottomStandGame = showcaseGames[4];
    if (bottomStandGame) {
        bottomLeftSlot.appendChild(createSpineElement(bottomStandGame, "vertical", "upright"));
    }
    bottomTier.appendChild(bottomLeftSlot);

    const bottomRightStack = document.createElement("div");
    bottomRightStack.className = "shelf-stack stack-right";
    for (let idx = 5; idx < 8; idx++) {
        const game = showcaseGames[idx];
        if (game) {
            bottomRightStack.appendChild(createSpineElement(game, "horizontal"));
        }
    }
    bottomTier.appendChild(bottomRightStack);

    showcaseShelf.appendChild(bottomTier);

    container.appendChild(showcaseShelf);
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

        const checkbox = label.querySelector("input");
        checkbox.addEventListener("change", () => {
            updateShowcaseCheckboxesLimit();
        });

        checklist.appendChild(label);
    });

    const updateShowcaseCheckboxesLimit = () => {
        const allCheckboxes = Array.from(checklist.querySelectorAll("input[type='checkbox']"));
        const checkedBoxes = allCheckboxes.filter(cb => cb.checked);
        const count = checkedBoxes.length;
        const countEl = document.getElementById("showcaseSelectedCount");
        if (countEl) countEl.textContent = `(${count}/8)`;

        allCheckboxes.forEach(cb => {
            if (!cb.checked) {
                cb.disabled = count >= 8;
                cb.parentElement.style.opacity = count >= 8 ? "0.45" : "1";
                cb.parentElement.style.cursor = count >= 8 ? "not-allowed" : "pointer";
            } else {
                cb.disabled = false;
                cb.parentElement.style.opacity = "1";
                cb.parentElement.style.cursor = "pointer";
            }
        });
    };

    updateShowcaseCheckboxesLimit();
    openModal("showcaseEditModal");
}

function filterShowcaseChecklist(query) {
    const items = document.querySelectorAll(".showcase-check-item");
    items.forEach(item => {
        const text = item.textContent.toLowerCase();
        item.style.display = text.includes(query) ? "flex" : "none";
    });
}

function getCurrentDateTimeString() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const yyyy = d.getFullYear();
    const mm = pad(d.getMonth() + 1);
    const dd = pad(d.getDate());
    const hh = pad(d.getHours());
    const min = pad(d.getMinutes());
    const ss = pad(d.getSeconds());
    return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
}

function handleSaveShowcase() {
    if (!state.currentUser) return;

    const checkboxes = document.querySelectorAll("#showcaseGamesChecklist input[type='checkbox']");
    const selectedIds = new Set();
    checkboxes.forEach(cb => {
        if (cb.checked && selectedIds.size < 8) selectedIds.add(cb.value);
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
            const nowTime = getCurrentDateTimeString();
            game["Aktualizacja"] = nowTime;
            const gameDetails = { ...game, "Aktualizacja": nowTime };
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
                        <div class="chart-single-bar-track">
                            <div class="chart-single-bar-fill" style="width: ${Math.max(mmPct, 3)}%; background-color: ${mmUser.color || '#13a71f'};"></div>
                        </div>
                        <span class="chart-single-bar-val">${item.mm}</span>
                    </div>
                    <div class="chart-single-bar-container">
                        <div class="chart-single-bar-track">
                            <div class="chart-single-bar-fill" style="width: ${Math.max(nkPct, 3)}%; background-color: ${nkUser.color || '#A81214'};"></div>
                        </div>
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
        <div style="width: 100%; overflow: hidden;">
            <svg viewBox="0 0 ${svgWidth} ${svgHeight}" class="line-chart-svg" style="width: 100%; height: auto; max-width: 100%; display: block;">
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
                        <div class="chart-single-bar-track">
                            <div class="chart-single-bar-fill" style="width: ${Math.max(mmPct, 3)}%; background-color: ${mmUser.color || '#13a71f'};"></div>
                        </div>
                        <span class="chart-single-bar-val">${item.mm}</span>
                    </div>
                    <div class="chart-single-bar-container">
                        <div class="chart-single-bar-track">
                            <div class="chart-single-bar-fill" style="width: ${Math.max(nkPct, 3)}%; background-color: ${nkUser.color || '#A81214'};"></div>
                        </div>
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
    checkAdminStatusForUser(user);
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
// Kolejność priorytetów stanów przy wyświetlaniu grup na półkach
const STATUS_GROUP_ORDER = [
    "Gram teraz",
    "Singleplayer",
    "Multiplayer",
    "Chcę zagrać",
    "Ukończona",
    "Ukończona+",
    "100'%",
    "100%",
    "PLATYNA",
    "Wstrzymana",
    "Pozostawiona",
    "Porzucona",
    "Bezkresna"
];

function formatSpineTitle(title, maxChars = 20) {
    if (!title) return "";
    const clean = title.trim();
    if (clean.length <= maxChars) return clean;
    
    // Obcinamy do maxChars i ucinamy do ostatniego pełnego słowa
    const slice = clean.substring(0, maxChars);
    const lastSpace = slice.lastIndexOf(" ");
    if (lastSpace > 2) {
        return slice.substring(0, lastSpace);
    }
    return slice;
}

function isMobileView() {
    return window.innerWidth <= 768;
}

function selectGameForMonitor(game, spineEl = null) {
    if (!game) return;

    if (isMobileView()) {
        openGameDetailsModal(game);
        return;
    }

    if (state.selectedGame && String(state.selectedGame.id) === String(game.id)) {
        // Ponowne kliknięcie w tę samą grę - odznaczenie (deselect)
        state.selectedGame = null;
        document.querySelectorAll(".game-spine.active").forEach(el => el.classList.remove("active"));
        renderMonitorGameDetails(null);
        return;
    }

    state.selectedGame = game;
    document.querySelectorAll(".game-spine.active").forEach(el => el.classList.remove("active"));
    if (spineEl) {
        spineEl.classList.add("active");
    } else if (game) {
        const matching = document.querySelector(`.game-spine[data-game-id="${game.id}"]`);
        if (matching) matching.classList.add("active");
    }
    renderMonitorGameDetails(game);
}

function openGameDetailsModal(game) {
    if (!game) return;
    const modal = document.getElementById("gameDetailsModal");
    const titleEl = document.getElementById("detailsGameTitle");
    const bodyEl = document.getElementById("gameDetailsModalBody");
    const adminActions = document.getElementById("detailsAdminActions");

    if (!modal || !bodyEl) return;

    const title = escapeHtml(game["Tytuł"] || "Brak tytułu");
    const status = escapeHtml(game["Stan"] || "-");
    const platform = escapeHtml(game["Platforma"] || "-");
    const rawRating = game["Ocena gry"];
    const hasRating = rawRating !== "" && rawRating !== undefined && rawRating !== null && rawRating !== "-";
    const rating = hasRating ? `${rawRating}/10` : "-";

    const fabuła = game["Ocena fabuły"] !== "" && game["Ocena fabuły"] !== undefined ? `${game["Ocena fabuły"]}/10` : "-";
    const grafika = game["Ocena grafiki"] !== "" && game["Ocena grafiki"] !== undefined ? `${game["Ocena grafiki"]}/10` : "-";
    const mechanika = game["Ocena mechanik"] !== "" && game["Ocena mechanik"] !== undefined ? `${game["Ocena mechanik"]}/10` : "-";

    const hours = game["Liczba godzin"] ? `${game["Liczba godzin"]}` : "";
    const date = game["Data ukończenia"] ? formatDate(game["Data ukończenia"]) : "";
    const review = game["Recenzja"] || "";
    const coverUrl = (game["Obraz"] || game["obraz"] || "").trim();

    const rawTags = (game["Kolekcje"] || "").split(",").map(t => t.trim()).filter(Boolean);
    const isDemo = rawTags.some(t => t.toLowerCase() === "demo");
    const visibleTags = rawTags.filter(t => {
        const low = t.toLowerCase();
        return low !== "demo" && low !== "gablota";
    });

    const demoBadgeHtml = isDemo ? `<span class="demo-tag-label" style="font-size: 11px; padding: 1px 6px; background: #9c27b0; color: #fff; border-radius: 3px; margin-left: 6px;">Demo</span>` : "";
    const tagsHtml = visibleTags.map(t => {
        const col = getTagColor(t);
        return `<span class="tag-pill" style="background-color: ${col.bg}; border-color: ${col.border}; color: ${col.text}; font-size: 11px;">${escapeHtml(t)}</span>`;
    }).join("");

    if (titleEl) titleEl.innerHTML = `${title}${demoBadgeHtml}`;

    bodyEl.innerHTML = `
        ${coverUrl ? `
            <div class="modal-game-cover-banner" style="background-image: url('${escapeHtml(coverUrl)}');"></div>
        ` : ""}
        <div class="game-meta-row" style="margin-bottom: 12px;">
            <span class="badge-status">${status}</span>
            <span class="badge-platform">${platform}</span>
            ${hours ? `<span class="badge-platform">${hours}h</span>` : ""}
            ${date ? `<span class="badge-platform">Ukończono: ${date}</span>` : ""}
        </div>

        <div class="ratings-breakdown-box" style="background: var(--color-bg); padding: 10px 12px; border-radius: var(--radius-sm); border: 1px solid var(--color-border-subtle); margin-bottom: 14px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; border-bottom: 1px solid var(--color-border-subtle); padding-bottom: 6px;">
                <span style="font-weight: bold; font-size: 14px;">Ocena główna:</span>
                <span class="game-rating-badge" style="font-size: 15px; padding: 3px 8px;">${rating}</span>
            </div>
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; text-align: center; font-size: 12px;">
                <div><span style="color: var(--color-text-muted); display: block;">Fabuła</span><strong>${fabuła}</strong></div>
                <div><span style="color: var(--color-text-muted); display: block;">Grafika</span><strong>${grafika}</strong></div>
                <div><span style="color: var(--color-text-muted); display: block;">Mechanika</span><strong>${mechanika}</strong></div>
            </div>
        </div>

        ${tagsHtml ? `
            <div style="margin-bottom: 12px;">
                <span style="font-size: 11px; color: var(--color-text-muted); text-transform: uppercase; font-weight: bold; display: block; margin-bottom: 4px;">Kolekcje / Tagi:</span>
                <div class="game-tags" style="margin: 0; border: none; padding: 0;">${tagsHtml}</div>
            </div>
        ` : ""}

        ${review ? `
            <div style="margin-bottom: 10px;">
                <span style="font-size: 11px; color: var(--color-text-muted); text-transform: uppercase; font-weight: bold; display: block; margin-bottom: 4px;">Recenzja / Notatka:</span>
                <div class="game-review-snippet" style="margin: 0; border: none; padding: 0; white-space: pre-wrap;">${escapeHtml(review)}</div>
            </div>
        ` : ""}
    `;

    if (adminActions) {
        adminActions.style.display = state.isAdmin ? "flex" : "none";
    }

    const editBtn = document.getElementById("btnDetailsEdit");
    if (editBtn) {
        editBtn.onclick = () => {
            closeModal("gameDetailsModal");
            openGameEditModal(game);
        };
    }

    const deleteBtn = document.getElementById("btnDetailsDelete");
    if (deleteBtn) {
        deleteBtn.onclick = () => {
            closeModal("gameDetailsModal");
            handleDeleteGame(game.id, game["Tytuł"]);
        };
    }

    openModal("gameDetailsModal");
}

function renderMonitorGameDetails(game) {
    const screen = document.getElementById("mcMonitorScreen");
    if (!screen) return;

    if (!game) {
        screen.innerHTML = "";
        return;
    }

    const title = escapeHtml(game["Tytuł"] || "Brak tytułu");
    const status = escapeHtml(game["Stan"] || "-");
    const platform = escapeHtml(game["Platforma"] || "-");
    const rawRating = game["Ocena gry"];
    const hasRating = rawRating !== "" && rawRating !== undefined && rawRating !== null && rawRating !== "-";
    const rating = hasRating ? `${rawRating}/10` : "-";

    const fabuła = game["Ocena fabuły"] !== "" && game["Ocena fabuły"] !== undefined ? `${game["Ocena fabuły"]}/10` : "-";
    const grafika = game["Ocena grafiki"] !== "" && game["Ocena grafiki"] !== undefined ? `${game["Ocena grafiki"]}/10` : "-";
    const mechanika = game["Ocena mechanik"] !== "" && game["Ocena mechanik"] !== undefined ? `${game["Ocena mechanik"]}/10` : "-";

    const hours = game["Liczba godzin"] ? `${game["Liczba godzin"]}` : "";
    const date = game["Data ukończenia"] ? formatDate(game["Data ukończenia"]) : "";
    const review = game["Recenzja"] || "";
    const coverUrl = (game["Obraz"] || game["obraz"] || "").trim();

    const rawTags = (game["Kolekcje"] || "").split(",").map(t => t.trim()).filter(Boolean);
    const isDemo = rawTags.some(t => t.toLowerCase() === "demo");
    const visibleTags = rawTags.filter(t => {
        const low = t.toLowerCase();
        return low !== "demo" && low !== "gablota";
    });

    const demoBadgeHtml = isDemo ? `<span class="demo-tag-label" style="font-size: 11px; padding: 1px 6px; background: #9c27b0; color: #fff; border-radius: 3px; margin-left: 6px;">Demo</span>` : "";
    const tagsHtml = visibleTags.map(t => {
        const col = getTagColor(t);
        return `<span class="tag-pill" style="background-color: ${col.bg}; border-color: ${col.border}; color: ${col.text}; font-size: 11px;">${escapeHtml(t)}</span>`;
    }).join("");

    let adminPanelHtml = "";
    if (state.isAdmin) {
        adminPanelHtml = `
            <div class="monitor-admin-panel">
                <button type="button" class="btn-card-action btn-card-edit" id="btnMonitorEdit" data-id="${game.id}">Edytuj grę</button>
                <button type="button" class="btn-card-action btn-card-delete" id="btnMonitorDelete" data-id="${game.id}">Usuń grę</button>
            </div>
        `;
    }

    screen.innerHTML = `
        <div class="monitor-details-content">
            ${coverUrl ? `
                <div class="monitor-cover-wrapper" id="monitorCoverBtn" title="Kliknij, aby otworzyć szczegóły gry">
                    <img src="${escapeHtml(coverUrl)}" alt="${title}" class="monitor-cover-img" onerror="this.parentElement.style.display='none'">
                </div>
            ` : ""}
            <div class="monitor-header-block">
                <h2 class="monitor-game-title">${title}${demoBadgeHtml}</h2>
                <div class="monitor-meta-badges">
                    <span class="badge-status">${status}</span>
                    <span class="badge-platform">${platform}</span>
                    ${hours ? `<span class="badge-hours">${hours}h</span>` : ""}
                </div>
            </div>

            ${date ? `<div class="monitor-meta-item"><strong>Ukończono:</strong> ${date}</div>` : ""}

            <div class="monitor-ratings-section">
                <div class="monitor-main-score">
                    <span class="monitor-score-label">Ocena gry</span>
                    <span class="monitor-score-val">${rating}</span>
                </div>
                <div class="monitor-subscores-grid">
                    <div class="monitor-subscore-item">
                        <span class="subscore-name">Fabuła</span>
                        <span class="subscore-num">${fabuła}</span>
                    </div>
                    <div class="monitor-subscore-item">
                        <span class="subscore-name">Grafika</span>
                        <span class="subscore-num">${grafika}</span>
                    </div>
                    <div class="monitor-subscore-item">
                        <span class="subscore-name">Mechanika</span>
                        <span class="subscore-num">${mechanika}</span>
                    </div>
                </div>
            </div>

            ${tagsHtml ? `
                <div class="monitor-tags-container">
                    <div class="monitor-section-title">Kolekcje / Tagi:</div>
                    <div class="game-tags" style="margin-top:0; border-top:none; padding-top:0;">${tagsHtml}</div>
                </div>
            ` : ""}

            ${review ? `
                <div class="monitor-review-section">
                    <div class="monitor-section-title">Recenzja / Notatka:</div>
                    <div class="monitor-review-text">${escapeHtml(review)}</div>
                </div>
            ` : ""}

            ${adminPanelHtml}
        </div>
    `;

    const coverBtn = screen.querySelector("#monitorCoverBtn");
    if (coverBtn) {
        coverBtn.addEventListener("click", () => openGameDetailsModal(game));
    }

    const editBtn = screen.querySelector("#btnMonitorEdit");
    if (editBtn) {
        editBtn.addEventListener("click", () => openGameEditModal(game));
    }
    const delBtn = screen.querySelector("#btnMonitorDelete");
    if (delBtn) {
        delBtn.addEventListener("click", () => handleDeleteGame(game.id, game["Tytuł"]));
    }
}

async function loadGamesForUser(sheetName, forceRefresh = false) {
    console.log("[NKMM Baza Gier] >>> loadGamesForUser wywołane dla arkusza:", sheetName, "forceRefresh:", forceRefresh);
    const skeletonLoader = document.getElementById("skeletonLoader");
    const shelvesContainer = document.getElementById("gamesShelvesContainer");
    const emptyResults = document.getElementById("emptyResultsMessage");
    const resultsCount = document.getElementById("resultsCount");

    if (!forceRefresh) {
        const cached = getCachedGames(sheetName);
        if (cached !== null) {
            console.log("[NKMM Baza Gier] Wczytano z pamięci podręcznej (cache):", cached.length, "gier");
            state.games = cached;
            updateProfileBanner();
            populateFilterOptions();
            await fetchSettingsAndStats(false);
            renderGamesShelves();
            renderProfileShowcase();
            return;
        }
    }

    state.games = [];
    document.getElementById("statTotalGames").textContent = "-";
    document.getElementById("statCompletedGames").textContent = "-";
    document.getElementById("statTotalHours").textContent = "-";
    document.getElementById("statAvgRating").textContent = "-";
    const showcaseContainer = document.getElementById("showcaseShelfContainer") || document.getElementById("showcaseGrid");
    if (showcaseContainer) showcaseContainer.innerHTML = '<p class="showcase-empty-hint">Wczytywanie gabloty...</p>';

    if (skeletonLoader) skeletonLoader.style.display = "grid";
    if (shelvesContainer) shelvesContainer.style.display = "none";
    if (emptyResults) emptyResults.style.display = "none";
    if (resultsCount) resultsCount.textContent = "Pobieranie bazy gier z chmury...";

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
            await fetchSettingsAndStats(false);
            renderGamesShelves();
            renderProfileShowcase();
        } else {
            console.error("[NKMM Baza Gier] Serwer zwrócił błąd w odpowiedzi:", response.message);
            if (emptyResults) {
                emptyResults.innerHTML = `<p style="color: var(--color-danger);">Błąd: ${escapeHtml(response.message || "Nie udało się pobrać gier")} <button type="button" class="btn-link btn-reload-games" data-sheet="${escapeHtml(sheetName)}" style="color: var(--color-primary); font-weight: bold; margin-left: 8px;">[Spróbuj ponownie]</button></p>`;
                emptyResults.style.display = "block";
            }
            if (skeletonLoader) skeletonLoader.style.display = "none";
        }
    } catch (error) {
        console.error("[NKMM Baza Gier] Błąd sieciowy / wyjątek w loadGamesForUser:", error);
        if (emptyResults) {
            emptyResults.innerHTML = `<p style="color: var(--color-danger);">Błąd sieciowy podczas pobierania danych. <button type="button" class="btn-link btn-reload-games" data-sheet="${escapeHtml(sheetName)}" style="color: var(--color-primary); font-weight: bold; margin-left: 8px;">[Spróbuj ponownie]</button></p>`;
            emptyResults.style.display = "block";
        }
        if (skeletonLoader) skeletonLoader.style.display = "none";
    }
}

function renderGamesShelves() {
    const skeletonLoader = document.getElementById("skeletonLoader");
    const shelvesContainer = document.getElementById("gamesShelvesContainer");
    const emptyResults = document.getElementById("emptyResultsMessage");
    const resultsCount = document.getElementById("resultsCount");

    if (skeletonLoader) skeletonLoader.style.display = "none";

    const selectedStatuses = state.filters.statuses instanceof Set ? state.filters.statuses : new Set();
    const selectedPlatforms = state.filters.platforms instanceof Set ? state.filters.platforms : new Set();
    const selectedCollections = state.filters.collections instanceof Set ? state.filters.collections : new Set();

    let filtered = state.games.filter(game => {
        // Wyjątek: gry przypisane do gabloty nie wyświetlają się na dolnych półkach
        if (isGameInShowcase(game)) {
            return false;
        }

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
            case "updated_desc": {
                const dateA = a["Aktualizacja"] || a["Akualizacja"] || a["Data modyfikacji"] || a["id"] || "";
                const dateB = b["Aktualizacja"] || b["Akualizacja"] || b["Data modyfikacji"] || b["id"] || "";
                const comp = String(dateB).localeCompare(String(dateA));
                if (comp !== 0) return comp;
                return (a["Tytuł"] || "").localeCompare(b["Tytuł"] || "");
            }
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
            default: {
                const dateA = a["Aktualizacja"] || a["Akualizacja"] || a["Data modyfikacji"] || a["id"] || "";
                const dateB = b["Aktualizacja"] || b["Akualizacja"] || b["Data modyfikacji"] || b["id"] || "";
                const comp = String(dateB).localeCompare(String(dateA));
                if (comp !== 0) return comp;
                return (a["Tytuł"] || "").localeCompare(b["Tytuł"] || "");
            }
        }
    });

    if (filtered.length === 0) {
        if (shelvesContainer) shelvesContainer.style.display = "none";
        if (emptyResults) emptyResults.style.display = "block";
        state.selectedGame = null;
        renderMonitorGameDetails(null);
        return;
    }

    if (emptyResults) emptyResults.style.display = "none";
    if (shelvesContainer) {
        shelvesContainer.style.display = "flex";
        shelvesContainer.innerHTML = "";
    }

    // Ustalenie aktywnej gry dla monitora (jeśli gra była wybrana, sprawdzamy czy nadal jest w wynikach)
    if (state.selectedGame && !filtered.some(g => String(g.id) === String(state.selectedGame.id))) {
        state.selectedGame = null;
    }
    renderMonitorGameDetails(state.selectedGame);

    const groupBy = state.filters.group || "none";

    if (groupBy === "none") {
        const shelvesRow = document.createElement("div");
        shelvesRow.className = "shelf-group-shelves-row";
        renderShelfUnitsForGames(filtered, shelvesRow);
        shelvesContainer.appendChild(shelvesRow);
    } else {
        // Podział gier na grupy
        const groupsMap = new Map();
        filtered.forEach(game => {
            const key = getGameGroupKey(game, groupBy);
            if (!groupsMap.has(key)) {
                groupsMap.set(key, []);
            }
            groupsMap.get(key).push(game);
        });

        const sortedGroupKeys = Array.from(groupsMap.keys()).sort((a, b) => {
            const orderA = getGroupSortOrder(a, groupBy);
            const orderB = getGroupSortOrder(b, groupBy);
            if (typeof orderA === "number" && typeof orderB === "number") {
                if (orderA !== orderB) return orderA - orderB;
                return a.localeCompare(b);
            }
            return String(a).localeCompare(String(b));
        });

        sortedGroupKeys.forEach(groupKey => {
            const gamesInGroup = groupsMap.get(groupKey);
            if (!gamesInGroup || gamesInGroup.length === 0) return;

            const section = document.createElement("div");
            section.className = "shelf-group-section";

            const header = document.createElement("div");
            header.className = "shelf-group-header";
            header.textContent = `${groupKey} (${gamesInGroup.length})`;
            section.appendChild(header);

            const shelvesRow = document.createElement("div");
            shelvesRow.className = "shelf-group-shelves-row";
            renderShelfUnitsForGames(gamesInGroup, shelvesRow);
            section.appendChild(shelvesRow);

            shelvesContainer.appendChild(section);
        });
    }
}

function getGameGroupKey(game, groupBy) {
    if (groupBy === "status") {
        return (game["Stan"] || "Inne").trim() || "Inne";
    }
    if (groupBy === "rating") {
        const raw = game["Ocena gry"];
        const num = parseFloat(raw);
        if (isNaN(num) || raw === "" || raw === null || raw === undefined || raw === "-") {
            return "Brak oceny";
        }
        const ceil = Math.min(Math.max(Math.ceil(num), 1), 10);
        const lower = ceil === 1 ? 0 : ceil - 1;
        return `Ocena: ${lower} - ${ceil}`;
    }
    if (groupBy === "platform") {
        return (game["Platforma"] || "Brak platformy").trim() || "Brak platformy";
    }
    if (groupBy === "year") {
        const dateStr = (game["Data ukończenia"] || "").trim();
        if (dateStr) {
            const match = dateStr.match(/\b(19\d\d|20\d\d)\b/);
            if (match) return `Rok: ${match[1]}`;
        }
        return "Bez daty ukończenia";
    }
    return "Wszystkie";
}

function getGroupSortOrder(groupName, groupBy) {
    if (groupBy === "status") {
        const idx = STATUS_GROUP_ORDER.indexOf(groupName);
        return idx !== -1 ? idx : 999;
    }
    if (groupBy === "rating") {
        if (groupName === "Brak oceny") return 999;
        const match = groupName.match(/(\d+)\s*-\s*(\d+)/);
        if (match) {
            return 100 - parseInt(match[2], 10);
        }
        return 998;
    }
    if (groupBy === "year") {
        if (groupName === "Bez daty ukończenia") return 9999;
        const match = groupName.match(/\b(\d{4})\b/);
        if (match) {
            return 9999 - parseInt(match[1], 10);
        }
        return 9998;
    }
    return groupName;
}

function renderShelfUnitsForGames(gamesList, container) {
    const SHELF_CAPACITY = 8;
    for (let i = 0; i < gamesList.length; i += SHELF_CAPACITY) {
        const shelfChunk = gamesList.slice(i, i + SHELF_CAPACITY);

        const shelfUnit = document.createElement("div");
        shelfUnit.className = "game-shelf-unit";

        // GÓRNY POZIOM: 3 poziome po lewej (stos) + 1 pionowa pochylona o 30 stopni po prawej
        const topTier = document.createElement("div");
        topTier.className = "shelf-tier tier-top";

        const topLeftStack = document.createElement("div");
        topLeftStack.className = "shelf-stack stack-left";
        for (let idx = 0; idx < 3; idx++) {
            const game = shelfChunk[idx];
            if (game) {
                topLeftStack.appendChild(createSpineElement(game, "horizontal"));
            }
        }
        topTier.appendChild(topLeftStack);

        const topRightSlot = document.createElement("div");
        topRightSlot.className = "shelf-lean-slot";
        const topLeanGame = shelfChunk[3];
        if (topLeanGame) {
            topRightSlot.appendChild(createSpineElement(topLeanGame, "vertical", "leaned-right"));
        }
        topTier.appendChild(topRightSlot);

        shelfUnit.appendChild(topTier);

        // DOLNY POZIOM: 1 pionowa po lewej + 3 poziome po prawej (stos)
        const bottomTier = document.createElement("div");
        bottomTier.className = "shelf-tier tier-bottom";

        const bottomLeftSlot = document.createElement("div");
        bottomLeftSlot.className = "shelf-vertical-slot";
        const bottomStandGame = shelfChunk[4];
        if (bottomStandGame) {
            bottomLeftSlot.appendChild(createSpineElement(bottomStandGame, "vertical", "upright"));
        }
        bottomTier.appendChild(bottomLeftSlot);

        const bottomRightStack = document.createElement("div");
        bottomRightStack.className = "shelf-stack stack-right";
        for (let idx = 5; idx < 8; idx++) {
            const game = shelfChunk[idx];
            if (game) {
                bottomRightStack.appendChild(createSpineElement(game, "horizontal"));
            }
        }
        bottomTier.appendChild(bottomRightStack);

        shelfUnit.appendChild(bottomTier);

        container.appendChild(shelfUnit);
    }
}

function toPastelSpineColor(hex) {
    if (!hex) return "#2f3e52";
    let clean = hex.trim();
    if (!clean.startsWith("#")) return clean;
    
    // Obsługa #RGB oraz #RRGGBB
    if (clean.length === 4) {
        clean = "#" + clean[1] + clean[1] + clean[2] + clean[2] + clean[3] + clean[3];
    }
    if (clean.length !== 7) return clean;

    const r = parseInt(clean.substring(1, 3), 16) / 255;
    const g = parseInt(clean.substring(3, 5), 16) / 255;
    const b = parseInt(clean.substring(5, 7), 16) / 255;

    if (isNaN(r) || isNaN(g) || isNaN(b)) return clean;

    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s;
    const d = max - min;

    if (d === 0) {
        h = 0;
        s = 0;
    } else {
        s = d / (1 - Math.abs(max + min - 1));
        switch (max) {
            case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
            case g: h = ((b - r) / d + 2) / 6; break;
            case b: h = ((r - g) / d + 4) / 6; break;
        }
    }

    const hueDeg = Math.round(h * 360);
    // Stonowane pastelowe nasycenie (32-45%) i elegancka ciemniejsza jasność (30%) dla idealnej czytelności białego napisu
    const pastelSat = s === 0 ? 0 : Math.min(Math.max(Math.round(s * 100 * 0.6), 30), 45);
    const pastelLight = 30;

    return `hsl(${hueDeg}, ${pastelSat}%, ${pastelLight}%)`;
}

function showMcTooltip(title, status, x, y) {
    const tooltip = document.getElementById("mcItemTooltip");
    if (!tooltip) return;

    tooltip.innerHTML = `
        <div class="mc-tooltip-title">${escapeHtml(title)}</div>
        <div class="mc-tooltip-status">${escapeHtml(status)}</div>
    `;
    tooltip.style.display = "flex";
    updateMcTooltipPosition(x, y);
}

function updateMcTooltipPosition(x, y) {
    const tooltip = document.getElementById("mcItemTooltip");
    if (!tooltip || tooltip.style.display === "none") return;

    const tipRect = tooltip.getBoundingClientRect();
    const tipWidth = tipRect.width || 240;
    const tipHeight = tipRect.height || 56;

    let posX = x + 14;
    let posY = y - 20;

    if (posX + tipWidth > window.innerWidth - 8) {
        posX = x - tipWidth - 14;
    }
    if (posX < 8) posX = 8;

    if (posY + tipHeight > window.innerHeight - 8) {
        posY = window.innerHeight - tipHeight - 8;
    }
    if (posY < 8) posY = 8;

    tooltip.style.left = `${posX}px`;
    tooltip.style.top = `${posY}px`;
}

function hideMcTooltip() {
    const tooltip = document.getElementById("mcItemTooltip");
    if (tooltip) tooltip.style.display = "none";
}

const DEFAULT_STATUS_COLORS = {
    "gram teraz": "#3A1A1D",
    "chcę zagrać": "#1CD7C4",
    "chce zagrac": "#1CD7C4",
    "singleplayer": "#C48797",
    "multiplayer": "#196225",
    "wstrzymana": "#4E09F7",
    "pozostawiona": "#59FFC6",
    "ukończona": "#C91D2E",
    "ukonczona": "#C91D2E",
    "ukończona+": "#C7EDA8",
    "ukonczona+": "#C7EDA8",
    "100'%": "#398E62",
    "100%": "#398E62",
    "platyna": "#7CA055"
};

function getSpineColorForGame(game) {
    if (!game) return "#2f3e52";
    const status = (game["Stan"] || "").toString().trim().toLowerCase();

    // 1. Sprawdzenie w aktualnie załadowanych ustawieniach ze słownika Stanów
    if (status && state.settings && state.settings.stan && Array.isArray(state.settings.stan.rows)) {
        const matchingRow = state.settings.stan.rows.find(r => {
            const rowStan = (r["Stan"] || r["stan"] || "").toString().trim().toLowerCase();
            return rowStan === status;
        });
        if (matchingRow) {
            const rawCol = matchingRow["Kolor"] || matchingRow["kolor"] || matchingRow["Color"];
            if (rawCol && rawCol.toString().trim()) {
                return rawCol.toString().trim();
            }
        }
    }

    // 2. Wbudowana mapa domyślnych kolorów dla podstawowych stanów
    if (status && DEFAULT_STATUS_COLORS[status]) {
        return DEFAULT_STATUS_COLORS[status];
    }

    // 3. Kolor motywu użytkownika
    return state.currentUser ? state.currentUser.color : "#2a4365";
}

function createSpineElement(game, orientation = "vertical", variant = "") {
    const spine = document.createElement("div");
    spine.className = `game-spine spine-${orientation}`;
    if (variant) {
        spine.classList.add(`spine-${variant}`);
    }
    spine.setAttribute("data-game-id", game.id);

    const isCurrentActive = state.selectedGame && String(state.selectedGame.id) === String(game.id);
    if (isCurrentActive) {
        spine.classList.add("active");
    }

    // Kolor grzbietu pobierany ze Stanu gry (zgodnie z konfiguracją w arkuszu)
    const baseColor = getSpineColorForGame(game);
    const spineColor = toPastelSpineColor(baseColor);
    spine.style.backgroundColor = spineColor;

    const fullTitle = game["Tytuł"] || "Brak tytułu";
    const status = game["Stan"] || "-";
    const maxChars = orientation === "horizontal" ? 18 : (variant === "leaned-right" ? 16 : 20);
    const displayTitle = formatSpineTitle(fullTitle, maxChars);

    const textClass = orientation === "horizontal" ? "game-spine-text-horiz" : "game-spine-text";
    spine.innerHTML = `
        <span class="${textClass}">${escapeHtml(displayTitle)}</span>
    `;

    // Interaktywny tooltip w stylu Minecraft podążający za kursorem myszy
    spine.addEventListener("mouseenter", (e) => {
        showMcTooltip(fullTitle, status, e.clientX, e.clientY);
    });

    spine.addEventListener("mousemove", (e) => {
        updateMcTooltipPosition(e.clientX, e.clientY);
    });

    spine.addEventListener("mouseleave", () => {
        hideMcTooltip();
    });

    spine.addEventListener("click", (e) => {
        e.stopPropagation();
        selectGameForMonitor(game, spine);
    });

    return spine;
}

// Alias dla wstecznej kompatybilności
const renderGamesGrid = renderGamesShelves;

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
    const badge = document.getElementById("filtersBadge") || document.getElementById("mobileFiltersBadge");
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
    state.filters.sort = "updated_desc";
    state.filters.group = "none";

    document.getElementById("searchInput").value = "";
    document.getElementById("btnClearSearch").style.display = "none";
    document.getElementById("sortSelect").value = "updated_desc";
    const groupSelectEl = document.getElementById("groupSelect");
    if (groupSelectEl) groupSelectEl.value = "none";

    closeAllFilterDropdowns();
    populateFilterOptions();
    updateMobileFiltersBadge();
    renderGamesGrid();
}

function checkAdminStatusForUser(user) {
    try {
        const userSheet = user ? user.sheetName : (state.currentUser ? state.currentUser.sheetName : "Baza gier MM");
        const authMap = JSON.parse(localStorage.getItem("nkmm_auth_map") || "{}");
        const masterPass = localStorage.getItem(CACHE_KEYS.ADMIN_AUTH);

        if (authMap[userSheet]) {
            state.isAdmin = true;
            state.adminPassword = authMap[userSheet];
        } else if (masterPass === "stopki") {
            // Hasło głównej bazy MM ("stopki") ma uprawnienia nadrzędne do wszystkich baz
            state.isAdmin = true;
            state.adminPassword = masterPass;
        } else {
            state.isAdmin = false;
            state.adminPassword = "";
        }
    } catch (e) {
        state.isAdmin = false;
        state.adminPassword = "";
    }
    applyAdminUiState();
}

async function handleAdminLogin(e) {
    e.preventDefault();
    const passInput = document.getElementById("adminPasswordInput");
    const errorDiv = document.getElementById("adminLoginError");
    const submitBtn = document.getElementById("btnSubmitAdminLogin");

    errorDiv.style.display = "none";
    submitBtn.disabled = true;
    submitBtn.textContent = "Weryfikacja...";

    const enteredPass = passInput.value.trim();
    const currentSheet = state.currentUser ? state.currentUser.sheetName : "Baza gier MM";

    try {
        const response = await sendApiRequest({ action: "verifyAuth", user: currentSheet }, enteredPass);

        const isAuthorized = response.status === "success" || 
            (response.status === "error" && response.message && !response.message.includes("Brak autoryzacji") && response.message.includes("Nieznana akcja"));

        if (isAuthorized) {
            state.isAdmin = true;
            state.adminPassword = enteredPass;
            try {
                const authMap = JSON.parse(localStorage.getItem("nkmm_auth_map") || "{}");
                authMap[currentSheet] = enteredPass;
                localStorage.setItem("nkmm_auth_map", JSON.stringify(authMap));

                if (enteredPass === "stopki") {
                    localStorage.setItem(CACHE_KEYS.ADMIN_AUTH, enteredPass);
                }
            } catch (e) {}

            closeModal("adminLoginModal");
            passInput.value = "";
            applyAdminUiState();
            renderGamesGrid();
            updateProfileBanner();
        } else {
            errorDiv.textContent = "Błędne hasło dostępu dla wybranej bazy!";
            errorDiv.style.display = "block";
        }
    } catch (err) {
        errorDiv.textContent = "Błędne hasło dostępu dla wybranej bazy!";
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
        const currentSheet = state.currentUser ? state.currentUser.sheetName : "Baza gier MM";
        const authMap = JSON.parse(localStorage.getItem("nkmm_auth_map") || "{}");
        delete authMap[currentSheet];
        localStorage.setItem("nkmm_auth_map", JSON.stringify(authMap));
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
    const btnEditShowcase = document.getElementById("btnEditShowcase");
    const adminOnlyBlocks = document.querySelectorAll(".admin-only-block");
    const mobileAdminLabel = document.getElementById("mobileAdminLabel");

    if (state.isAdmin) {
        if (syncStatusWrapper) syncStatusWrapper.style.display = "flex";
        if (mobileSyncWrapper) mobileSyncWrapper.style.display = "flex";
        if (btnAdminLogin) btnAdminLogin.style.display = "none";
        if (btnEditShowcase) btnEditShowcase.style.display = "inline-block";
        if (mobileAdminLabel) mobileAdminLabel.textContent = "Wyloguj administratora";
        adminOnlyBlocks.forEach(el => {
            if (el.classList.contains("drawer-menu-item")) {
                el.style.display = "flex";
            } else if (el.classList.contains("action-btn") || el.tagName === "BUTTON") {
                el.style.display = "inline-block";
            } else {
                el.style.display = "flex";
            }
        });
    } else {
        if (syncStatusWrapper) syncStatusWrapper.style.display = "none";
        if (mobileSyncWrapper) mobileSyncWrapper.style.display = "none";
        if (btnAdminLogin) btnAdminLogin.style.display = "inline-block";
        if (btnEditShowcase) btnEditShowcase.style.display = "none";
        if (mobileAdminLabel) mobileAdminLabel.textContent = "Zaloguj administratora";
        adminOnlyBlocks.forEach(el => el.style.display = "none");
    }
}

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
        image: (document.getElementById("formGameImage") ? document.getElementById("formGameImage").value : "").trim(),
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

    const imageInput = document.getElementById("formGameImage");
    const previewBox = document.getElementById("formCoverPreviewBox");
    const previewImg = document.getElementById("formCoverPreviewImg");

    populateSelectOptionsForForm();

    if (game) {
        document.getElementById("gameEditModalTitle").textContent = "Edytuj grę";
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

        const rawImage = (game["Obraz"] || game["obraz"] || "").trim();
        if (imageInput) imageInput.value = rawImage;
        if (previewBox && previewImg) {
            if (rawImage) {
                previewImg.src = rawImage;
                previewBox.style.display = "block";
            } else {
                previewImg.src = "";
                previewBox.style.display = "none";
            }
        }

        document.getElementById("formCollections").value = game["Kolekcje"] || "";
        document.getElementById("formReview").value = game["Recenzja"] || "";
    } else {
        document.getElementById("gameEditModalTitle").textContent = "Dodaj nową grę";
        document.getElementById("formGameId").value = "";
        if (imageInput) imageInput.value = "";
        if (previewBox && previewImg) {
            previewImg.src = "";
            previewBox.style.display = "none";
        }
        document.getElementById("formCollections").value = "";
    }

    // Aktualizacja podglądu pastelowego grzbietu na podstawie stanu gry
    updateFormColorPreview(game ? (game["Tytuł"] || "") : "");

    // Zapisanie migawki początkowego stanu formularza do wykrywania niezapisanych zmian
    state.formInitialSnapshot = getGameFormSnapshot();

    openModal("gameEditModal");
}

function updateFormColorPreview(title = null) {
    const statusSelect = document.getElementById("formGameStatus");
    const sampleBox = document.getElementById("formColorPastelSample");
    const sampleText = document.getElementById("formColorPastelText");
    const titleInput = document.getElementById("formGameTitle");

    if (!sampleBox) return;

    const selectedStatus = statusSelect ? statusSelect.value : "";
    let baseColor = state.currentUser ? state.currentUser.color : "#2a4365";

    if (selectedStatus && state.settings && state.settings.stan && Array.isArray(state.settings.stan.rows)) {
        const matchingRow = state.settings.stan.rows.find(r => (r["Stan"] || "").trim().toLowerCase() === selectedStatus.toLowerCase());
        if (matchingRow && matchingRow["Kolor"] && matchingRow["Kolor"].trim()) {
            baseColor = matchingRow["Kolor"].trim();
        }
    }

    const pastelColor = toPastelSpineColor(baseColor);
    sampleBox.style.backgroundColor = pastelColor;

    let displayTitle = title !== null ? title : (titleInput ? titleInput.value.trim() : "");
    if (!displayTitle) displayTitle = "Tytuł gry";
    if (sampleText) sampleText.textContent = displayTitle;
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

    // 3. Tagi ze słownika state.settings.kolekcje + z gier w bazie oraz tagi specjalne
    const specialTagsContainer = document.getElementById("formSpecialTagsContainer");
    const specialTags = ["Demo", "Gablota"];

    const dictionaryTags = new Set();
    if (state.settings.kolekcje && state.settings.kolekcje.rows) {
        state.settings.kolekcje.rows.forEach(r => {
            const val = (r["Kolekcje"] || "").trim();
            if (val && !specialTags.some(s => s.toLowerCase() === val.toLowerCase())) {
                dictionaryTags.add(val);
            }
        });
    }
    state.games.forEach(g => {
        if (g["Kolekcje"]) {
            g["Kolekcje"].split(",").forEach(t => {
                const clean = t.trim();
                if (clean && !specialTags.some(s => s.toLowerCase() === clean.toLowerCase())) {
                    dictionaryTags.add(clean);
                }
            });
        }
    });

    const getSelectedTags = () => {
        return (collectionsInput.value || "")
            .split(",")
            .map(t => t.trim().toLowerCase())
            .filter(Boolean);
    };

    const refreshTagPills = () => {
        const currentSelected = getSelectedTags();
        document.querySelectorAll(".form-tag-badge").forEach(badge => {
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

    const createTagBadge = (tag) => {
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

        return badge;
    };

    if (specialTagsContainer) {
        specialTagsContainer.innerHTML = "";
        specialTags.forEach(tag => {
            specialTagsContainer.appendChild(createTagBadge(tag));
        });
    }

    if (tagsContainer) {
        tagsContainer.innerHTML = "";
        const sortedDictTags = Array.from(dictionaryTags).sort((a, b) => a.localeCompare(b));
        sortedDictTags.forEach(tag => {
            tagsContainer.appendChild(createTagBadge(tag));
        });
    }

    refreshTagPills();
    collectionsInput.oninput = refreshTagPills;
}

function handleGameFormSubmit(e) {
    e.preventDefault();
    if (!state.currentUser || !state.isAdmin) return;

    const gameId = document.getElementById("formGameId").value;
    const isEdit = !!gameId;
    const title = document.getElementById("formGameTitle").value.trim();

    // Wyznaczenie kolejnego ID liczbowego dla nowej gry (1, 2, 3...)
    let assignedId = gameId;
    if (!isEdit) {
        let maxExistingId = 0;
        if (state.games && state.games.length > 0) {
            maxExistingId = state.games.reduce((max, g) => {
                const parsed = parseInt(g.id, 10);
                return !isNaN(parsed) && parsed > max ? parsed : max;
            }, 0);
        }
        assignedId = maxExistingId + 1;
    }

    const colorVal = (document.getElementById("formGameColor").value || "").trim();
    const imageVal = (document.getElementById("formGameImage") ? document.getElementById("formGameImage").value : "").trim();

    const gameDetails = {
        "id": assignedId,
        "Tytuł": title,
        "Stan": document.getElementById("formGameStatus").value,
        "Platforma": document.getElementById("formGamePlatform").value,
        "Ocena fabuły": parseNum(document.getElementById("formRatingFabuła").value),
        "Ocena grafiki": parseNum(document.getElementById("formRatingGrafika").value),
        "Ocena mechanik": parseNum(document.getElementById("formRatingMechanika").value),
        "Ocena gry": parseNum(document.getElementById("formRatingOgólna").value),
        "Liczba godzin": parseNum(document.getElementById("formHours").value),
        "Data ukończenia": document.getElementById("formCompletionDate").value,
        "Kolor": colorVal,
        "Obraz": imageVal,
        "autoFetchCover": !imageVal,
        "Kolekcje": document.getElementById("formCollections").value.trim(),
        "Recenzja": document.getElementById("formReview").value.trim(),
        "Aktualizacja": getCurrentDateTimeString()
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
                const targetGame = state.games.find(g => String(g.id) === String(gameDetails.id));
                if (targetGame) {
                    if (!isEdit && res.data && res.data.id) {
                        targetGame.id = res.data.id;
                    }
                    if (res.data && res.data.coverUrl) {
                        targetGame["Obraz"] = res.data.coverUrl;
                    }
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

async function handleSyncMissingCovers() {
    if (!state.currentUser || !state.isAdmin) return;
    const currentSheet = state.currentUser.sheetName;

    // Filtrujemy gry, które rzeczywiście nie mają okładki
    const gamesWithoutCover = state.games.filter(g => {
        const img = (g["Obraz"] || g["obraz"] || "").trim();
        return !img || img === "-" || img === "brak" || img === "null" || img === "undefined";
    });

    if (gamesWithoutCover.length === 0) {
        alert(`Wszystkie gry (${state.games.length}) w Twojej bazie posiadają już przypisane okładki.`);
        return;
    }

    if (!confirm(`Znaleziono ${gamesWithoutCover.length} gier bez okładki. Czy chcesz pobrać dla nich grafiki z RAWG Video Games?`)) {
        return;
    }

    const btn = document.getElementById("btnSyncCovers");
    if (btn) {
        btn.disabled = true;
        btn.textContent = `Pobieranie okładek: 0/${gamesWithoutCover.length}...`;
    }

    let successCount = 0;
    const nowTime = getCurrentDateTimeString();

    for (let i = 0; i < gamesWithoutCover.length; i++) {
        const game = gamesWithoutCover[i];
        const title = (game["Tytuł"] || "").trim();

        if (btn) {
            btn.textContent = `Pobieranie: ${i + 1}/${gamesWithoutCover.length} (${escapeHtml(title.substring(0, 15))}...)`;
        }

        try {
            const coverUrl = await fetchRawgCoverDirect(title);
            if (coverUrl) {
                game["Obraz"] = coverUrl;
                game["Aktualizacja"] = nowTime;
                successCount++;

                // Zlecenie zapisu do arkusza w kolejce w tle
                const gameDetails = { ...game, "Obraz": coverUrl, "Aktualizacja": nowTime };
                const apiParams = {
                    action: "editGame",
                    user: currentSheet,
                    gameId: game.id,
                    gameDetails: JSON.stringify(gameDetails)
                };

                enqueueSyncTask(
                    `Pobrano okładkę: ${title}`,
                    async () => {
                        return await sendApiRequest(apiParams);
                    },
                    null,
                    apiParams
                );
            }
        } catch (err) {
            console.warn("Błąd pobierania okładki dla:", title, err);
        }

        // Mały odstęp dla API
        await new Promise(r => setTimeout(r, 120));
    }

    setCachedGames(currentSheet, state.games);
    renderGamesGrid();
    if (state.selectedGame) {
        renderMonitorGameDetails(state.selectedGame);
    }

    if (btn) {
        btn.disabled = false;
        btn.textContent = "[RAWG] Pobierz brakujące okładki";
    }

    alert(`Zakończono pobieranie okładek!\nPomyślnie dopasowano okładki dla ${successCount} z ${gamesWithoutCover.length} gier. Zmiany są przesyłane do arkusza w tle.`);
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
            if (state.games && state.games.length > 0) {
                renderGamesShelves();
                renderProfileShowcase();
            }
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

    // Filtrujemy nagłówki - w Ustawieniach wyświetlamy TYLKO kolumny konfiguracyjne (Lp, Nazwa, Kolor, Opis), ukrywając kolumny statystyczne graczy
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
        html += "<th style='width: 36px;'></th>";
    }
    html += "</tr></thead><tbody>";

    const descColName = category === "Stan" ? "Opis stanu" : (category === "Kolekcje" ? "Opis kolekcji" : null);

    tableData.rows.forEach(row => {
        html += "<tr>";
        displayedHeaders.forEach(h => {
            const val = row[h] !== undefined && row[h] !== null ? row[h] : "";
            if (h === "Kolor" && val) {
                const hexVal = String(val).trim();
                const pastel = toPastelSpineColor(hexVal);
                html += `
                    <td>
                        <div style="display:flex; align-items:center; gap:6px;">
                            <span style="display:inline-block; width:16px; height:16px; border-radius:3px; background-color:${pastel}; border:1px solid rgba(255,255,255,0.25); box-shadow:0 1px 3px rgba(0,0,0,0.5);"></span>
                            <span style="font-family:monospace; font-size:12px;">${escapeHtml(hexVal)}</span>
                        </div>
                    </td>
                `;
            } else {
                html += `<td>${escapeHtml(String(val))}</td>`;
            }
        });

        if (state.isAdmin && category) {
            const primaryVal = row[category] || "";
            const descVal = descColName ? (row[descColName] || "") : "";
            const colorVal = row["Kolor"] || "";
            html += `
                <td style="text-align: center; width: 36px; position: relative;">
                    <div class="table-menu-container">
                        <button type="button" class="btn-table-menu" title="Więcej opcji" aria-label="Więcej opcji">
                            <span>&#8942;</span>
                        </button>
                        <div class="table-menu-dropdown">
                            <button type="button" class="table-menu-item btn-setting-edit" data-category="${escapeHtml(category)}" data-val="${escapeHtml(primaryVal)}" data-desc="${escapeHtml(descVal)}" data-color="${escapeHtml(colorVal)}">Edytuj</button>
                            <button type="button" class="table-menu-item table-menu-item-danger btn-setting-delete" data-category="${escapeHtml(category)}" data-val="${escapeHtml(primaryVal)}">Usuń</button>
                        </div>
                    </div>
                </td>
            `;
        }
        html += "</tr>";
    });

    html += "</tbody></table>";
    container.innerHTML = html;
}

window.openEditSettingModal = function(category, value, description, color = "") {
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

    const colorGroup = document.getElementById("editSettingColorGroup");
    const colorInput = document.getElementById("editSettingNewColor");
    const colorPicker = document.getElementById("editSettingNewColorPicker");
    if (category === "Stan") {
        if (colorGroup) colorGroup.style.display = "block";
        const cleanColor = (color || "").trim();
        if (colorInput) colorInput.value = cleanColor;
        if (colorPicker) colorPicker.value = /^#[0-9A-Fa-f]{6}$/.test(cleanColor) ? cleanColor : "#2a4365";
    } else {
        if (colorGroup) colorGroup.style.display = "none";
        if (colorInput) colorInput.value = "";
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
    const newColorInput = document.getElementById("editSettingNewColor");
    const newColor = newColorInput ? newColorInput.value.trim() : "";

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
                if (category === "Stan") {
                    r["Kolor"] = newColor;
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
        renderProfileShowcase();
    }

    const apiParams = {
        action: "updateSettingsItem",
        category: category,
        oldValue: oldValue,
        newValue: newValue,
        newDescription: newDesc,
        newColor: newColor
    };

    enqueueSyncTask(
        `Edycja słownika [${category}]: ${oldValue} -> ${newValue}`,
        async () => {
            const res = await sendApiRequest(apiParams);
            if (res.status === "success") {
                invalidateSettingsCache();
                await fetchSettingsAndStats(true);
                renderGamesGrid();
                renderProfileShowcase();
            }
            return res;
        },
        () => {
            // Rollback w przypadku błędu
            if (catData && previousRows) {
                catData.rows = previousRows;
                renderStatsTables();
                populateFilterOptions();
                renderGamesGrid();
                renderProfileShowcase();
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

function handleAddSetting(category, inputValId, inputDescId = null, inputColorId = null) {
    if (!state.isAdmin) return;

    const valInput = document.getElementById(inputValId);
    const descInput = inputDescId ? document.getElementById(inputDescId) : null;
    const colorInput = inputColorId ? document.getElementById(inputColorId) : null;

    const val = valInput ? valInput.value.trim() : "";
    const desc = descInput ? descInput.value.trim() : "";
    const colorVal = colorInput ? colorInput.value.trim() : "";

    if (!val) {
        alert("Podaj wartość do dodania.");
        return;
    }

    if (valInput) valInput.value = "";
    if (descInput) descInput.value = "";
    if (colorInput) colorInput.value = "";

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
            } else if (h === "Kolor") {
                newRow[h] = colorVal;
            } else if (h === `Opis ${category.toLowerCase()}` || h === "Opis" || h.includes("Opis")) {
                newRow[h] = desc;
            } else {
                newRow[h] = 0;
            }
        });
        catData.rows.push(newRow);
        renderStatsTables();
        populateFilterOptions();
        renderGamesGrid();
        renderProfileShowcase();
    }

    const apiParams = {
        action: "addSettingsItem",
        category: category,
        value: val,
        description: desc,
        color: colorVal
    };

    enqueueSyncTask(
        `Dodawanie do słownika [${category}]: ${val}`,
        async () => {
            const res = await sendApiRequest(apiParams);
            if (res.status === "success") {
                invalidateSettingsCache();
                await fetchSettingsAndStats(true);
                renderGamesGrid();
                renderProfileShowcase();
            }
            return res;
        },
        () => {
            // Rollback w przypadku błędu
            if (catData && previousRows) {
                catData.rows = previousRows;
                renderStatsTables();
                populateFilterOptions();
                renderGamesGrid();
                renderProfileShowcase();
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