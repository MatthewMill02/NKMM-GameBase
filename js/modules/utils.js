/**
 * NKMM Baza Gier - Moduł pomocniczy (Utils)
 */

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

function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = "flex";
        // Pop-up szczegółów gry (gameDetailsModal) oraz edycji gry (gameEditModal) nie blokują/chowają scrolla strony
        if (modalId !== "gameDetailsModal" && modalId !== "gameEditModal") {
            document.body.classList.add("modal-open");
        }
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = "none";
    }
    const hasOpenModals = Array.from(document.querySelectorAll(".modal-backdrop")).some(m => m.id !== "gameDetailsModal" && m.id !== "gameEditModal" && m.style.display !== "none" && m.style.display !== "");
    const isDrawerOpen = document.getElementById("mobileNavDrawer") && document.getElementById("mobileNavDrawer").style.display !== "none" && document.getElementById("mobileNavDrawer").style.display !== "";
    if (!hasOpenModals && !isDrawerOpen) {
        document.body.classList.remove("modal-open");
    }
}

function isMobileView() {
    return window.innerWidth <= 768;
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
