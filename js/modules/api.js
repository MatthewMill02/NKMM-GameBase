/**
 * NKMM Baza Gier - Komunikacja sieciowa i API (Google Apps Script + RAWG)
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
