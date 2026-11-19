# NKMM Baza Gier — Wersja 2.5.3

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

* **Frontend**: Czysty HTML5, modułowy Vanilla CSS3 (dedykowane tokeny projektowe, brak frameworków) oraz modułowy JavaScript ES6+.
* **Hosting**: GitHub Pages.
* **Baza danych i silnik backendowy**: Google Sheets + Google Apps Script (REST Web App API / JSONP).
* **Integracja zewnętrzna**: RAWG Video Games Database API (automatyczne pobieranie okładek i grafik gier).
* **Pamięć lokalna i kolejka**: `localStorage` / `sessionStorage` (sesja administratora, pamięć podręczna gier, kolejka zadań synchronizacji w tle).

---

## Główne funkcjonalności i zmiany (Wersja 2.5.3)

1. **Poprawki mobilne i ochrona przed wirtualną klawiaturą**:
   * **Pozycjonowanie okien modalnych**: Wszystkie pop-upy i modale formularzy na telefonach zostały wyrównane do górnej krawędzi ekranu (`align-items: flex-start`, `margin-top: 4px`), co uniemożliwia ich zasłanianie przez wysuwaną klawiaturę ekranową.
   * **Blokada przewijania tła**: W trakcie otwarcia okna modalnego (szczegóły gry, edycja, dodawanie, hasła) scroll tła biblioteki jest w całości zablokowany, eliminując niechciane przesunięcia.
   * **Niezawodne przewijanie strony**: Usunięto błąd blokujący możliwość scrollowania w dół po powrocie z widoku szczegółów gry lub zmianie aktywnej bazy.

2. **Obsługa nowych użytkowników i autoryzacja API**:
   * **Naprawa dodawania nowego gracza**: W żądaniu dodania nowego użytkownika (`addUser`) przekazywany jest parametr aktywnej bazy administratora, co eliminuje błąd braku autoryzacji w Google Apps Script. Nowe bazy tworzą się w arkuszu poprawnie wraz z kompletem kolumn i formuł statystycznych.
   * **Wsparcie dla awatarów JPG i PNG**: Dodano elastyczną obsługę formatów grafik profilowych (`.jpg`, `.jpeg`, `.png`, `.PNG`), w tym automatyczne dopasowanie dla nowo dodanych graczy (m.in. gracza MF).
   * **Dynamiczne odświeżanie listy profili**: Ekran wyboru bazy gracza dynamicznie weryfikuje i wyświetla wszystkich użytkowników z Google Sheets.

3. **Uporządkowanie interfejsu**:
   * **Uproszczony tytuł strony**: Tytuł karty w przeglądarce na stronie głównej to dokładnie `NKMM Baza Gier`.
   * **Czysty kafelek profilu**: Usunięto zdublowaną, mniejszą etykietę nazwy bazy pod awatarem profilu.

4. **Optymalizacja widoku mobilnego i zwijany panel opcji**:
   * **Zwijany panel kontrolny**: Obok paska wyszukiwania na telefonie umieszczono przycisk ze zmieniającym się symbolem `<` / `>`, który domyślnie po wejściu na stronę chowa opcje sortowania, grupowania, filtrów oraz zakładek, pozostawiając kompaktowy pasek wyszukiwania.
   * **Czytelne nagłówki sekcji**: Dodano małe etykiety `SORTOWANIE:`, `GRUPOWANIE:` oraz `FILTRY:`.
   * **Stabilność pionowa ekranu (Zero Layout Shift)**: Wyeliminowano skakanie ekranu przy zmianie stron i kategorii na telefonie poprzez zdefiniowanie stałej minimalnej wysokości obszaru roboczego biblioteki.
   * **Ochrona przed podwójnym kliknięciem (Anti-Ghost Click)**: Zabezpieczono przyciski paginacji przed przeskakiwaniem podstron przy szybkim dotknięciu ekranu.

5. **Paginacja stron biblioteki i dynamiczne kategorie**:
   * Zastąpienie długiego scrollowania stronami biblioteczek:
     * **Desktop**: 15 biblioteczek na stronę (siatka 5x3 = 120 gier na ekranie bez potrzeby przewijania).
     * **Laptop (<= 1540px)**: 8 biblioteczek na stronę (siatka 4x2 = 64 gry na ekranie).
     * **Mobile (<= 768px)**: 6 biblioteczek na ekran (siatka 2x3 = 48 gier) z obsługą gestów swipe.
   * **Grupowanie jako osobne strony**: przy włączonym grupowaniu każda kategoria stanowi osobną podstronę z natychmiastowym przełączaniem.
   * **Kaskadowa animacja po przekątnej**: biblioteczki pojawiają się płynnie od lewego górnego rogu w dół.

6. **Modułowa architektura CSS i JS**:
   * Rozbicie stylów na dedykowane moduły w `css/` oraz logiki aplikacji na moduły ES6 w `js/modules/` (`admin.js`, `api.js`, `charts.js`, `filters.js`, `navigation.js`, `shelves.js`, `state.js`, `sync.js`, `utils.js`).

---

## Struktura projektu

```
NKMM Baza Gier/
├── index.html                   # Główna struktura UI aplikacji
├── README.md                    # Dokumentacja projektu
├── assets/                      # Ikony, awatary, grafiki baz graczy oraz wektory SVG
│   ├── icon.jpg
│   ├── background.png
│   ├── Baza gier MM.PNG
│   ├── Baza gier NK.PNG
│   ├── Baza gier MF.jpg
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
│   ├── app.js                   # Główny punkt wejściowy aplikacji
│   └── modules/                 # Moduły ES6 (admin, api, charts, filters, navigation, shelves, state, sync, utils)
└── resources/
    ├── PolaczenieGithubPages.gs # Skrypt backendu Google Apps Script
    └── prompt_aktualizacja_v2.5.txt # Prompt do migracji zmian do bliźniaczych aplikacji
```

---

## Licencja i autorzy

&copy; NKMM Baza Gier | Wersja 2.5.3. Projekt stworzony do użytku prywatnego.
