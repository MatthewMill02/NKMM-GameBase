/**
 * NKMM Baza Gier - Główny skrypt aplikacji (ES6+)
 * Wytyczne: Czysty JavaScript, brak emotek, obsługa losowego rozmieszczania głów,
 * dynamiczne przełączanie widoków, komunikacja JSONP z Google Apps Script,
 * pełne cachowanie danych w ramach sesji (sessionStorage + pamięć) w celu ochrony limitów API.
 */

// Adres wdrożonej aplikacji Google Apps Script
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwMoziDDLE2_1OcBPpwt4kNhF1jLmbPkumknpOmAeAgsJ5W_Vud6V12WrLjbOrJo43e/exec";

// Klucze pamięci sesyjnej
const CACHE_KEYS = {
    USERS: "nkmm_cache_users",
    GAMES_PREFIX: "nkmm_cache_games_",
    SETTINGS: "nkmm_cache_settings"
};

// Stan aplikacji
const state = {
    currentScreen: "welcome", // "welcome" | "dashboard"
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
        status: "",
        platform: "",
        collection: "",
        sort: "title_asc"
    }
};

// ===================================================
// INICJALIZACJA APLIKACJI
// ===================================================

document.addEventListener("DOMContentLoaded", () => {
    initEvents();
    initSessionCache();
    renderWelcomeHeads();
    
    // Wstępne wczytanie (z pamięci sesji lub w tle z API)
    fetchUsersList(false);
    fetchSettingsAndStats(false);
});

function initEvents() {
    // Nawigacja
    document.getElementById("btnNavHome").addEventListener("click", showWelcomeScreen);
    document.getElementById("footerHomeLink").addEventListener("click", (e) => {
        e.preventDefault();
        showWelcomeScreen();
    });

    // Przycisk wymuszonego odświeżenia danych z chmury (ominięcie cache)
    document.getElementById("btnRefreshData").addEventListener("click", handleForceRefreshAll);

    // Przełącznik użytkownika w nagłówku
    document.getElementById("headerUserSelect").addEventListener("change", (e) => {
        const selectedCode = e.target.value;
        const user = state.users.find(u => u.code === selectedCode);
        if (user) switchUserProfile(user);
    });

    // Wyszukiwarka i sortowanie
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

    // Filtry
    document.getElementById("filterStatus").addEventListener("change", (e) => {
        state.filters.status = e.target.value;
        renderGamesGrid();
    });
    document.getElementById("filterPlatform").addEventListener("change", (e) => {
        state.filters.platform = e.target.value;
        renderGamesGrid();
    });
    document.getElementById("filterCollection").addEventListener("change", (e) => {
        state.filters.collection = e.target.value;
        renderGamesGrid();
    });
    document.getElementById("btnResetFilters").addEventListener("click", resetFilters);

    // Modale - zamykanie
    document.querySelectorAll("[data-close]").forEach(btn => {
        btn.addEventListener("click", (e) => {
            const modalId = e.currentTarget.getAttribute("data-close");
            closeModal(modalId);
        });
    });

    // Kliknięcie w tło modala
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

    // Statystyki
    document.getElementById("btnToggleStats").addEventListener("click", openStatsModal);
    initStatsTabs();

    // Dodawanie do słowników
    document.getElementById("btnAddStan").addEventListener("click", () => handleAddSetting("Stan", "newStanVal", "newStanDesc"));
    document.getElementById("btnAddKol").addEventListener("click", () => handleAddSetting("Kolekcje", "newKolVal", "newKolDesc"));
    document.getElementById("btnAddPlat").addEventListener("click", () => handleAddSetting("Platformy", "newPlatVal"));

    // Zmiana rozmiaru okna - przeliczenie pozycji głów
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
        // Wczytanie listy użytkowników z sesji
        const cachedUsers = sessionStorage.getItem(CACHE_KEYS.USERS);
        if (cachedUsers) {
            const parsed = JSON.parse(cachedUsers);
            if (Array.isArray(parsed) && parsed.length > 0) {
                state.users = parsed;
                state.cache.users = parsed;
            }
        }

        // Wczytanie słowników i statystyk z sesji
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
    btn.textContent = "[Odśwież z chmury]";
}

// ===================================================
// EKRAN POWITALNY - LOSOWE ROZMIESZCZENIE GŁÓWEK
// ===================================================

function renderWelcomeHeads() {
    const container = document.getElementById("headsScatterContainer");
    const centerBox = document.getElementById("welcomeCenterBox");
    if (!container || !centerBox) return;

    container.innerHTML = "";

    const containerRect = container.getBoundingClientRect();
    const boxRect = centerBox.getBoundingClientRect();

    const headWidth = 110;
    const headHeight = 120;
    const padding = 20;

    // Obszar wyłączony (środkowy box z nagłówkiem)
    const forbiddenZone = {
        left: (boxRect.left - containerRect.left) - 30,
        top: (boxRect.top - containerRect.top) - 30,
        right: (boxRect.right - containerRect.left) + 30,
        bottom: (boxRect.bottom - containerRect.top) + 30
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

            // Sprawdzenie kolizji ze środkowym nagłówkiem
            const overlapsCenter = (
                x + headWidth > forbiddenZone.left &&
                x < forbiddenZone.right &&
                y + headHeight > forbiddenZone.top &&
                y < forbiddenZone.bottom
            );

            // Sprawdzenie kolizji z innymi główkami
            const overlapsOther = placedPositions.some(pos => {
                return Math.abs(pos.x - x) < (headWidth + 20) && Math.abs(pos.y - y) < (headHeight + 20);
            });

            if (!overlapsCenter && !overlapsOther) {
                valid = true;
            }
        }

        placedPositions.push({ x, y });

        // Tworzenie kafelka główki
        const card = document.createElement("div");
        card.className = "scatter-head-card";
        card.style.left = `${x}px`;
        card.style.top = `${y}px`;
        card.setAttribute("title", `Kliknij, aby otworzyć bazę gracza: ${user.name}`);

        card.innerHTML = `
            <img src="${user.avatar}" alt="${user.code}" class="scatter-head-img" onerror="this.src='assets/matthewmill.PNG'">
            <span class="scatter-head-name">${user.name}</span>
            <span class="scatter-head-code">${user.sheetName}</span>
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
    document.getElementById("welcomeScreen").style.display = "flex";
    document.getElementById("dashboardScreen").style.display = "none";
    document.getElementById("activeProfileIndicator").style.display = "none";
    document.getElementById("userQuickSwitch").style.display = "none";
    document.getElementById("btnToggleStats").style.display = "none";
    renderWelcomeHeads();
}

function showDashboardScreen() {
    state.currentScreen = "dashboard";
    document.getElementById("welcomeScreen").style.display = "none";
    document.getElementById("dashboardScreen").style.display = "block";
    document.getElementById("activeProfileIndicator").style.display = "flex";
    document.getElementById("userQuickSwitch").style.display = "flex";
    document.getElementById("btnToggleStats").style.display = "inline-block";
}

// ===================================================
// ZARZĄDZANIE PROFILAMI UŻYTKOWNIKÓW
// ===================================================

function switchUserProfile(user) {
    state.currentUser = user;
    applyUserTheme(user);
    showDashboardScreen();

    // Aktualizacja wskaźnika w nagłówku
    document.getElementById("activeProfileAvatar").src = user.avatar;
    document.getElementById("activeProfileName").textContent = user.name;

    // Aktualizacja selektora w nagłówku
    populateHeaderUserSelect();

    // Pobranie gier (z cache lub z API jeśli brak w sesji)
    loadGamesForUser(user.sheetName, false);
}

function populateHeaderUserSelect() {
    const select = document.getElementById("headerUserSelect");
    select.innerHTML = "";
    state.users.forEach(u => {
        const opt = document.createElement("option");
        opt.value = u.code;
        opt.textContent = u.name;
        if (state.currentUser && state.currentUser.code === u.code) {
            opt.selected = true;
        }
        select.appendChild(opt);
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
            response.data.forEach(remoteUser => {
                let existing = state.users.find(u => u.code === remoteUser.code);
                if (!existing) {
                    const isMM = remoteUser.code === "MM";
                    const isNK = remoteUser.code === "NK";
                    existing = {
                        code: remoteUser.code,
                        name: isMM ? "MatthewMill (MM)" : (isNK ? "R4sheg (NK)" : `${remoteUser.name} (${remoteUser.code})`),
                        sheetName: remoteUser.sheetName,
                        avatar: isMM ? "assets/matthewmill.PNG" : (isNK ? "assets/rasheg.PNG" : "assets/matthewmill.PNG"),
                        color: isMM ? "#13a71f" : (isNK ? "#A81214" : (remoteUser.tabColor || "#2a4365")),
                        hoverColor: isMM ? "#0f8518" : (isNK ? "#860e10" : (remoteUser.tabColor || "#1e314b"))
                    };
                    state.users.push(existing);
                } else {
                    if (remoteUser.code === "MM") {
                        existing.name = "MatthewMill (MM)";
                        existing.color = "#13a71f";
                        existing.hoverColor = "#0f8518";
                    } else if (remoteUser.code === "NK") {
                        existing.name = "R4sheg (NK)";
                        existing.color = "#A81214";
                        existing.hoverColor = "#860e10";
                    }
                }
            });

            state.cache.users = state.users;
            try {
                sessionStorage.setItem(CACHE_KEYS.USERS, JSON.stringify(state.users));
            } catch (e) {}

            if (state.currentScreen === "welcome") {
                renderWelcomeHeads();
            }
            populateHeaderUserSelect();
        }
    } catch (e) {
        console.warn("Użyto lokalnej konfiguracji użytkowników.");
    }
}

// ===================================================
// KOMUNIKACJA SIECIOWA (JSONP API)
// ===================================================

function sendApiRequest(params, customPassword = null) {
    return new Promise((resolve, reject) => {
        const callbackName = "jsonp_cb_" + Math.round(1000000 * Math.random());
        const passwordToSend = customPassword !== null ? customPassword : state.adminPassword;

        window[callbackName] = function(data) {
            delete window[callbackName];
            if (script.parentNode) script.parentNode.removeChild(script);
            resolve(data);
        };

        const queryParams = new URLSearchParams(params);
        queryParams.append("callback", callbackName);
        if (passwordToSend) {
            queryParams.append("pass", passwordToSend);
        }

        const script = document.createElement("script");
        script.src = GOOGLE_SCRIPT_URL + "?" + queryParams.toString();
        script.onerror = () => {
            delete window[callbackName];
            if (script.parentNode) script.parentNode.removeChild(script);
            reject(new Error("Błąd połączenia z serwerem Google Apps Script."));
        };

        document.body.appendChild(script);
    });
}

// ===================================================
// POBIERANIE I WYŚWIETLANIE GIER
// ===================================================

async function loadGamesForUser(sheetName, forceRefresh = false) {
    const skeletonLoader = document.getElementById("skeletonLoader");
    const gamesGrid = document.getElementById("gamesGrid");
    const emptyResults = document.getElementById("emptyResultsMessage");
    const resultsCount = document.getElementById("resultsCount");

    // 1. Sprawdzenie pamięci podręcznej sesji
    if (!forceRefresh) {
        const cached = getCachedGames(sheetName);
        if (cached !== null) {
            state.games = cached;
            populateFilterOptions();
            renderGamesGrid();
            return;
        }
    }

    // 2. Jeśli brak w pamięci lub wymuszone odświeżenie - pobranie z API
    skeletonLoader.style.display = "grid";
    gamesGrid.style.display = "none";
    emptyResults.style.display = "none";
    resultsCount.textContent = "Pobieranie bazy gier z chmury...";

    try {
        const response = await sendApiRequest({
            action: "getAllGames",
            user: sheetName
        });

        if (response.status === "success") {
            state.games = Array.isArray(response.data) ? response.data : [];
            setCachedGames(sheetName, state.games);
            populateFilterOptions();
            renderGamesGrid();
        } else {
            resultsCount.textContent = `Błąd: ${response.message}`;
            skeletonLoader.style.display = "none";
        }
    } catch (error) {
        resultsCount.textContent = "Błąd sieciowy podczas pobierania danych.";
        skeletonLoader.style.display = "none";
    }
}

function renderGamesGrid() {
    const skeletonLoader = document.getElementById("skeletonLoader");
    const gamesGrid = document.getElementById("gamesGrid");
    const emptyResults = document.getElementById("emptyResultsMessage");
    const resultsCount = document.getElementById("resultsCount");

    skeletonLoader.style.display = "none";

    let filtered = state.games.filter(game => {
        // Wyszukiwarka
        if (state.filters.search) {
            const query = state.filters.search;
            const title = (game["Tytuł"] || "").toLowerCase();
            const platform = (game["Platforma"] || "").toLowerCase();
            const collections = (game["Kolekcje"] || "").toLowerCase();
            const review = (game["Recenzja"] || "").toLowerCase();
            if (!title.includes(query) && !platform.includes(query) && !collections.includes(query) && !review.includes(query)) {
                return false;
            }
        }
        // Stan
        if (state.filters.status && game["Stan"] !== state.filters.status) {
            return false;
        }
        // Platforma
        if (state.filters.platform && game["Platforma"] !== state.filters.platform) {
            return false;
        }
        // Kolekcje
        if (state.filters.collection) {
            const col = game["Kolekcje"] || "";
            if (!col.includes(state.filters.collection)) {
                return false;
            }
        }
        return true;
    });

    // Sortowanie
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

    resultsCount.textContent = `Wyświetlono: ${filtered.length} z ${state.games.length} tytułów`;

    if (filtered.length === 0) {
        gamesGrid.style.display = "none";
        emptyResults.style.display = "block";
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
        const rating = game["Ocena gry"] !== "" && game["Ocena gry"] !== undefined ? game["Ocena gry"] : "-";
        const hours = game["Liczba godzin"] ? `${game["Liczba godzin"]}h` : "";
        const date = game["Data ukończenia"] ? formatDate(game["Data ukończenia"]) : "";
        const review = escapeHtml(game["Recenzja"] || "");

        // Tagi
        const tags = (game["Kolekcje"] || "").split(",").map(t => t.trim()).filter(Boolean);
        const tagsHtml = tags.map(t => `<span class="tag-pill">${escapeHtml(t)}</span>`).join("");

        // Przyciski akcji admina
        let adminButtonsHtml = "";
        if (state.isAdmin) {
            adminButtonsHtml = `
                <div class="card-actions">
                    <button class="btn-card-action btn-card-edit" data-edit-id="${game.id}">Edytuj</button>
                    <button class="btn-card-action btn-card-delete" data-delete-id="${game.id}">Usuń</button>
                </div>
            `;
        }

        card.innerHTML = `
            <div class="game-card-content">
                <div class="game-card-header">
                    <h3 class="game-title">${title}</h3>
                    <div class="game-rating-badge" title="Ocena ogólna: ${rating}/10">${rating}/10</div>
                </div>
                <div class="game-meta-row">
                    <span class="badge-status">${status}</span>
                    <span class="badge-platform">${platform}</span>
                    ${hours ? `<span class="badge-platform">${hours}</span>` : ""}
                </div>
                ${tagsHtml ? `<div class="game-tags">${tagsHtml}</div>` : ""}
                ${review ? `<div class="game-review-snippet">${review.substring(0, 140)}${review.length > 140 ? "..." : ""}</div>` : ""}
            </div>
            <div class="game-card-footer">
                <span>${date ? `Ukończono: ${date}` : `ID: ${game.id || "-"}`}</span>
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

function populateFilterOptions() {
    const statusSelect = document.getElementById("filterStatus");
    const platformSelect = document.getElementById("filterPlatform");
    const collectionSelect = document.getElementById("filterCollection");

    const statuses = new Set();
    const platforms = new Set();
    const collections = new Set();

    state.games.forEach(g => {
        if (g["Stan"]) statuses.add(g["Stan"]);
        if (g["Platforma"]) platforms.add(g["Platforma"]);
        if (g["Kolekcje"]) {
            g["Kolekcje"].split(",").forEach(t => {
                const clean = t.trim();
                if (clean) collections.add(clean);
            });
        }
    });

    populateSelect(statusSelect, Array.from(statuses).sort(), "Wszystkie stany", state.filters.status);
    populateSelect(platformSelect, Array.from(platforms).sort(), "Wszystkie platformy", state.filters.platform);
    populateSelect(collectionSelect, Array.from(collections).sort(), "Wszystkie kolekcje", state.filters.collection);
}

function populateSelect(selectEl, items, defaultLabel, currentValue) {
    selectEl.innerHTML = `<option value="">${defaultLabel}</option>`;
    items.forEach(item => {
        const opt = document.createElement("option");
        opt.value = item;
        opt.textContent = item;
        if (item === currentValue) opt.selected = true;
        selectEl.appendChild(opt);
    });
}

function resetFilters() {
    state.filters.search = "";
    state.filters.status = "";
    state.filters.platform = "";
    state.filters.collection = "";
    state.filters.sort = "title_asc";

    document.getElementById("searchInput").value = "";
    document.getElementById("btnClearSearch").style.display = "none";
    document.getElementById("filterStatus").value = "";
    document.getElementById("filterPlatform").value = "";
    document.getElementById("filterCollection").value = "";
    document.getElementById("sortSelect").value = "title_asc";

    renderGamesGrid();
}

// ===================================================
// MODAL: SZCZEGÓŁY GRY
// ===================================================

function openGameDetailsModal(game) {
    document.getElementById("modalGameTitle").textContent = game["Tytuł"] || "Szczegóły gry";
    const body = document.getElementById("modalGameBody");

    const fabuła = game["Ocena fabuły"] !== "" && game["Ocena fabuły"] !== undefined ? game["Ocena fabuły"] : "-";
    const grafika = game["Ocena grafiki"] !== "" && game["Ocena grafiki"] !== undefined ? game["Ocena grafiki"] : "-";
    const mechaniki = game["Ocena mechanik"] !== "" && game["Ocena mechanik"] !== undefined ? game["Ocena mechanik"] : "-";
    const ocenaOgólna = game["Ocena gry"] !== "" && game["Ocena gry"] !== undefined ? game["Ocena gry"] : "-";

    body.innerHTML = `
        <div style="margin-bottom: 16px;">
            <div style="font-size: 15px; margin-bottom: 8px;">
                <strong>Stan:</strong> ${escapeHtml(game["Stan"] || "-")} | 
                <strong>Platforma:</strong> ${escapeHtml(game["Platforma"] || "-")} | 
                <strong>Czas gry:</strong> ${game["Liczba godzin"] ? `${game["Liczba godzin"]}h` : "-"}
            </div>
            <div style="font-size: 14px; margin-bottom: 8px;">
                <strong>Data ukończenia:</strong> ${game["Data ukończenia"] ? formatDate(game["Data ukończenia"]) : "-"}
            </div>
            <div style="font-size: 14px; margin-bottom: 14px;">
                <strong>Kolekcje / Tagi:</strong> ${escapeHtml(game["Kolekcje"] || "Brak")}
            </div>
        </div>

        <div style="background: var(--color-bg); padding: 12px; border-radius: var(--radius-sm); margin-bottom: 16px;">
            <h4 style="margin-bottom: 8px; color: var(--color-primary);">Zestawienie ocen (0-10):</h4>
            <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; text-align: center;">
                <div style="background: white; padding: 6px; border: 1px solid var(--color-border); border-radius: 4px;">
                    <div style="font-size: 12px; color: var(--color-text-muted);">Fabuła</div>
                    <div style="font-weight: bold; font-size: 16px;">${fabuła}</div>
                </div>
                <div style="background: white; padding: 6px; border: 1px solid var(--color-border); border-radius: 4px;">
                    <div style="font-size: 12px; color: var(--color-text-muted);">Grafika</div>
                    <div style="font-weight: bold; font-size: 16px;">${grafika}</div>
                </div>
                <div style="background: white; padding: 6px; border: 1px solid var(--color-border); border-radius: 4px;">
                    <div style="font-size: 12px; color: var(--color-text-muted);">Mechanika</div>
                    <div style="font-weight: bold; font-size: 16px;">${mechaniki}</div>
                </div>
                <div style="background: white; padding: 6px; border: 1px solid var(--color-primary); border-radius: 4px;">
                    <div style="font-size: 12px; color: var(--color-primary);">Ocena Gry</div>
                    <div style="font-weight: bold; font-size: 16px; color: var(--color-primary);">${ocenaOgólna}</div>
                </div>
            </div>
        </div>

        ${game["Recenzja"] ? `
            <div>
                <h4 style="margin-bottom: 6px; color: var(--color-primary);">Recenzja / Notatka:</h4>
                <div style="white-space: pre-wrap; background: white; padding: 12px; border: 1px solid var(--color-border); border-radius: 4px; font-size: 14px; line-height: 1.5;">${escapeHtml(game["Recenzja"])}</div>
            </div>
        ` : ""}
    `;

    openModal("gameDetailsModal");
}

// ===================================================
// ADMINISTRACJA I LOGOWANIE
// ===================================================

async function handleAdminLogin(e) {
    e.preventDefault();
    const passInput = document.getElementById("adminPasswordInput");
    const errorDiv = document.getElementById("adminLoginError");
    const submitBtn = document.getElementById("btnSubmitAdminLogin");

    errorDiv.style.display = "none";
    submitBtn.disabled = true;
    submitBtn.textContent = "Weryfikacja...";

    const enteredPass = passInput.value;

    try {
        const response = await sendApiRequest({ action: "getSettingsAndStats" }, enteredPass);

        if (response.status === "success") {
            state.isAdmin = true;
            state.adminPassword = enteredPass;

            closeModal("adminLoginModal");
            passInput.value = "";
            applyAdminUiState();
            renderGamesGrid();
        } else {
            errorDiv.textContent = "Błędne hasło administratora!";
            errorDiv.style.display = "block";
        }
    } catch (err) {
        errorDiv.textContent = "Błąd połączenia podczas autoryzacji.";
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
}

function applyAdminUiState() {
    const adminBadge = document.getElementById("adminBadge");
    const btnAdminLogin = document.getElementById("btnAdminLoginModal");
    const adminActionsBar = document.getElementById("adminActionsBar");
    const adminOnlyBlocks = document.querySelectorAll(".admin-only-block");

    if (state.isAdmin) {
        adminBadge.style.display = "flex";
        btnAdminLogin.style.display = "none";
        adminActionsBar.style.display = "flex";
        adminOnlyBlocks.forEach(el => el.style.display = "flex");
    } else {
        adminBadge.style.display = "none";
        btnAdminLogin.style.display = "inline-block";
        adminActionsBar.style.display = "none";
        adminOnlyBlocks.forEach(el => el.style.display = "none");
    }
}

// ===================================================
// DODAWANIE / EDYCJA GRY
// ===================================================

function openGameEditModal(game = null) {
    if (!state.isAdmin) {
        alert("Wymagane uprawnienia administratora.");
        return;
    }

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

async function handleGameFormSubmit(e) {
    e.preventDefault();
    if (!state.currentUser) return;

    const errorDiv = document.getElementById("gameEditError");
    const submitBtn = document.getElementById("btnSaveGameSubmit");
    errorDiv.style.display = "none";
    submitBtn.disabled = true;
    submitBtn.textContent = "Zapisywanie w chmurze...";

    const gameId = document.getElementById("formGameId").value;
    const isEdit = !!gameId;

    const gameDetails = {
        "Tytuł": document.getElementById("formGameTitle").value.trim(),
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

    try {
        const response = await sendApiRequest({
            action: isEdit ? "editGame" : "addGame",
            user: state.currentUser.sheetName,
            gameId: gameId,
            gameDetails: JSON.stringify(gameDetails)
        });

        if (response.status === "success") {
            closeModal("gameEditModal");
            // Unieważnienie cache dla tego użytkownika i statystyk
            invalidateGamesCache(state.currentUser.sheetName);
            invalidateSettingsCache();
            await loadGamesForUser(state.currentUser.sheetName, true);
        } else {
            errorDiv.textContent = `Błąd zapisu: ${response.message}`;
            errorDiv.style.display = "block";
        }
    } catch (err) {
        errorDiv.textContent = "Błąd sieciowy podczas zapisu.";
        errorDiv.style.display = "block";
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "Zapisz w arkuszu";
    }
}

async function handleDeleteGame(gameId, title) {
    if (!state.currentUser || !state.isAdmin) return;

    if (!confirm(`Czy na pewno chcesz usunąć grę "${title}" z bazy?`)) return;

    try {
        const response = await sendApiRequest({
            action: "deleteGame",
            user: state.currentUser.sheetName,
            gameId: gameId
        });

        if (response.status === "success") {
            invalidateGamesCache(state.currentUser.sheetName);
            invalidateSettingsCache();
            await loadGamesForUser(state.currentUser.sheetName, true);
        } else {
            alert(`Błąd usuwania: ${response.message}`);
        }
    } catch (e) {
        alert("Błąd połączenia podczas usuwania wpisu.");
    }
}

// ===================================================
// DODAWANIE NOWEGO UŻYTKOWNIKA
// ===================================================

async function handleAddUserSubmit(e) {
    e.preventDefault();
    if (!state.isAdmin) return;

    const errorDiv = document.getElementById("addUserError");
    const submitBtn = document.getElementById("btnSubmitAddUser");
    errorDiv.style.display = "none";
    submitBtn.disabled = true;
    submitBtn.textContent = "Tworzenie arkusza i formuł...";

    const userName = document.getElementById("newUserName").value.trim();
    const userCode = document.getElementById("newUserCode").value.trim().toUpperCase();
    const userColor = document.getElementById("newUserColor").value;

    try {
        const response = await sendApiRequest({
            action: "addUser",
            userName: userName,
            userCode: userCode,
            tabColor: userColor
        });

        if (response.status === "success") {
            const newUser = {
                code: userCode,
                name: `${userName} (${userCode})`,
                sheetName: `Baza gier ${userCode}`,
                avatar: "assets/matthewmill.PNG"
            };
            state.users.push(newUser);
            
            // Invalidate cache
            invalidateUsersCache();
            invalidateSettingsCache();
            try {
                sessionStorage.setItem(CACHE_KEYS.USERS, JSON.stringify(state.users));
            } catch (e) {}

            closeModal("addUserModal");
            document.getElementById("addUserForm").reset();
            populateHeaderUserSelect();
            switchUserProfile(newUser);
            alert(`Pomyślnie utworzono nowy profil i arkusz: Baza gier ${userCode}`);
        } else {
            errorDiv.textContent = `Błąd: ${response.message}`;
            errorDiv.style.display = "block";
        }
    } catch (err) {
        errorDiv.textContent = "Błąd sieciowy podczas tworzenia profilu.";
        errorDiv.style.display = "block";
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "Utwórz profil i arkusz";
    }
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

async function handleAddSetting(category, inputValId, inputDescId = null) {
    if (!state.isAdmin) return;

    const valInput = document.getElementById(inputValId);
    const descInput = inputDescId ? document.getElementById(inputDescId) : null;

    const val = valInput ? valInput.value.trim() : "";
    const desc = descInput ? descInput.value.trim() : "";

    if (!val) {
        alert("Podaj wartość do dodania.");
        return;
    }

    try {
        const response = await sendApiRequest({
            action: "addSettingsItem",
            category: category,
            value: val,
            description: desc
        });

        if (response.status === "success") {
            if (valInput) valInput.value = "";
            if (descInput) descInput.value = "";
            invalidateSettingsCache();
            await fetchSettingsAndStats(true);
        } else {
            alert(`Błąd: ${response.message}`);
        }
    } catch (e) {
        alert("Błąd połączenia podczas dodawania do słownika.");
    }
}

window.handleDeleteSettingItem = async function(category, value) {
    if (!state.isAdmin) return;

    if (!confirm(`Czy na pewno chcesz usunąć "${value}" ze słownika ${category}?`)) return;

    try {
        const response = await sendApiRequest({
            action: "deleteSettingsItem",
            category: category,
            value: value
        });

        if (response.status === "success") {
            invalidateSettingsCache();
            await fetchSettingsAndStats(true);
        } else {
            alert(`Błąd usuwania: ${response.message}`);
        }
    } catch (e) {
        alert("Błąd połączenia.");
    }
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