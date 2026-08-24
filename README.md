# NKMM Baza Gier — Wersja 1.0

Osobisty rejestr rozgrywek, biblioteka gier oraz panel statystyk i porównań graczy. Nowoczesna, w pełni responsywna aplikacja webowa typu serverless, hostowana bezpłatnie na GitHub Pages, komunikująca się bezpośrednio z arkuszem Google Sheets jako bazą danych za pośrednictwem Google Apps Script.

---

## Architektura i stos technologiczny

Aplikacja działa w oparciu o architekturę bezserwerową:

```
+--------------------------------+
|  Frontend (HTML5 / CSS / JS)   |  <-- GitHub Pages (Static Hosting)
+---------------+----------------+
                |
                | (Asynchroniczne zapytania HTTP / JSON API)
                v
+--------------------------------+
|  Google Apps Script (Web App)  |  <-- Serverless API z autoryzacją
+---------------+----------------+
                |
                | (Google Apps Script Spreadsheet Service)
                v
+--------------------------------+
|  Google Sheets (Baza danych)   |  <-- Arkusze graczy, słowniki i statystyki
+--------------------------------+
```

* **Frontend**: Czysty HTML5, Vanilla CSS3 (nowoczesny, minimalistyczny design bez ciężkich frameworków) oraz JavaScript ES6+.
* **Hosting**: GitHub Pages.
* **Baza danych i silnik backendowy**: Google Sheets + Google Apps Script (REST Web App API).
* **Pamięć lokalna i kolejka**: `localStorage` / `sessionStorage` (trwała sesja administratora, pamięć podręczna gier, kolejka zadań synchronizacji w tle).

---

## Główne funkcjonalności (Wersja 1.0)

1. **Obsługa wielu profili graczy**:
   * Przełączanie profili w czasie rzeczywistym z dedykowanymi motywami kolorystycznymi i awatarami.
   * Ekran powitalny z kafelkami graczy oraz gablotą wyróżnionych tytułów.

2. **Kolejka synchronizacji w tle i Optimistic UI**:
   * Błyskawiczne dodawanie, edycja i usuwanie gier z natychmiastową aktualizacją interfejsu.
   * Kolejka synchronizacji utrwalana w `localStorage`, automatycznie ponawiająca wysyłanie danych do arkusza po powrocie do sieci.

3. **Interaktywne wykresy i statystyki (SVG)**:
   * Porównanie stanów gier (wykres słupkowy).
   * Udział platform w bibliotece lub czasie gry (wykres kołowy / donut).
   * Oś czasu ukończeń gier w poszczególnych miesiącach i latach (wykres liniowy).
   * Rozkład i histogram ocen gier (od wybitnych do słabych).
   * Interaktywne dymki ze szczegółowymi danymi.

4. **Zaawansowane wyszukiwanie i filtry**:
   * Błyskawiczne wyszukiwanie po tytule gry.
   * Filtry wielokrotnego wyboru dla Stanu, Platformy i Kolekcji/Tagów.
   * Sortowanie po tytule, ocenie, liczbie godzin oraz dacie ukończenia.
   * Pastelowe pastylki tagów z paletą kolorów zapamiętywaną lokalnie.

5. **Ustawienia bazy i słowniki**:
   * Zarządzanie stanami, kolekcjami, platformami oraz profilami użytkowników w dedykowanym panelu Ustawień.

6. **Pełna responsywność (Desktop & Mobile)**:
   * Widok mobilny z dedykowaną szufladą boczną (drawer), nagłówkiem jednoliniowym oraz przyklejonym paskiem wyszukiwania i filtrów.
   * Dopasowane układy wykresów i formularzy do małych ekranów.

7. **Wygoda i bezpieczeństwo**:
   * Trwała sesja administratora na urządzeniu użytkownika (`localStorage`).
   * Obsługa skrótów klawiszowych (`Enter` do szybkiego zapisu formularzy, `Escape` do zamykania okien).
   * Ochrona przed utratą niezapisanych zmian przy przypadkowym zamknięciu formularza.

---

## Struktura projektu

```
NKMM Baza Gier/
├── index.html                   # Główna struktura UI aplikacji
├── README.md                    # Dokumentacja projektu
├── assets/                      # Ikony, awatary i grafiki
│   ├── filtr.png
│   ├── lupa.png
│   ├── matthewmill.PNG
│   └── ...
├── css/
│   └── style.css                # Kompletny arkusz stylów CSS
├── js/
│   └── app.js                   # Logika aplikacji, wykresy, synchronizacja i API
└── resources/
    └── PolaczenieGithubPages.gs # Kod backendu Google Apps Script
```

---

## Licencja i autorzy

&copy; NKMM Baza Gier - Osobisty rejestr rozgrywek. Projekt stworzony do użytku prywatnego.