# NKMM Baza Gier — Wersja 2.5.1

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

* **Frontend**: Czysty HTML5, modułowy Vanilla CSS3 (dedykowane tokeny projektowe, brak frameworków) oraz JavaScript ES6+.
* **Hosting**: GitHub Pages.
* **Baza danych i silnik backendowy**: Google Sheets + Google Apps Script (REST Web App API / JSONP).
* **Integracja zewnętrzna**: RAWG Video Games Database API (automatyczne pobieranie okładek i grafik gier).
* **Pamięć lokalna i kolejka**: `localStorage` / `sessionStorage` (sesja administratora, pamięć podręczna gier, kolejka zadań synchronizacji w tle).

---

## Główne funkcjonalności (Wersja 2.5.1)

1. **Paginacja stron biblioteki i dynamiczne kategorie**:
   * Zastąpienie długiego scrollowania stronami biblioteczek:
     * **Desktop**: 15 biblioteczek na stronę (siatka 5x3 = 120 gier na ekranie bez potrzeby przewijania).
     * **Laptop (<= 1540px)**: 8 biblioteczek na stronę (siatka 4x2 = 64 gry na ekranie, idealnie w 100% wysokości bez scrolla).
     * **Mobile (<= 768px)**: 6 biblioteczek na ekran (siatka 2x3 = 48 gier) z obsługą gestów swipe (przesuwanie palcem w lewo/prawo jak w galerii).
   * **Grupowanie jako osobne strony**: przy włączonym grupowaniu (np. według Stanu gry, Platformy, Oceny czy Roku) każda kategoria stanowi osobną podstronę, a dolny pasek nawigacji pozwala na natychmiastowe przełączanie między grupami.
   * **Kaskadowa animacja po przekątnej**: biblioteczki pojawiają się płynnie i dynamicznie od lewego górnego rogu w dół (`animation-delay` zależne od współrzędnych `row + col`).

2. **Dedykowany pasek nawigacji stron**:
   * Umieszczony pod biblioteczkami z białymi, ostrymi wektorami strzałek SVG.
   * Rozwijane menu wyboru stron i kategorii z automatycznym dopasowaniem do szerokości treści i cienkim, minimalistycznym paskiem przewijania.

3. **Modułowa architektura CSS i tokeny**:
   * Rozbicie stylów na zorganizowane moduły: `tokens.css`, `base.css`, `nav.css`, `welcome.css`, `dashboard.css`, `shelves.css`, `forms-modals.css`, `charts-tables.css`, `responsive.css`.
   * Stały nagłówek (`position: fixed`) niezawodnie widoczny na górze ekranu w trakcie całego korzystania z aplikacji.

4. **Bezpieczne zarządzanie hasłami w Google Apps Script**:
   * Odczyt haseł z `Script Properties` (Właściwości skryptu) w Google Apps Script, bez hardcodowania haseł w kodzie repozytorium.
   * Automatyczna obsługa każdego nowego użytkownika o formacie `Baza gier {2 litery}`.

5. **Obsługa profili i dynamiczne arkusze**:
   * Przełączanie profili w czasie rzeczywistym z dedykowanymi motywami kolorystycznymi i awatarami graczy.
   * Dynamiczne dodawanie nowych graczy bez ingerencji w kod źródłowy – automatyczne tworzenie zakładki w Google Sheets oraz formuł w statystykach.

6. **Kolejka synchronizacji w tle i Optimistic UI**:
   * Błyskawiczne dodawanie, edycja i usuwanie gier z natychmiastową aktualizacją interfejsu.
   * Kolejka synchronizacji utrwalana w pamięci lokalnej, automatycznie ponawiająca wysyłanie danych do arkusza po powrocie połączenia.

7. **Wirtualna półka z grami i gablota (Showcase)**:
   * Prezentacja biblioteki w formie półek z grzbietami gier i dynamicznym podglądem monitora.
   * Edytowalna gablota 8 wyróżnionych tytułów na profilu gracza w stylu platformy Steam.

8. **Interaktywne wykresy i statystyki (SVG)**:
   * Porównanie stanów gier, udział platform, oś czasu ukończeń oraz histogram ocen gier.

---

## Struktura projektu

```
NKMM Baza Gier/
├── index.html                   # Główna struktura UI aplikacji
├── README.md                    # Dokumentacja projektu
├── assets/                      # Ikony, awatary, grafiki baz graczy oraz wektory SVG
│   ├── icon.jpg
│   ├── background.png
│   ├── arrow-block-left-svgrepo-com.svg
│   ├── arrow-block-right-svgrepo-com.svg
│   └── ...
├── css/
│   ├── tokens.css               # Globalne zmienne projektowe i tokeny stylów
│   ├── base.css                 # Style bazowe i reset
│   ├── nav.css                  # Nagłówek i szuflada mobilna
│   ├── welcome.css              # Ekran powitalny
│   ├── dashboard.css            # Układ pulpitu i panele sterowania
│   ├── shelves.css              # Półki z grami, animacje i paginacja
│   ├── forms-modals.css         # Okna modalne i formularze edycji
│   ├── charts-tables.css        # Wykresy SVG i tabele statystyk
│   ├── responsive.css           # Responsywność (Desktop, Laptop, Mobile)
│   └── style.css                # Główny punkt wejściowy importujący moduły CSS
├── js/
│   └── app.js                   # Główna logika aplikacji, paginacja, wykresy i obsługa API
└── resources/
    └── PolaczenieGithubPages.gs # Skrypt backendu Google Apps Script
```

---

## Licencja i autorzy

&copy; NKMM Baza Gier | Wersja 2.5. Projekt stworzony do użytku prywatnego.wykresy, Optimistic UI i obsługa API
└── resources/
    └── PolaczenieGithubPages.gs # Skrypt backendu Google Apps Script
```

---

## Licencja i autorzy

&copy; NKMM Baza Gier | Wersja 2.5.1. Projekt stworzony do użytku prywatnego.