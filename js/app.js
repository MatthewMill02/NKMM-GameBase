/**
 * NKMM Baza Gier - Główny punkt startowy aplikacji (Entry Point)
 * Koordynuje inicjalizację zdarzeń DOM, sesji oraz cyklu życia okna.
 */

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

    const openMobileDrawer = () => {
        if (mobileNavDrawer) {
            mobileNavDrawer.style.display = "flex";
            document.body.classList.add("modal-open");
        }
    };
    const closeMobileDrawer = () => {
        if (mobileNavDrawer) {
            mobileNavDrawer.style.display = "none";
        }
        const hasOpenModals = Array.from(document.querySelectorAll(".modal-backdrop")).some(m => m.style.display !== "none" && m.style.display !== "");
        if (!hasOpenModals) {
            document.body.classList.remove("modal-open");
        }
    };

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
            openAdminLoginModal();
        }
    });

    const btnMobileAddGame = document.getElementById("btnMobileAddGame");
    if (btnMobileAddGame) {
        btnMobileAddGame.addEventListener("click", () => openGameEditModal(null));
    }

    const btnMobileRefresh = document.getElementById("btnMobileRefresh");
    if (btnMobileRefresh) btnMobileRefresh.addEventListener("click", handleForceRefreshAll);

    // Przycisk zwijania / rozwijania opcji kafelka (sortowanie, grupowanie, filtry, taby) na telefonie
    const btnToggleControlsMobile = document.getElementById("btnToggleControlsMobile");
    const controlsCollapsible = document.getElementById("dashboardControlsCollapsible");
    if (btnToggleControlsMobile && controlsCollapsible) {
        btnToggleControlsMobile.addEventListener("click", () => {
            const isCollapsed = controlsCollapsible.classList.toggle("is-collapsed");
            // Gdy zwinięty: znak '>' (wskazuje możliwość rozwinięcia)
            // Gdy rozwinięty: znak '<' (wskazuje możliwość zwinięcia)
            btnToggleControlsMobile.textContent = isCollapsed ? ">" : "<";
            btnToggleControlsMobile.setAttribute("aria-expanded", isCollapsed ? "false" : "true");
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
        if (!e.target.closest(".pagination-dropdown-wrapper")) {
            closePaginationDropdown();
        }
    });

    initPaginationEvents();

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

    // Gablota - edycja oraz zwijanie
    document.getElementById("btnEditShowcase").addEventListener("click", openShowcaseEditModal);
    document.getElementById("btnSaveShowcase").addEventListener("click", handleSaveShowcase);

    const btnToggleShowcaseCollapse = document.getElementById("btnToggleShowcaseCollapse");
    if (btnToggleShowcaseCollapse) {
        // Domyślnie zwinięta przy mniejszym rozmiarze okna (np. laptop <= 1540px), chyba że użytkownik manualnie to zmienił
        const savedSetting = localStorage.getItem("nkmm_showcase_collapsed");
        const defaultCollapsedForScreen = window.innerWidth <= 1540;
        const isCollapsed = savedSetting !== null ? savedSetting === "true" : defaultCollapsedForScreen;
        applyShowcaseCollapseState(isCollapsed);

        btnToggleShowcaseCollapse.addEventListener("click", () => {
            const showcaseCol = document.getElementById("showcaseColumn");
            const currentlyCollapsed = showcaseCol ? showcaseCol.classList.contains("collapsed") : false;
            const nextState = !currentlyCollapsed;
            applyShowcaseCollapseState(nextState);
            localStorage.setItem("nkmm_showcase_collapsed", String(nextState));
            requestAnimationFrame(() => updateMonitorScrollPosition());
        });
    }

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
        state.pagination.currentPage = 1;
        clearSearchBtn.style.display = state.filters.search ? "inline-block" : "none";
        renderGamesGrid();
    });

    clearSearchBtn.addEventListener("click", () => {
        searchInput.value = "";
        state.filters.search = "";
        state.pagination.currentPage = 1;
        clearSearchBtn.style.display = "none";
        renderGamesGrid();
    });

    document.getElementById("sortSelect").addEventListener("change", (e) => {
        state.filters.sort = e.target.value;
        state.pagination.currentPage = 1;
        renderGamesGrid();
    });

    const groupSelect = document.getElementById("groupSelect");
    if (groupSelect) {
        groupSelect.addEventListener("change", (e) => {
            state.filters.group = e.target.value;
            state.pagination.currentPage = 1;
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
    document.getElementById("btnAdminLoginModal").addEventListener("click", openAdminLoginModal);
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
    let lastCapacity = typeof getPageShelfCapacity === "function" ? getPageShelfCapacity() : 15;
    window.addEventListener("resize", () => {
        if (state.currentScreen === "welcome") {
            renderWelcomeHeads();
        } else if (state.currentScreen === "dashboard" && state.currentTab === "tabViewGames") {
            const newCap = getPageShelfCapacity();
            if (newCap !== lastCapacity) {
                lastCapacity = newCap;
                state.pagination.currentPage = 1;
                renderGamesGrid();
            }
        }
    });

    // Dynamiczne zachowanie obrazu (v2.3)
    initMonitorScrollBehavior();
}