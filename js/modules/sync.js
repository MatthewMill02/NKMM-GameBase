/**
 * NKMM Baza Gier - Warstwa pamięci podręcznej (Cache) oraz kolejka synchronizacji w tle (Optimistic UI)
 */

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
