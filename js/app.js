const googleScriptUrl = "https://script.google.com/macros/s/AKfycbyp3D2WaBoWCZ-qwAlZoLu3zURZALiLulPrTlUXtn94_Y2eJpgxylb9Ceo8HtdGi-F8/exec";

// Elementy panelu logowania z poziomu paska górnego
const loginContainer = document.getElementById('loginContainer');
const loginForm = document.getElementById('loginForm');
const sitePasswordInput = document.getElementById('sitePassword');
const loginError = document.getElementById('loginError');

// Ukryte strefy dla administratorów (Hasło wymagane)
const adminZone = document.getElementById('adminZone');

// Zmienna sesyjna na poprawne hasło
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
 * Procedura zalogowania administratora / edytora
 */
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const enteredPassword = sitePasswordInput.value;
    loginError.textContent = "Weryfikacja... ⏳";

    // Sprawdzamy czy hasło pasuje, próbując pobrać słowniki (akcja admina)
    const result = await sendApiRequestWithCustomPassword({ action: "getSettings" }, enteredPassword);

    if (result.status === "success") {
        currentSessionPassword = enteredPassword; 
        loginContainer.innerHTML = "<p style='color:green; font-weight:bold; margin:0;'>🔐 Zalogowano pomyślnie jako Administrator.</p>";
        adminZone.style.display = "block"; // Odkrywamy panele zapisu i słowników!
        logToConsole("Tryb edycji aktywny. Masz pełny dostęp do zapisu.");
    } else {
        loginError.textContent = "🛑 Błędne hasło admina!";
        sitePasswordInput.value = "";
    }
});

/**
 * Główny przekaźnik żądań JSONP
 */
function sendApiRequest(params) {
    return sendApiRequestWithCustomPassword(params, currentSessionPassword);
}

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
        queryParams.append("pass", password); // Dla pobierania gier pole to poleci jako puste ("")

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

// [PUBLICZNA AKCJA]: POBIERANIE LISTY GIER (BRAK WYMAGANEGO HASŁA)
document.getElementById('btnFetchGames').addEventListener('click', async () => {
    logToConsole("Pobieranie bazy gier z chmury Google (Publiczny odczyt)... ⏳");
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
            // Przyciski edycji/usuwania renderujemy, ale ich kliknięcie bez zalogowania rzuci błąd zabezpieczenia
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

// [ADMIN AKCJA]: POBIERANIE SŁOWNIKÓW SŁUŻBOWYCH
document.getElementById('btnFetchSettings').addEventListener('click', async () => {
    logToConsole("Pobieranie tabel konfiguracji... ⏳");
    const result = await sendApiRequest({ action: "getSettings" });
    logToConsole(result);
});

// [ADMIN AKCJA]: ZAPIS FORMULARZA (NOWY WPIS LUB EDYCJA PO ID)
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
    if(!currentSessionPassword) {
        alert("🛑 Tryb Read-Only! Aby modyfikować bazę, zaloguj się na górze strony podając hasło administratora.");
        return;
    }
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
    if(!currentSessionPassword) {
        alert("🛑 Tryb Read-Only! Brak uprawnień do usuwania wpisów. Zaloguj się.");
        return;
    }
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