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
    donutUser: "ALL", // "ALL" | user.code
    donutMetric: "count", // "count" | "hours"
    allUsersGames: {} // { [userCode]: [...] }
};

async function fetchAllUsersGamesForCharts() {
    const realUsers = state.users.filter(u => !u.isForum && u.code !== "FORUM");
    for (const u of realUsers) {
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

    const realUsers = state.users.filter(u => !u.isForum && u.code !== "FORUM");
    if (realUsers.length === 0) {
        container.innerHTML = '<p class="modal-hint">Brak zdefiniowanych profili graczy.</p>';
        return;
    }

    // Legenda dynamiczna dla wszystkich graczy
    let legendHtml = '<div class="chart-legend" style="margin-bottom: 16px; padding: 10px 14px; background: var(--color-bg); border-radius: 4px; border: 1px solid var(--color-border); display: flex; flex-wrap: wrap; gap: 14px;">';
    realUsers.forEach(u => {
        const uGames = chartsState.allUsersGames[u.code] || [];
        const uColor = u.color || "#2a4365";
        legendHtml += `<div class="legend-item"><span class="legend-dot" style="background-color: ${uColor};"></span><strong>${escapeHtml(u.name)} (${uGames.length} gier)</strong></div>`;
    });
    legendHtml += '</div>';

    // Opcje wyboru użytkownika do wykresu kołowego
    let userOptionsHtml = `<option value="ALL" ${chartsState.donutUser === "ALL" ? "selected" : ""}>Wszyscy gracze</option>`;
    realUsers.forEach(u => {
        userOptionsHtml += `<option value="${u.code}" ${chartsState.donutUser === u.code ? "selected" : ""}>${escapeHtml(u.name)}</option>`;
    });

    let html = `
        ${legendHtml}

        <div class="charts-grid">
            <!-- WYKRES 1: SŁUPKOWY - PODZIAŁ WEDŁUG STANÓW GRY -->
            <div class="chart-card">
                <div class="chart-card-header">
                    <h3>1. Stan gier</h3>
                </div>
                <div id="chartStatusContent" class="chart-bars-list">
                    ${renderStatusComparisonBars(realUsers)}
                </div>
            </div>

            <!-- WYKRES 2: KOŁOWY / PIERŚCIENIOWY (DONUT) - UDZIAŁ PLATFORM -->
            <div class="chart-card">
                <div class="chart-card-header">
                    <h3>2. Udział platform</h3>
                    <div class="chart-controls-bar">
                        <select id="chartDonutUserSelect" class="chart-select">
                            ${userOptionsHtml}
                        </select>
                        <select id="chartDonutMetricSelect" class="chart-select">
                            <option value="count" ${chartsState.donutMetric === "count" ? "selected" : ""}>Liczba gier</option>
                            <option value="hours" ${chartsState.donutMetric === "hours" ? "selected" : ""}>Godziny</option>
                        </select>
                    </div>
                </div>
                <div id="chartDonutContainer">
                    ${renderPlatformDonutChart(realUsers)}
                </div>
            </div>

            <!-- WYKRES 3: LINIOWY - UKOŃCZENIA GIER W CZASIE -->
            <div class="chart-card">
                <div class="chart-card-header">
                    <h3>3. Oś czasu ukończeń</h3>
                </div>
                <div id="chartLineContainer">
                    ${renderCompletionsTimelineChart(realUsers)}
                </div>
            </div>

            <!-- WYKRES 4: ROZKŁAD OCEN (HISTOGRAM) -->
            <div class="chart-card">
                <div class="chart-card-header">
                    <h3>4. Rozkład ocen</h3>
                </div>
                <div id="chartRatingsContent" class="chart-bars-list">
                    ${renderRatingsComparisonBars(realUsers)}
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
            if (content) content.innerHTML = renderPlatformDonutChart(realUsers);
        });
    }

    if (metricSelect) {
        metricSelect.addEventListener("change", (e) => {
            chartsState.donutMetric = e.target.value;
            const content = document.getElementById("chartDonutContainer");
            if (content) content.innerHTML = renderPlatformDonutChart(realUsers);
        });
    }
}

// 1. WYKRES SŁUPKOWY - STANY GIER (DYNAMICZNIE DLA N GRACZY)
function renderStatusComparisonBars(users) {
    const statuses = new Set();
    users.forEach(u => {
        const uGames = chartsState.allUsersGames[u.code] || [];
        uGames.forEach(g => { if (g["Stan"]) statuses.add(g["Stan"].trim()); });
    });

    const statusList = Array.from(statuses).sort();
    if (statusList.length === 0) return '<p class="modal-hint">Brak danych o stanach gier.</p>';

    let maxVal = 1;
    const statsData = statusList.map(st => {
        const row = { status: st, counts: {}, totals: 0 };
        users.forEach(u => {
            const uGames = chartsState.allUsersGames[u.code] || [];
            const count = uGames.filter(g => (g["Stan"] || "").trim() === st).length;
            row.counts[u.code] = count;
            row.totals += count;
            if (count > maxVal) maxVal = count;
        });
        return row;
    });

    return statsData.map(item => {
        const tooltipRows = [];
        users.forEach(u => {
            const uGames = chartsState.allUsersGames[u.code] || [];
            const count = item.counts[u.code] || 0;
            const totalPct = uGames.length > 0 ? ((count / uGames.length) * 100).toFixed(1) : "0";
            tooltipRows.push({
                label: u.name,
                value: `${count} gier (${totalPct}%)`,
                color: u.color || "#2a4365"
            });
        });
        tooltipRows.push({ label: "Łącznie", value: `${item.totals} gier`, color: "#ffffff" });
        const rowsEncoded = encodeURIComponent(JSON.stringify(tooltipRows));

        const barsHtml = users.map(u => {
            const count = item.counts[u.code] || 0;
            const pct = Math.round((count / maxVal) * 100);
            return `
                <div class="chart-single-bar-container" title="${escapeHtml(u.name)}: ${count}">
                    <div class="chart-single-bar-track">
                        <div class="chart-single-bar-fill" style="width: ${Math.max(pct, 3)}%; background-color: ${u.color || '#2a4365'};"></div>
                    </div>
                    <span class="chart-single-bar-val">${count}</span>
                </div>
            `;
        }).join("");

        return `
            <div class="chart-dual-row chart-interactive-item" data-tooltip-header="${escapeHtml(item.status)}" data-tooltip-rows="${rowsEncoded}">
                <span class="chart-bar-label" title="${escapeHtml(item.status)}">${escapeHtml(item.status)}</span>
                <div class="chart-dual-bars">
                    ${barsHtml}
                </div>
            </div>
        `;
    }).join("");
}

// 2. WYKRES KOŁOWY / PIERŚCIENIOWY SVG - PLATFORMY (DYNAMICZNIE DLA N GRACZY)
function renderPlatformDonutChart(users) {
    let targetGames = [];
    let titlePrefix = "Wszyscy gracze";

    if (chartsState.donutUser === "ALL") {
        users.forEach(u => {
            const uGames = chartsState.allUsersGames[u.code] || [];
            targetGames = targetGames.concat(uGames);
        });
    } else {
        const chosenUser = users.find(u => u.code === chartsState.donutUser);
        if (chosenUser) {
            targetGames = chartsState.allUsersGames[chosenUser.code] || [];
            titlePrefix = chosenUser.name;
        }
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

// 3. WYKRES LINIOWY SVG - OŚ CZASU UKOŃCZEŃ (DYNAMICZNIE DLA N GRACZY)
function renderCompletionsTimelineChart(users) {
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

    users.forEach(u => {
        const games = chartsState.allUsersGames[u.code] || [];
        games.forEach(g => {
            const ym = parseYearMonth(g);
            if (!ym) return;
            if (!timeBuckets.has(ym)) {
                const initBucket = { ym: ym, userCounts: {}, userTitles: {} };
                users.forEach(us => {
                    initBucket.userCounts[us.code] = 0;
                    initBucket.userTitles[us.code] = [];
                });
                timeBuckets.set(ym, initBucket);
            }
            const bucket = timeBuckets.get(ym);
            bucket.userCounts[u.code] = (bucket.userCounts[u.code] || 0) + 1;
            if (!bucket.userTitles[u.code]) bucket.userTitles[u.code] = [];
            if (bucket.userTitles[u.code].length < 3) {
                bucket.userTitles[u.code].push(g["Tytuł"]);
            }
        });
    });

    const sortedBuckets = Array.from(timeBuckets.values()).sort((a, b) => a.ym.localeCompare(b.ym));
    if (sortedBuckets.length === 0) {
        return '<p class="modal-hint">Brak dat ukończenia gier w bazie do wygenerowania osi czasu.</p>';
    }

    const displayBuckets = sortedBuckets.slice(-12);

    let maxCount = 1;
    displayBuckets.forEach(b => {
        users.forEach(u => {
            const cnt = b.userCounts[u.code] || 0;
            if (cnt > maxCount) maxCount = cnt;
        });
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

    let gridLinesHtml = "";
    for (let i = 0; i <= 3; i++) {
        const gridY = paddingTop + (plotHeight / 3) * i;
        const gridVal = Math.round(maxCount - (maxCount / 3) * i);
        gridLinesHtml += `
            <line x1="${paddingLeft}" y1="${gridY}" x2="${svgWidth - paddingRight}" y2="${gridY}" class="chart-gridline"></line>
            <text x="${paddingLeft - 8}" y="${gridY + 4}" text-anchor="end" class="chart-axis-label">${gridVal}</text>
        `;
    }

    const userPaths = {};
    users.forEach(u => { userPaths[u.code] = ""; });
    let pointsHtml = "";

    displayBuckets.forEach((b, idx) => {
        const x = paddingLeft + idx * stepX;

        gridLinesHtml += `
            <text x="${x}" y="${svgHeight - 10}" text-anchor="middle" class="chart-axis-label">${b.ym.substring(2)}</text>
        `;

        users.forEach(u => {
            const cnt = b.userCounts[u.code] || 0;
            const y = getY(cnt);
            if (idx === 0) {
                userPaths[u.code] += `M ${x} ${y}`;
            } else {
                userPaths[u.code] += ` L ${x} ${y}`;
            }

            const tooltipRows = [
                { label: u.name, value: `${cnt} ukończonych`, color: u.color || "#2a4365" },
                { label: "Przykłady", value: (b.userTitles[u.code] || []).join(", ") || "-", color: "#ffffff" }
            ];
            const rowsEncoded = encodeURIComponent(JSON.stringify(tooltipRows));

            pointsHtml += `
                <circle cx="${x}" cy="${y}" r="5" fill="${u.color || '#2a4365'}" stroke="#ffffff" stroke-width="1.5" class="chart-data-point" data-tooltip-header="${escapeHtml(b.ym)} (${escapeHtml(u.name)})" data-tooltip-rows="${rowsEncoded}"></circle>
            `;
        });
    });

    let pathsHtml = "";
    users.forEach(u => {
        pathsHtml += `<path d="${userPaths[u.code]}" stroke="${u.color || '#2a4365'}" class="chart-line-path"></path>`;
    });

    return `
        <div style="width: 100%; overflow: hidden;">
            <svg viewBox="0 0 ${svgWidth} ${svgHeight}" class="line-chart-svg" style="width: 100%; height: auto; max-width: 100%; display: block;">
                ${gridLinesHtml}
                ${pathsHtml}
                ${pointsHtml}
            </svg>
        </div>
    `;
}

// 4. WYKRES SŁUPKOWY / HISTOGRAM OCEN (DYNAMICZNIE DLA N GRACZY)
function renderRatingsComparisonBars(users) {
    const buckets = [
        { label: "9.0 - 10.0 (Wybitne)", min: 9.0, max: 10.0 },
        { label: "7.0 - 8.9 (Dobre)", min: 7.0, max: 8.99 },
        { label: "5.0 - 6.9 (Przeciętne)", min: 5.0, max: 6.99 },
        { label: "1.0 - 4.9 (Słabe)", min: 1.0, max: 4.99 },
        { label: "Brak oceny", min: -1, max: -1 }
    ];

    let maxVal = 1;
    const data = buckets.map(b => {
        const counts = {};
        let total = 0;
        users.forEach(u => {
            const uGames = chartsState.allUsersGames[u.code] || [];
            const count = uGames.filter(g => {
                const r = parseFloat(g["Ocena gry"]);
                if (isNaN(r) || r <= 0) return b.min === -1;
                return b.min !== -1 && r >= b.min && r <= b.max;
            }).length;
            counts[u.code] = count;
            total += count;
            if (count > maxVal) maxVal = count;
        });

        return { label: b.label, counts: counts, total: total };
    });

    return data.map(item => {
        const tooltipRows = [];
        users.forEach(u => {
            const count = item.counts[u.code] || 0;
            tooltipRows.push({
                label: u.name,
                value: `${count} gier`,
                color: u.color || "#2a4365"
            });
        });
        tooltipRows.push({ label: "Łącznie", value: `${item.total} gier`, color: "#ffffff" });
        const rowsEncoded = encodeURIComponent(JSON.stringify(tooltipRows));

        const barsHtml = users.map(u => {
            const count = item.counts[u.code] || 0;
            const pct = Math.round((count / maxVal) * 100);
            return `
                <div class="chart-single-bar-container" title="${escapeHtml(u.name)}: ${count}">
                    <div class="chart-single-bar-track">
                        <div class="chart-single-bar-fill" style="width: ${Math.max(pct, 3)}%; background-color: ${u.color || '#2a4365'};"></div>
                    </div>
                    <span class="chart-single-bar-val">${count}</span>
                </div>
            `;
        }).join("");

        return `
            <div class="chart-dual-row chart-interactive-item" data-tooltip-header="${escapeHtml(item.label)}" data-tooltip-rows="${rowsEncoded}">
                <span class="chart-bar-label" style="font-size: 14px;">${escapeHtml(item.label)}</span>
                <div class="chart-dual-bars">
                    ${barsHtml}
                </div>
            </div>
        `;
    }).join("");
}
