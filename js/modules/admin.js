/**
 * NKMM Baza Gier - Panel administratora, modale, gablota i edycja słowników/statystyk
 */

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

function applyShowcaseCollapseState(collapsed) {
    const showcaseCol = document.getElementById("showcaseColumn");
    const showcaseBlock = document.querySelector(".showcase-and-stats-block");
    const toggleBtn = document.getElementById("btnToggleShowcaseCollapse");

    if (showcaseCol) {
        showcaseCol.classList.toggle("collapsed", collapsed);
    }
    if (showcaseBlock) {
        showcaseBlock.classList.toggle("showcase-collapsed", collapsed);
    }
    if (toggleBtn) {
        toggleBtn.textContent = collapsed ? "[Rozwiń]" : "[Zwiń]";
        toggleBtn.title = collapsed ? "Rozwiń gablotę wyróżnionych gier" : "Zwiń gablotę wyróżnionych gier";
    }
}

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

function checkAdminStatusForUser(user) {
    try {
        const userSheet = user ? user.sheetName : (state.currentUser ? state.currentUser.sheetName : "Baza gier MM");
        const authMap = JSON.parse(localStorage.getItem("nkmm_auth_map") || "{}");

        if (authMap[userSheet]) {
            state.isAdmin = true;
            state.adminPassword = authMap[userSheet];
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

function openAdminLoginModal() {
    const select = document.getElementById("adminUserSelect");
    const passInput = document.getElementById("adminPasswordInput");
    const errorDiv = document.getElementById("adminLoginError");

    if (errorDiv) errorDiv.style.display = "none";
    if (passInput) passInput.value = "";

    if (select) {
        select.innerHTML = "";
        state.users.forEach(u => {
            const opt = document.createElement("option");
            opt.value = u.sheetName;
            opt.textContent = u.name || u.sheetName;
            if (state.currentUser && state.currentUser.sheetName === u.sheetName) {
                opt.selected = true;
            }
            select.appendChild(opt);
        });
    }

    openModal("adminLoginModal");
}

async function handleAdminLogin(e) {
    e.preventDefault();
    const select = document.getElementById("adminUserSelect");
    const passInput = document.getElementById("adminPasswordInput");
    const errorDiv = document.getElementById("adminLoginError");
    const submitBtn = document.getElementById("btnSubmitAdminLogin");

    errorDiv.style.display = "none";
    submitBtn.disabled = true;
    submitBtn.textContent = "Weryfikacja...";

    const enteredPass = passInput.value.trim();
    const selectedSheet = (select && select.value) ? select.value.trim() : (state.currentUser ? state.currentUser.sheetName : "Baza gier MM");

    try {
        const response = await sendApiRequest({ action: "verifyAuth", user: selectedSheet }, enteredPass);

        const isAuthorized = response.status === "success" && response.data && response.data.authorized;

        if (isAuthorized) {
            // Zapisujemy hasło tylko dla konkretnego użytkownika / bazy
            const authMap = JSON.parse(localStorage.getItem("nkmm_auth_map") || "{}");
            authMap[selectedSheet] = enteredPass;
            localStorage.setItem("nkmm_auth_map", JSON.stringify(authMap));

            // Jeśli logujemy się do innej bazy niż bieżąca, przełączamy na tę bazę
            const targetUser = state.users.find(u => u.sheetName === selectedSheet);
            if (targetUser && (!state.currentUser || state.currentUser.sheetName !== selectedSheet)) {
                switchUserProfile(targetUser);
            } else {
                state.isAdmin = true;
                state.adminPassword = enteredPass;
                applyAdminUiState();
                renderGamesGrid();
                updateProfileBanner();
            }

            closeModal("adminLoginModal");
            passInput.value = "";
        } else {
            errorDiv.textContent = (response && response.message) ? response.message : "Błędne hasło dostępu dla wybranej bazy!";
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

    if (game) {
        document.getElementById("gameEditModalTitle").textContent = "Edytuj grę";
        document.getElementById("formGameId").value = game.id || "";
        document.getElementById("formGameTitle").value = game["Tytuł"] || "";
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

    populateSelectOptionsForForm();

    if (game) {
        document.getElementById("formGameStatus").value = game["Stan"] || "";
        document.getElementById("formGamePlatform").value = game["Platforma"] || "";
    }

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
        badge.style.fontSize = "14px";
        badge.style.padding = "4px 10px";
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

    const colorInput = document.getElementById("formGameColor");
    const colorVal = colorInput ? (colorInput.value || "").trim() : "";
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
        if (idx !== -1) {
            state.games[idx] = { ...state.games[idx], ...gameDetails };
            if (state.selectedGame && String(state.selectedGame.id) === String(gameId)) {
                state.selectedGame = state.games[idx];
            }
        }
    } else {
        state.games.unshift(gameDetails);
    }

    setCachedGames(currentSheet, state.games);
    updateProfileBanner();
    populateFilterOptions();
    renderGamesGrid();
    if (state.selectedGame) {
        renderMonitorGameDetails(state.selectedGame);
    }
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
                    if (state.selectedGame && String(state.selectedGame.id) === String(targetGame.id)) {
                        state.selectedGame = targetGame;
                        renderMonitorGameDetails(state.selectedGame);
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

function handleAddUserSubmit(e) {
    e.preventDefault();
    if (!state.isAdmin) return;

    const userCode = document.getElementById("newUserCode").value.trim().toUpperCase();
    const userColor = document.getElementById("newUserColor").value;

    if (!userCode) {
        alert("Podaj inicjały gracza (np. MM, NK, PW).");
        return;
    }

    const sheetName = `Baza gier ${userCode}`;
    const previousUsers = [...state.users];

    const newUser = {
        code: userCode,
        name: sheetName,
        sheetName: sheetName,
        avatar: getUserAvatarPath(sheetName),
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
        userName: sheetName,
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
                <td><img src="${u.avatar}" alt="${u.code}" class="mini-avatar" onerror="this.src='assets/icon.jpg'"></td>
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

    // Filtrujemy nagłówki - w Ustawieniach wyświetlamy kolumny konfiguracyjne (Lp, Nazwa, Kolor/Kolory użytkowników, Opis), ukrywając kolumny liczników/godzin graczy
    let displayedHeaders = tableData.headers;
    if (category) {
        displayedHeaders = tableData.headers.filter(h => {
            const low = h.toLowerCase();
            if (low.startsWith(category.toLowerCase() + " ") || low.includes("godziny na platformę") || low.includes("stan ") || low.includes("kolekcje ") || low.includes("platformy ")) {
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
    const currentUserCode = state.currentUser ? (state.currentUser.code || "").toString().trim().toUpperCase() : "";

    tableData.rows.forEach(row => {
        html += "<tr>";
        displayedHeaders.forEach(h => {
            const val = row[h] !== undefined && row[h] !== null ? row[h] : "";
            const isColorCol = h.toLowerCase().startsWith("kolor") || h.toLowerCase().startsWith("color");
            if (isColorCol && val) {
                const hexVal = String(val).trim();
                const pastel = toPastelSpineColor(hexVal);
                html += `
                    <td>
                        <div style="display:flex; align-items:center; gap:6px;">
                            <span style="display:inline-block; width:16px; height:16px; border-radius:3px; background-color:${pastel}; border:1px solid rgba(255,255,255,0.25); box-shadow:0 1px 3px rgba(0,0,0,0.5);"></span>
                            <span style="font-family:monospace; font-size:14px;">${escapeHtml(hexVal)}</span>
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
            // Pobranie koloru dla aktualnego gracza lub z kolumny Kolor
            let colorVal = "";
            if (currentUserCode && row[`Kolor ${currentUserCode}`]) {
                colorVal = row[`Kolor ${currentUserCode}`];
            } else if (currentUserCode && row[`kolor ${currentUserCode.toLowerCase()}`]) {
                colorVal = row[`kolor ${currentUserCode.toLowerCase()}`];
            } else {
                colorVal = row["Kolor"] || row["kolor"] || "";
            }
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
    const currentUserCode = state.currentUser ? (state.currentUser.code || "").toString().trim().toUpperCase() : "";

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
                    if (currentUserCode) {
                        r[`Kolor ${currentUserCode}`] = newColor;
                    }
                    if (r["Kolor"] !== undefined || !currentUserCode) {
                        r["Kolor"] = newColor;
                    }
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
        newColor: newColor,
        user: state.currentUser ? state.currentUser.sheetName : "",
        userCode: currentUserCode
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
    const currentUserCode = state.currentUser ? (state.currentUser.code || "").toString().trim().toUpperCase() : "";

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
            } else if (currentUserCode && h.toLowerCase() === `kolor ${currentUserCode.toLowerCase()}`) {
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
        color: colorVal,
        user: state.currentUser ? state.currentUser.sheetName : "",
        userCode: currentUserCode
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
        value: value,
        user: state.currentUser ? state.currentUser.sheetName : ""
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
