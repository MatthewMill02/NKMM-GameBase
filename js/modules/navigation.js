/**
 * NKMM Baza Gier - Nawigacja, routing ekranów i zarządzanie profilami
 */

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
            <img src="${user.avatar}" alt="${user.code}" class="scatter-head-img" onerror="this.src='assets/icon.jpg'">
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

function updateBrowserTab(user = null) {
    const faviconEl = document.getElementById("dynamicFavicon");
    if (user) {
        // Tytuł: dokładnie nazwa bazy użytkownika, np. "Baza gier MM"
        document.title = user.name || user.sheetName || "NKMM Baza Gier";
        if (faviconEl) {
            faviconEl.href = user.avatar || "assets/icon.jpg";
        }
    } else {
        document.title = "NKMM Baza Gier - Biblioteka i Statystyki";
        if (faviconEl) {
            faviconEl.href = "assets/icon.jpg";
        }
    }
}

function showWelcomeScreen() {
    state.currentScreen = "welcome";
    document.body.classList.add("screen-welcome");
    applyUserTheme(null);
    updateBrowserTab(null);

    document.getElementById("appHeader").style.display = "none";
    document.getElementById("appFooter").style.display = "block";
    document.getElementById("welcomeScreen").style.display = "flex";
    document.getElementById("dashboardScreen").style.display = "none";

    renderWelcomeHeads();
}

function showDashboardScreen() {
    state.currentScreen = "dashboard";
    document.body.classList.remove("screen-welcome");

    document.getElementById("appHeader").style.display = "flex";
    document.getElementById("appFooter").style.display = "block";
    document.getElementById("welcomeScreen").style.display = "none";
    document.getElementById("dashboardScreen").style.display = "block";

    switchMainTab(state.currentTab);
    if (typeof checkMonitorAutoVisibility === "function") {
        checkMonitorAutoVisibility();
    }
    requestAnimationFrame(() => updateMonitorScrollPosition());
}

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

function switchUserProfile(user) {
    state.currentUser = user;
    applyUserTheme(user);
    checkAdminStatusForUser(user);
    updateBrowserTab(user);
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
            menu.innerHTML = '<div style="padding:10px 14px; font-size:14px; color:#888;">Brak innych profili</div>';
        } else {
            otherUsers.forEach(u => {
                const item = document.createElement("button");
                item.className = "profile-menu-item";
                item.innerHTML = `
                    <img src="${u.avatar}" alt="${u.code}" class="mini-avatar" onerror="this.src='assets/icon.jpg'">
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
                <img src="${u.avatar}" alt="${u.code}" class="mini-avatar" onerror="this.src='assets/icon.jpg'">
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
                // Główną nazwą jest dokładnie nazwa zakładki w Google Sheets, np. "Baza gier MM"
                const defaultName = remoteUser.sheetName || (remoteUser.name && remoteUser.name.startsWith("Baza gier ") ? remoteUser.name : `Baza gier ${remoteUser.code}`);
                const defaultColor = isMM ? "#13a71f" : (isNK ? "#A81214" : (remoteUser.tabColor || "#2a4365"));
                const defaultHover = isMM ? "#0f8518" : (isNK ? "#860e10" : (remoteUser.tabColor || "#1e314b"));

                if (!existing) {
                    existing = {
                        code: remoteUser.code,
                        name: defaultName,
                        sheetName: remoteUser.sheetName || defaultName,
                        avatar: getUserAvatarPath(remoteUser.sheetName || defaultName),
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
                if (state.currentUser) {
                    const currentUpdated = state.users.find(u => u.code === state.currentUser.code);
                    if (currentUpdated) {
                        state.currentUser = currentUpdated;
                        updateProfileBanner();
                        updateBrowserTab(currentUpdated);
                    }
                }
            }
        }
    } catch (e) {
        console.warn("Użyto lokalnej konfiguracji użytkowników.");
    }
}

let monitorScrollTicking = false;

function updateMonitorScrollPosition() {
    const monitor = document.getElementById("shelfSidebarMonitor") || document.querySelector(".shelf-sidebar-monitor");
    if (!monitor) return;

    if (window.innerWidth <= 768) {
        monitor.style.position = "";
        monitor.style.top = "";
        monitor.style.width = "";
        return;
    }

    const scrollY = window.scrollY || window.pageYOffset || 0;
    const showcaseCol = document.getElementById("showcaseColumn");
    const isShowcaseCollapsed = showcaseCol ? showcaseCol.classList.contains("collapsed") : false;

    // Gdy gablota jest zwinięta, monitor zaczyna się znacznie wyżej (ok. 50px zamiast 264px)
    // Na laptopach (<= 1540px) szerokość lewej kolumny wynosi 370px, a monitora 330px
    const isLaptop = window.innerWidth <= 1540;
    const threshold = isShowcaseCollapsed ? 50 : (isLaptop ? 220 : 264);
    const targetTop = isLaptop ? "70px" : "134px";
    const targetWidth = isLaptop ? "370px" : "396px";

    if (scrollY >= threshold) {
        monitor.style.position = "fixed";
        monitor.style.top = targetTop;
        monitor.style.width = targetWidth;
    } else {
        monitor.style.position = "relative";
        monitor.style.top = "0px";
        monitor.style.width = "100%";
    }
}

function handleMonitorScrollOptimized() {
    if (!monitorScrollTicking) {
        window.requestAnimationFrame(() => {
            updateMonitorScrollPosition();
            monitorScrollTicking = false;
        });
        monitorScrollTicking = true;
    }
}

function initMonitorScrollBehavior() {
    window.addEventListener("scroll", handleMonitorScrollOptimized, { passive: true });
    window.addEventListener("resize", () => {
        handleMonitorScrollOptimized();
    }, { passive: true });
    updateMonitorScrollPosition();
}
