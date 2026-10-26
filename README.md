# NKMM Baza Gier — Wersja 2.3

Osobisty rejestr rozgrywek, biblioteka gier oraz panel statystyk i porównań graczy. Nowoczesna, w pełni responsywna aplikacja webowa typu serverless, hostowana bezpłatnie na GitHub Pages, komunikująca się bezpośrednio z arkuszem Google Sheets jako bazą danych za pośrednictwem Google Apps Script.

---

## Architektura i stos technologiczny

Aplikacja działa w oparciu o architekturę bezserwerową:

```
+--------------------------------+
|  Frontend (HTML5 / CSS / JS)   |  <-- GitHub Pages (Static Hosting)
+---------------+----------------+
                |
                | (Asynchroniczne zapytania HTTP / JSONP / JSON API)
                v
+--------------------------------+
|  Google Apps Script (Web App)  |  <-- Serverless API z autoryzacją per baza
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
* **Baza danych i silnik backendowy**: Google Sheets + Google Apps Script (REST Web App API / JSONP).
* **Integracja zewnętrzna**: RAWG Video Games Database API (automatyczne pobieranie okładek i grafik gier).
* **Pamięć lokalna i kolejka**: `localStorage` / `sessionStorage` (sesja administratora, pamięć podręczna gier, kolejka zadań synchronizacji w tle).

---

## Główne funkcjonalności (Wersja 2.3)

1. **Obsługa profili i dynamiczne arkusze**:
   * Przełączanie profili w czasie rzeczywistym z dedykowanymi motywami kolorystycznymi i awatarami graczy (`assets/[Nazwa bazy].PNG` z fallbackiem do `assets/icon.jpg`).
   * Dynamiczne dodawanie nowych graczy bez ingerencji w kod źródłowy – automatyczne tworzenie zakładki w Google Sheets oraz formuł we wszystkich arkuszach statystyk.
   * Ekran powitalny ze swobodnie rozmieszczonymi awatarami graczy, dopasowany do pełnej wysokości okna (100vh) bez scrolla.

2. **Dedykowane hasła i autoryzacja per baza**:
   * Logowanie administratora przypisane bezpośrednio do konkretnej bazy gracza.
   * Backend weryfikujący poprawność hasła dla wybranego arkusza bez globalnego hasła głównego.

3. **Indywidualne palety barw per gracz w arkuszu**:
   * Każdy użytkownik posiada dedykowaną kolumnę kolorów stanów (np. `Kolor MM`, `Kolor NK`), odczytywaną bezpośrednio z backendu.
   * Kolorowanie grzbietów gier i etykiet dopasowane indywidualnie do aktywnego profilu.

4. **Kolejka synchronizacji w tle i Optimistic UI**:
   * Błyskawiczne dodawanie, edycja i usuwanie gier z natychmiastową aktualizacją interfejsu.
   * Kolejka synchronizacji utrwalana w pamięci lokalnej, automatycznie ponawiająca wysyłanie danych do arkusza po powrocie połączenia.

5. **Wirtualna półka z grami i gablota (Showcase)**:
   * Trójwymiarowa prezentacja biblioteki w formie półek z grzbietami gier (układ pionowy, poziomy, miks, dynamiczny podgląd monitora z opisem i okładką).
   * Edytowalna gablota 8 wyróżnionych tytułów na profilu gracza w stylu platformy Steam.
   * Masowa i pojedyncza synchronizacja brakujących okładek za pośrednictwem RAWG API.

6. **Interaktywne wykresy i statystyki (SVG)**:
   * Porównanie stanów gier (wykres słupkowy).
   * Udział platform w bibliotece i w czasie gry (wykres kołowy / donut).
   * Oś czasu ukończeń gier w poszczególnych miesiącach i latach (wykres liniowy).
   * Rozkład i histogram ocen gier.

7. **Zaawansowane wyszukiwanie i filtry**:
   * Błyskawiczne wyszukiwanie po tytule gry.
   * Filtry wielokrotnego wyboru dla Stanu, Platformy i Kolekcji/Tagów.
   * Sortowanie po tytule, ocenie, liczbie godzin oraz dacie ukończenia.

8. **Pełna responsywność (Desktop & Mobile)**:
   * Widok mobilny z dedykowaną szufladą boczną (drawer), nagłówkiem jednoliniowym oraz dopasowanymi modaliami.
   * Bezpieczeństwo formularzy: ochrona przed utratą niezapisanych zmian przy przypadkowym zamknięciu okna.

---

## Struktura projektu

```
NKMM Baza Gier/
├── index.html                   # Główna struktura UI aplikacji
├── README.md                    # Dokumentacja projektu
├── assets/                      # Ikony, awatary i grafiki baz graczy
│   ├── icon.jpg
│   ├── background.png
│   ├── Baza gier MM.PNG
│   ├── Baza gier NK.PNG
│   └── ...
├── css/
│   └── style.css                # Kompletny arkusz stylów CSS (w tym reguły półki i stopki)
├── js/
│   └── app.js                   # Główna logika aplikacji, wykresy, Optimistic UI i obsługa API
└── resources/
    └── PolaczenieGithubPages.gs # Skrypt backendu Google Apps Script (v2.3)
```

---

## Licencja i autorzy

&copy; NKMM Baza Gier | Wersja 2.3. Projekt stworzony do użytku prywatnego.