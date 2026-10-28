/**
 * NKMM Baza Gier - Renderowanie półek z grami, paginacja i widok szczegółów (Monitor)
 */

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

    const demoBadgeHtml = isDemo ? `<span class="demo-tag-label" style="font-size: 14px; padding: 2px 8px; background: #9c27b0; color: #fff; border-radius: 3px; margin-left: 6px;">Demo</span>` : "";
    const tagsHtml = visibleTags.map(t => {
        const col = getTagColor(t);
        return `<span class="tag-pill" style="background-color: ${col.bg}; border-color: ${col.border}; color: ${col.text}; font-size: 14px;">${escapeHtml(t)}</span>`;
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
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; text-align: center; font-size: 14px;">
                <div><span style="color: var(--color-text-muted); display: block;">Fabuła</span><strong>${fabuła}</strong></div>
                <div><span style="color: var(--color-text-muted); display: block;">Grafika</span><strong>${grafika}</strong></div>
                <div><span style="color: var(--color-text-muted); display: block;">Mechanika</span><strong>${mechanika}</strong></div>
            </div>
        </div>

        ${tagsHtml ? `
            <div style="margin-bottom: 12px;">
                <span style="font-size: 14px; color: var(--color-text-muted); text-transform: uppercase; font-weight: bold; display: block; margin-bottom: 4px;">Kolekcje / Tagi:</span>
                <div class="game-tags" style="margin: 0; border: none; padding: 0;">${tagsHtml}</div>
            </div>
        ` : ""}

        ${review ? `
            <div style="margin-bottom: 10px;">
                <span style="font-size: 14px; color: var(--color-text-muted); text-transform: uppercase; font-weight: bold; display: block; margin-bottom: 4px;">Recenzja / Notatka:</span>
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

    const btnExtEdit = document.getElementById("btnMonitorExtEdit");
    const btnExtDelete = document.getElementById("btnMonitorExtDelete");

    if (!game) {
        screen.innerHTML = "";
        if (btnExtEdit) {
            btnExtEdit.disabled = true;
            btnExtEdit.innerHTML = "";
            btnExtEdit.onclick = null;
        }
        if (btnExtDelete) {
            btnExtDelete.disabled = true;
            btnExtDelete.innerHTML = "";
            btnExtDelete.onclick = null;
        }
        return;
    }

    // Aktualizacja przycisków pod obrazem
    if (btnExtEdit) {
        btnExtEdit.disabled = false;
        btnExtEdit.innerHTML = `<span>Edytuj grę</span>`;
        btnExtEdit.onclick = () => openGameEditModal(game);
    }
    if (btnExtDelete) {
        btnExtDelete.disabled = false;
        btnExtDelete.innerHTML = `<span>Usuń grę</span>`;
        btnExtDelete.onclick = () => handleDeleteGame(game.id, game["Tytuł"]);
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

    const demoBadgeHtml = isDemo ? `<span class="demo-tag-label" style="font-size: 14px; padding: 2px 8px; background: #9c27b0; color: #fff; border-radius: 3px; margin-left: 6px;">Demo</span>` : "";
    const tagsHtml = visibleTags.map(t => {
        const col = getTagColor(t);
        return `<span class="tag-pill" style="background-color: ${col.bg}; border-color: ${col.border}; color: ${col.text}; font-size: 14px;">${escapeHtml(t)}</span>`;
    }).join("");

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
        </div>
    `;

    const coverBtn = screen.querySelector("#monitorCoverBtn");
    if (coverBtn) {
        coverBtn.addEventListener("click", () => openGameDetailsModal(game));
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

    // Ustalenie aktywnej gry dla monitora (jeśli gra była wybrana, pobieramy jej najświeższe dane z bazy)
    if (state.selectedGame) {
        const freshSelected = state.games.find(g => String(g.id) === String(state.selectedGame.id));
        if (freshSelected) {
            state.selectedGame = freshSelected;
        } else {
            state.selectedGame = null;
        }
    }
    renderMonitorGameDetails(state.selectedGame);

    const groupBy = state.filters.group || "none";
    const paginationBar = document.getElementById("shelvesPaginationBar");

    if (groupBy === "none") {
        document.body.classList.remove("has-grouped-shelves");
        // Domyślny widok bez grupowania - paginacja według pojemności ekranu (15 desktop, 8 laptop, 6 mobile)
        const pageSize = getPageShelfCapacity();
        const totalShelvesNeeded = Math.ceil(filtered.length / 8);
        const totalPages = Math.max(1, Math.ceil(totalShelvesNeeded / pageSize));
        state.pagination.totalPages = totalPages;

        if (state.pagination.currentPage > totalPages) {
            state.pagination.currentPage = totalPages;
        }
        if (state.pagination.currentPage < 1) {
            state.pagination.currentPage = 1;
        }

        const currentPg = state.pagination.currentPage;
        const startGameIdx = (currentPg - 1) * (pageSize * 8);
        const pageGames = filtered.slice(startGameIdx, startGameIdx + (pageSize * 8));

        const shelvesRow = document.createElement("div");
        shelvesRow.className = "shelf-group-shelves-row";
        renderShelfUnitsForGames(pageGames, shelvesRow, true);
        shelvesContainer.appendChild(shelvesRow);

        renderPaginationControls(totalPages, null);
        attachMobileSwipeToShelves(shelvesContainer);
    } else {
        // Widok pogrupowany: KAŻDA KATEGORIA TO OSOBNA STRONA PAGINACJI!
        document.body.classList.remove("has-grouped-shelves");

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

        const totalPages = sortedGroupKeys.length;
        state.pagination.totalPages = totalPages;

        if (state.pagination.currentPage > totalPages) {
            state.pagination.currentPage = totalPages;
        }
        if (state.pagination.currentPage < 1) {
            state.pagination.currentPage = 1;
        }

        const currentGroupIndex = state.pagination.currentPage - 1;
        const activeGroupKey = sortedGroupKeys[currentGroupIndex];
        const gamesInGroup = groupsMap.get(activeGroupKey) || [];

        // Renderowanie aktywnej grupy jako bieżącej strony
        const section = document.createElement("div");
        section.className = "shelf-group-section";

        const header = document.createElement("div");
        header.className = "shelf-group-header";
        header.textContent = `${activeGroupKey} (${gamesInGroup.length})`;
        section.appendChild(header);

        const shelvesRow = document.createElement("div");
        shelvesRow.className = "shelf-group-shelves-row";
        renderShelfUnitsForGames(gamesInGroup, shelvesRow, true);
        section.appendChild(shelvesRow);

        shelvesContainer.appendChild(section);

        // Wyświetlenie paska paginacji z nazwami kategorii
        renderPaginationControls(totalPages, sortedGroupKeys);
        attachMobileSwipeToShelves(shelvesContainer);
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

function getPageShelfCapacity() {
    const width = window.innerWidth;
    if (width <= 768) {
        return 6; // Mobile: 2 kolumny x 3 rzędy
    }
    if (width <= 1540) {
        return 8; // Laptop: 4 kolumny x 2 rzędy
    }
    return 15; // Desktop: 5 kolumn x 3 rzędy
}

function getShelfGridColumnsCount() {
    const width = window.innerWidth;
    if (width <= 768) return 2;
    if (width <= 1540) return 4;
    return 5;
}

function renderShelfUnitsForGames(gamesList, container, applyAnimation = false) {
    const SHELF_CAPACITY = 8;
    const colsCount = getShelfGridColumnsCount();
    let shelfIndex = 0;

    for (let i = 0; i < gamesList.length; i += SHELF_CAPACITY) {
        const shelfChunk = gamesList.slice(i, i + SHELF_CAPACITY);

        const shelfUnit = document.createElement("div");
        shelfUnit.className = "game-shelf-unit";

        if (applyAnimation) {
            shelfUnit.classList.add("shelf-anim-enter");
            // Kaskada po przekątnej od lewego górnego rogu w dół (wiersz + kolumna)
            const row = Math.floor(shelfIndex / colsCount);
            const col = shelfIndex % colsCount;
            const diagonalStep = row + col;
            const delayMs = diagonalStep * 40;
            shelfUnit.style.animationDelay = `${delayMs}ms`;
        }

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
        shelfIndex++;
    }
}

function renderPaginationControls(totalPages, groupNames = null) {
    const bar = document.getElementById("shelvesPaginationBar");
    if (!bar) return;

    if (totalPages <= 1) {
        bar.style.display = "none";
        return;
    }

    bar.style.display = "flex";
    const current = state.pagination.currentPage;

    const btnPrev = document.getElementById("btnPagePrev");
    const btnNext = document.getElementById("btnPageNext");
    const currentText = document.getElementById("paginationCurrentText");
    const menu = document.getElementById("paginationDropdownMenu");

    if (btnPrev) btnPrev.disabled = current <= 1;
    if (btnNext) btnNext.disabled = current >= totalPages;

    if (currentText) {
        if (Array.isArray(groupNames) && groupNames[current - 1]) {
            currentText.textContent = groupNames[current - 1];
        } else {
            currentText.textContent = `Strona ${current} z ${totalPages}`;
        }
    }

    if (menu) {
        menu.innerHTML = "";
        for (let p = 1; p <= totalPages; p++) {
            const opt = document.createElement("button");
            opt.type = "button";
            opt.className = `pagination-page-option ${p === current ? "active" : ""}`;
            if (Array.isArray(groupNames) && groupNames[p - 1]) {
                opt.textContent = groupNames[p - 1];
            } else {
                opt.textContent = `Strona ${p}`;
            }
            opt.addEventListener("click", () => {
                goToPage(p);
                closePaginationDropdown();
            });
            menu.appendChild(opt);
        }
    }
}

function goToPage(page) {
    const total = state.pagination.totalPages || 1;
    if (page < 1 || page > total || page === state.pagination.currentPage) return;
    state.pagination.currentPage = page;
    renderGamesGrid();
}

let lastPaginationClickTime = 0;

function initPaginationEvents() {
    const btnPrev = document.getElementById("btnPagePrev");
    const btnNext = document.getElementById("btnPageNext");
    const trigger = document.getElementById("btnPageDropdown");

    if (btnPrev) {
        btnPrev.addEventListener("click", (e) => {
            const now = Date.now();
            if (now - lastPaginationClickTime < 220) {
                e.preventDefault();
                return;
            }
            lastPaginationClickTime = now;
            goToPage(state.pagination.currentPage - 1);
        });
    }

    if (btnNext) {
        btnNext.addEventListener("click", (e) => {
            const now = Date.now();
            if (now - lastPaginationClickTime < 220) {
                e.preventDefault();
                return;
            }
            lastPaginationClickTime = now;
            goToPage(state.pagination.currentPage + 1);
        });
    }

    if (trigger) {
        trigger.addEventListener("click", (e) => {
            e.stopPropagation();
            togglePaginationDropdown();
        });
    }
}

function togglePaginationDropdown() {
    const wrapper = document.getElementById("paginationDropdownWrapper");
    const menu = document.getElementById("paginationDropdownMenu");
    const trigger = document.getElementById("btnPageDropdown");
    if (!wrapper || !menu) return;

    const isOpen = menu.style.display === "flex";
    if (isOpen) {
        closePaginationDropdown();
    } else {
        closeAllFilterDropdowns();
        menu.style.display = "flex";
        wrapper.classList.add("open");
        if (trigger) trigger.setAttribute("aria-expanded", "true");
    }
}

function closePaginationDropdown() {
    const wrapper = document.getElementById("paginationDropdownWrapper");
    const menu = document.getElementById("paginationDropdownMenu");
    const trigger = document.getElementById("btnPageDropdown");
    if (menu) menu.style.display = "none";
    if (wrapper) wrapper.classList.remove("open");
    if (trigger) trigger.setAttribute("aria-expanded", "false");
}

let touchStartX = 0;
let touchStartY = 0;
let touchActive = false;

function attachMobileSwipeToShelves(element) {
    if (!element || element._swipeAttached) return;
    element._swipeAttached = true;

    element.addEventListener("touchstart", (e) => {
        if (e.touches.length !== 1) return;
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        touchActive = true;
    }, { passive: true });

    element.addEventListener("touchend", (e) => {
        if (!touchActive || e.changedTouches.length !== 1) return;
        touchActive = false;

        const deltaX = e.changedTouches[0].clientX - touchStartX;
        const deltaY = e.changedTouches[0].clientY - touchStartY;

        // Sprawdzenie, czy gest był horyzontalny (ruch poziomy większy niż pionowy i min. 45px)
        if (Math.abs(deltaX) > 45 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
            if (deltaX < 0) {
                // Swipe w lewo -> następna strona
                goToPage(state.pagination.currentPage + 1);
            } else {
                // Swipe w prawo -> poprzednia strona
                goToPage(state.pagination.currentPage - 1);
            }
        }
    }, { passive: true });

    element.addEventListener("touchcancel", () => {
        touchActive = false;
    }, { passive: true });
}

function showMcTooltip(title, status, x, y) {
    if (window.innerWidth <= 768 || ('ontouchstart' in window && window.innerWidth <= 1024)) return;
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

function getSpineColorForGame(game) {
    if (!game) return "#2f3e52";
    const status = (game["Stan"] || "").toString().trim().toLowerCase();
    const userCode = state.currentUser ? (state.currentUser.code || "").toString().trim().toUpperCase() : "";

    // 1. Sprawdzenie w aktualnie załadowanych ustawieniach ze słownika Stanów
    if (status && state.settings && state.settings.stan && Array.isArray(state.settings.stan.rows)) {
        const matchingRow = state.settings.stan.rows.find(r => {
            const rowStan = (r["Stan"] || r["stan"] || "").toString().trim().toLowerCase();
            return rowStan === status;
        });
        if (matchingRow) {
            // Najpierw szukamy kolumny dedykowanej dla aktualnego gracza (np. "Kolor MM", "Kolor NK")
            if (userCode) {
                const userKey = Object.keys(matchingRow).find(k => k.toLowerCase() === `kolor ${userCode.toLowerCase()}`);
                if (userKey && matchingRow[userKey] && matchingRow[userKey].toString().trim()) {
                    return matchingRow[userKey].toString().trim();
                }
            }
            // Fallback do ogólnej kolumny "Kolor"
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
