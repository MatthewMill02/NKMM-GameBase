/**
 * NKMM Baza Gier - Wykresy analityczne i tooltipy (Tab 2)
 */

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
                <span class="chart-bar-label" style="font-size: 14px;">${escapeHtml(item.label)}</span>
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
