const googleScriptUrl = "https://script.google.com/macros/s/AKfycbyp3D2WaBoWCZ-qwAlZoLu3zURZALiLulPrTlUXtn94_Y2eJpgxylb9Ceo8HtdGi-F8/exec";

// Elementy panelu logowania
const loginContainer = document.getElementById('loginContainer');
const loginForm = document.getElementById('loginForm');
const sitePasswordInput = document.getElementById('sitePassword');
const loginError = document.getElementById('loginError');

// Główny kontener aplikacji (zawartość ukryta na start)
const appContainer = document.getElementById('appContainer');

// Zmienna przechowująca wpisane hasło podczas sesji
let currentSessionPassword = "";

// Referencje DOM dla aplikacji
const userSelect = document.getElementById('userSelect');
const outputConsole = document.getElementById('outputConsole');
const gameForm = document.getElementById('gameForm');
const resetFormBtn = document.getElementById('btnResetForm');

const gameIdField = document.getElementById('gameId');
const gameTitleField = document.getElementById('gameTitle');
const gameStatusField = document.getElementById('gameStatus');
const gamePlatformField = document.getElementById('gamePlatform');
const gameRatingField = document.getElementById('gameRating');
const gameReviewField = document.getElementById('gameReview');
const gameCollectionsField = document.getElementById('gameCollections');

/**
 * Procedura zalogowania i weryfikacji hasła "w locie" na serwerze Google
 */
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const enteredPassword = sitePasswordInput.value;
    loginError.textContent = "Weryfikacja hasła... ⏳";

    // Wykonujemy testowy strzał (próbujemy pobrać ustawienia z tym hasłem)
    // Jeśli hasło jest złe, backend zwróci status "error"
    const result = await sendApiRequestWithCustomPassword({ action: "getSettings" }, enteredPassword);

    if (result.status === "success") {
        currentSessionPassword = enteredPassword; // Zapisujemy poprawne hasło
        loginContainer.style.display = "none";    // Ukrywamy panel logowania
        appContainer.style.display = "block";    // Pokazujemy pełną aplikację
        logToConsole("Autoryzacja pomyślna. Witaj w bazie gier!");
    } else {
        loginError.textContent = "🛑 Niepoprawne hasło dostępu! Spróbuj ponownie.";
        sitePasswordInput.value = "";
    }
});

/**
 * Silnik żądań JSONP przesyłający aktualne hasło sesyjne
 */
function sendApiRequest(params) {
    return sendApiRequestWithCustomPassword(params, currentSessionPassword);
}

/**
 * Pomocnicza funkcja realizująca niskopoziomowy strzał JSONP z przekazanym hasłem
 */
function sendApiRequestWithCustomPassword(params, password) {
    return new Promise((resolve, reject) => {
        const callbackName = "jsonp_callback_" + Math.round(100000 * Math.random());
        
        window[callbackName] = function(data) {
            delete window[callbackName];
            document.body.removeChild(script);
            resolve(data);
        };

        const queryParams = new URLSearchParams(params);
        queryParams.append("callback", callbackName);
        queryParams.append("pass", password); // Przekazujemy klucz autoryzacji

        const script = document.createElement("script");
        script.src = googleScriptUrl + "?" + queryParams.toString();
        script.onerror = () => {
            delete window[callbackName];
            if (script.parentNode) document.body.removeChild(script);
            reject(new Error("Błąd sieciowy podczas ładowania JSONP."));
        };

        document.body.appendChild(script);
    });
}

function logToConsole(message, isHtml = false) {
    if (isHtml) {
        outputConsole.innerHTML = message;
    } else {
        outputConsole.textContent = typeof message === 'object' ? JSON.stringify(message, null, 2) : message;
    }
}

// [AKCJA]: POBIERANIE LISTY GIER UŻYTKOWNIKA
document.getElementById('btnFetchGames').addEventListener('click', async () => {
    logToConsole("Pobieranie bazy gier z chmury Google (JSONP)... ⏳");
    const result = await sendApiRequest({
        action: "getAllGames",
        user: userSelect.value
    });
    
    if (result.status === "success") {
        if (result.data.length === 0) {
            logToConsole("Wybrana baza danych nie zawiera wpisów.");
            return;
        }
        
        let html = "<ul>";
        result.data.forEach(game => {
            html += `<li>
                <strong>${game['Tytuł'] || 'Brak tytułu'}</strong> (${game['Stan'] || 'Brak Stanu'} - ${game['Platforma'] || 'Brak platformy'}) | Ocena: ${game['Ocena gry'] || '-'}
                <br><small>Niezmienne ID: ${game.id || 'BRAK'}</small>
                <br>
                <button onclick="prepareEditGame(${encodeURIComponent(JSON.stringify(game))})">Modyfikuj</button>
                <button onclick="triggerDeleteGame('${game.id}')">Usuń z bazy</button>
                <hr style='border:0.5px dashed #555'>
            </li>`;
        });
        html += "</ul>";
        logToConsole(html, true);
    } else {
        logToConsole(`Błąd komunikacji: ${result.message}`);
    }
});

// [AKCJA]: POBIERANIE SŁOWNIKÓW SŁUŻBOWYCH
document.getElementById('btnFetchSettings').addEventListener('click', async () => {
    logToConsole("Pobieranie tabel konfiguracji... ⏳");
    const result = await sendApiRequest({ action: "getSettings" });
    logToConsole(result);
});

// [AKCJA]: ZAPIS FORMULARZA (NOWY WPIS LUB EDYCJA PO ID)
gameForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    logToConsole("Synchronizacja danych z serwerem Google... ⏳");

    const currentId = gameIdField.value;
    const isEdit = currentId !== "";

    const gameDetails = {
        "Tytuł": gameTitleField.value,
        "Stan": gameStatusField.value,
        "Platforma": gamePlatformField.value,
        "Ocena gry": gameRatingField.value ? parseFloat(gameRatingField.value) : "",
        "Recenzja": gameReviewField.value,
        "Kolekcje": gameCollectionsField.value
    };

    const result = await sendApiRequest({
        action: isEdit ? "editGame" : "addGame",
        user: userSelect.value,
        gameId: currentId,
        gameDetails: JSON.stringify(gameDetails)
    });
    
    logToConsole(result);
    if (result.status === "success") {
        gameForm.reset();
        gameIdField.value = "";
        resetFormBtn.style.display = "none";
    }
});

window.prepareEditGame = function(game) {
    gameIdField.value = game.id || "";
    gameTitleField.value = game['Tytuł'] || "";
    gameStatusField.value = game['Stan'] || "";
    gamePlatformField.value = game['Platforma'] || "";
    gameRatingField.value = game['Ocena gry'] || "";
    gameReviewField.value = game['Recenzja'] || "";
    gameCollectionsField.value = game['Kolekcje'] || "";
    
    resetFormBtn.style.display = "inline-block";
    logToConsole(`Załadowano rekord gry: "${game['Tytuł']}". Dokonaj zmian i zatwierdź przyciskiem Zapisz.`);
};

window.triggerDeleteGame = async function(id) {
    if (!id || id === "undefined") {
        alert("Ta pozycja nie posiada przypisanego unikalnego ID w arkuszu.");
        return;
    }
    if (!confirm(`Potwierdzasz trwałe usunięcie wpisu o ID: ${id}?`)) return;
    
    logToConsole(`Wysyłanie zlecenia usunięcia dla wiersza z ID: ${id}... ⏳`);
    const result = await sendApiRequest({
        action: "deleteGame",
        user: userSelect.value,
        gameId: id
    });
    logToConsole(result);
};

resetFormBtn.addEventListener('click', () => {
    gameForm.reset();
    gameIdField.value = "";
    resetFormBtn.style.display = "none";
    logToConsole("Modyfikacja rekordu anulowana.");
});

document.getElementById('btnAddSetting').addEventListener('click', async () => {
    const columnName = document.getElementById('settingsColumn').value;
    const val = document.getElementById('settingsValue').value;
    if (!val) return alert("Wprowadź poprawną wartość dla słownika!");

    logToConsole(`Dodawanie wartości '${val}' do konfiguracji: [${columnName}]... ⏳`);
    const result = await sendApiRequest({
        action: "addSettingsItem",
        columnName: columnName,
        value: val
    });
    logToConsole(result);
});