# NKMM Baza Gier — Wersja 2.6

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

## Główne funkcjonalności i zmiany (Wersja 2.6)

1. **Dynamiczny profil "Forum" (Zbiorcza tablica ostatnich gier)**:
   * **Ostatnie 50 gier**: Nowy profil "Forum" automatycznie agreguje i sortuje po dacie ostatniej modyfikacji/dodania najświeższe 50 gier ze wszystkich baz użytkowników.
   * **Złoty wyróżnik wizualny**: Kafelek profilu Forum na ekranie powitalnym posiada dedykowaną złotą ramkę (`#d4af37`), a jego awatar to ikona główna aplikacji (`assets/icon.jpg`).
   * **Prezentacja właściciela gry**: W widoku Forum każdy rekord/grzbiet na półce odzwierciedla kolor bazy swojego gracza, a w podglądzie (tooltip oraz szczegóły) wyświetlany jest gracz, z którego bazy pochodzi dany wpis.

2. **Kolorowanie okładek/grzbietów gier z koloru profilu**:
   * Zgodnie z nowymi wytycznymi kolorystyka grzbietów książek na półkach odpowiada barwie profilu gracza (np. zielony dla MM, czerwony dla NK, granatowy dla MF, złoty dla Forum), tworząc spójny i czytelny motyw wizualny każdej biblioteki.

3. **Dynamiczne statystyki i wykresy dla wszystkich graczy**:
   * Wyeliminowano hardcodowane porównania graczy (`MM` i `NK`). Wykresy stanów gier, udziału platform, osi czasu ukończeń oraz rozkładu ocen dynamicznie skalują się do dowolnej liczby zarejestrowanych profili (w tym `MF` i kolejnych).

4. **Optymalizacja startu i ładowanie profili z pamięci**:
   * Zapis i natychmiastowy odczyt profili z `localStorage` przy starcie aplikacji.
   * Elegancki wskaźnik ładowania z animowanymi kropkami ("Wczytywanie profili gracza...") podczas sprawdzania aktualizacji kont.

5. **Poprawki mobilne i ochrona przed wirtualną klawiaturą (v2.5.3)**:
   * **Pozycjonowanie okien modalnych**: Pop-upy i modale formularzy na telefonach wyrównane do górnej krawędzi ekranu (`align-items: flex-start`, `margin-top: 4px`), zapobiegając zasłanianiu przez klawiaturę ekranową.
   * **Blokada przewijania tła**: Blokowanie scrolla tła biblioteki w trakcie otwarcia modali oraz zabezpieczenie przed zacinaniem scrollowania strony.

6. **Paginacja stron biblioteki i dynamiczne kategorie**:
   * Paginacja biblioteczek (Desktop: 15 na stronę, Laptop: 8, Mobile: 6) z obsługą gestów swipe.
   * Grupowanie kategorii jako osobne strony.
   * Zwijany panel filtrów i opcji na telefonie.

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
    └── PolaczenieGithubPages.gs # Skrypt backendu Google Apps Script
```

---

## Licencja i autorzy

&copy; NKMM Baza Gier | Wersja 2.6. Projekt stworzony do użytku prywatnego.
