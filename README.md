# Game Tracker & Review Dashboard

A sleek, custom, and fully responsive web application designed for personal video game library management. This project serves as a highly optimized, modern alternative to generic low-code tools like AppSheet, giving full frontend control and flawless desktop performance.

The app uses a serverless architecture: a static frontend deployed globally for free, communicating directly with Google Sheets as a data engine without needing a dedicated server backend.

---

## Architecture & Tech Stack

This project is built using a minimal and highly efficient tech stack to ensure instant load times and zero hosting costs.

+--------------------------------+
|  Custom Frontend (HTML/JS)     |  <-- Hosted for free on GitHub Pages
+---------------+----------------+
                |
                | (Asynchronous HTTP Fetch / JSON)
                v
+--------------------------------+
|  Google Apps Script (Web App)  |  <-- Acts as a serverless API
+---------------+----------------+
                |
                | (Internal Google Spreadsheet Service)
                v
+--------------------------------+
|  Google Sheets Database        |  <-- Free and flexible data storage
+--------------------------------+

* Frontend: Pure HTML5, CSS3, and modern JavaScript (ES6+).
* Hosting: GitHub Pages (Static site delivery).
* Database & Logic Engine: Google Sheets managed via custom Google Apps Script exposed as a Secure Web App API.

---

## Key Features

* Custom Game States: Seamlessly track games across states: Want to play, Currently playing, and Completed.
* Personalized Ratings & Reviews: Log scores and detailed thoughts for every completed game.
* Tagging System: Dynamic tag management to categorize games by genre, platform, or custom tags.
* Instant Client-Side Filtering: Advanced client-side grouping and sorting (by rating, tags, or status) processed instantly in the browser without network lag.
* Desktop-First UI: Optimized interface designed specifically for smooth desktop use, replacing clunky mobile-first automated layouts.

---

## Project Structure

Following clean code guidelines, all JavaScript variables and functions utilize camelCase, while repository filenames follow the snake_case convention.

game_tracker/
│
├── index.html              # Main application layout and UI structure
├── README.md               # Project documentation
│
├── css/
│   └── styles.css          # UI styling and responsive layouts
│
├── js/
│   └── app.js              # Frontend logic, state management, and API calls
│
└── google_backend/
    └── apps_script.js      # Serverless API code deployed on Google Apps Script

---

## How It Works (Developer Notes)

1. Single Data Fetch: On startup, app.js performs a single fetch() request to the Google Apps Script Web App URL (getAllGames). The data is securely stored in memory.
2. Blazing Fast UI: All sorting, grouping, and tag filtering are executed directly on the client side using efficient JavaScript arrays (.reduce(), .filter()).
3. Secure Mutations: When adding (addGame), editing (editGame), or deleting (deleteGame), the frontend fires a single POST request containing a JSON payload. The Apps Script backend securely updates the rows and automatically handles row shifting.

---

## Security & Limits

* Usage Limits: Utilizes Google's generous daily quotas (up to 20,000+ API requests per day), making it permanently free for personal usage.
* Data Integrity: Games are assigned unique immutable IDs using millisecond timestamps (Date.now()) to ensure row shifting during deletions never disrupts data relations.