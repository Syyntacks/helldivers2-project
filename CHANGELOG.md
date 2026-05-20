# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog],
and this project adheres to [Semantic Versioning].

## [0.9.0.1] - 2026-05-20 HOTFIX

### Added

- **Live Major Order Fetch:** `main.js` now fetches active Major Orders directly from the Helldivers 2 API on every page load via a new `fetchLiveMajorOrders()` function.
  - If the live order matches one already in the static file, parsed task details are merged in automatically.
  - If the live order is newer than the last scrape, it displays with title, briefing, expiry, and reward — task breakdown will appear after the next 8-hour data scrape.
- **Live Dispatch Fetch:** `fetchDispatchData()` now tries the live API first before falling back to the static `dispatches.json`, keeping Super Earth Dispatch current between scrapes.
- **`api_config.json` expanded:** Added `assignmentsUrl` and `newsFeedUrl` fields so the frontend knows where to fetch live Major Order and Dispatch data.
- **`build_static_api.py` updated:** Now writes `assignmentsUrl` and `newsFeedUrl` into `api_config.json` on each scrape run, keeping the URLs sourced from environment variables.

### Fixed

- **Cloudflare Pages deployment failure:** Build output directory was blank in the Cloudflare dashboard, causing a 404 on the live site. Set to `dist` to match `build.sh` output.
- **Major Orders showing empty between scrapes:** Homepage and Major Orders page now use `getMajorOrderData()` which prefers live API data over the static snapshot, so a new Major Order is visible immediately after it goes live — not hours later.
- **Super Earth Dispatch showing empty between scrapes:** Same live-first approach applied to dispatch/news feed data.
- **Live player counts never updating on homepage planet cards:** Element IDs `planet-players-{index}` and `planet-trend-{index}` had a leading space in the rendered HTML, causing `getElementById` to silently fail on every live refresh tick.

### Known Issues

- **Task breakdown unavailable for brand-new Major Orders:** If a Major Order begins after the last 8-hour scrape, objectives will show "No specific tasks data available" until the next scrape populates the static file.
- **Persisting formatting issues on pages:** *All Planets, Major Order(s), Galaxy Stats, Galactic Map*.
- Mobile formatting inconsistencies.
- Galactic Map can appear to visually lag.
- Some objectIDs have not been properly defined yet and may result in `Greatcloak of Rebar Resolve` in the output.

## [0.9.0] - 2026-05-10

### Added

- **Live Refresh System:** Frontend now polls the live Helldivers 2 API every 60 seconds for fresh player counts, liberation percentages, and health values, updating visible DOM elements in-place without re-rendering the page.
  - Player count trend indicators (▲/▼ with rate-per-minute) shown on homepage planet cards.
  - Regen trend indicators shown per planet card.
  - Sub-second interpolation loop (every 50ms) smoothly animates player counts between ticks.
- **Planet Modal:** Fully implemented planet detail overlay, replacing the old stub.
  - Populated with planet name, owner, sector, biome, biome description, hazards, player count, and liberation/defense progress bars.
  - Modal progress bars are kept in sync with the live refresh system.
  - Planet list cards now have `cursor: pointer` to indicate interactivity.
- **Galactic Map:** Added `#galactic-map` section with `#map-container` div and supporting styles; Konva.js CDN script added to `index.html`.
  - *(Note: the Galactic Map is in an alpha state. While it is functioning, it is still missing vital information soon to be implemented/added.)*
- **Static API Build Pipeline (Host migration):**
  - Created `build_static_api.py` — runs during the GitHub Action to fetch live data, parse it through existing parsers, and write static JSON files to `static-api/`.
  - Migrated to new host for better performance, loading times, and more control.
- **New API Endpoints** (in `api_source.py`):
  - `/api/enemies` — returns static enemy data from `enemies/hd2_enemies.json`.
  - `/api/sector_layout` — returns static sector layout from `sectors.json`.
  - `/api/planets/{planet_index}/player_history` — returns a time-series of player counts for a planet over the past N days, sourced from `data_history/planets_snapshot/`.
- **New Parser:** Created `utils/parse_conf/news_feed_parser.py` (`newsFeedParser`) to parse in-game dispatch/news feed messages.
  - Converts in-game markup (`<i=3>`, `<i=1>`) to styled HTML spans.
  - Integrates with `format_dispatch_date()` for short and hover-full timestamps.
- **Homepage Dispatch Display:** Added styles for the news feed/dispatch summary grid (`.dispatch-summary-grid`, `.homepage-dispatch-data`, `.dispatch-header`, `.dispatch-highlight`, etc.).
- **Major Order Page Styles:** Added `.mo-page-container`, `.mo-page-description`, `.mo-page-expiry`, and related rules for a dedicated MO detail page layout.
- **Galaxy Stats Page Layout:** Added `.galaxy-stats-page-layout` grid layout and responsive sizing rules.
- **Player Percentage Mini-Bar:** Added `.player-pct-bar-container` and `.player-pct-bar` to show each active planet's share of total Helldivers online, with a tooltip on hover.
- **Planet Card Header:** Added `.planet-card-header`, `.planet-regen-stat`, `.planet-player-stat`, and `.regen-trend` styles for richer stat overlays on homepage planet cards.
- **Galactic Map Tooltip:** Added `.galactic-map-tooltip` and `.galactic-map-wrapper` styles.
- **CSS Variables:** Added shadow-color variants for all faction and status colors, plus `--dark-grey` and `--white-text` variables.
- **Static Files Mount:** Added `/static-api` mount in `api_source.py` so the backend can serve the generated static JSON files locally during development.

### Changed

- **Data Snapshot Schedule:** GitHub Action changed from "every 3 hours + once at 5am UTC" to a clean 8-hour cycle: 00:00, 08:00, 16:00 UTC.
  - This should hopefully reduce the no. of files being saved for future data parsing.
- **GitHub Action now commits `static-api/`** in addition to `data_history/` on each snapshot run.
- **Azure Deployment Retired:** `main_hd2-war-data-tracker.yml` trigger changed from auto-deploy on push to manual-only with a confirmation input; marked as retired with a comment header.
- **Sidebar Navigation Order:** Reordered nav links — Galactic Map now appears before Galaxy Stats and Major Orders.
- **Cache TTL Reduced:** Default fetch TTL across `data_fetcher.py`, `api_source.py`, `main_exe.py`, and `planet_data_parser.py` changed from 60s to 30s.

#### datetime_converter.py

- Added `format_dispatch_date()` — returns `{"short": "MM-DD-YY", "full": "MM-DD-YY HH:MM UTC"}` for ISO timestamps, used by the news feed.
- `format_duration_from_seconds()`: Input is now treated as milliseconds (divided by 1,000 before processing) to match the raw API value.
- `format_duration_from_seconds()`: Output changed from (`"1 year, 2 months, 3 days"`) to compact (`"1Y 2M 3D"`).

#### galaxy_stats_parser.py

- Refactored to build a separate `usable_stats_dict` instead of mutating the raw `overall_stats_dict`, preventing raw API fields from leaking into parsed output.

#### major_order_parser.py

- Added `factionId` and `enemyId` fields to parsed task details (extracted from `value_map` using `faction` and `targetId` value keys).
- Removed unused imports (`fetch_data_from_url`, `settings`).

#### planet_data_parser.py

- Fixed planet position parsing — was referencing undefined local variables `x` and `y`; now passes the correct default dict `{'x': 0, 'y': 0}`.
- Fixed hazards list source — was reading from `planets_dict` (wrong variable); now correctly reads from `planet`.
- Simplified regions data — previously extracted individual region fields into separate top-level keys; now passes the raw `planet.get("regions", [])` list as `'regions'` directly.
- Added import of `format_duration_from_seconds`; `mission_time` stat is now formatted on parse instead of left as raw seconds.
- Removed `event_type` field from defense event parsing.
- Removed unused imports (`Union`, `List`, `traceback`).

#### styles.css

- **Changelog `h4` color:** Changed from `--terminal-green` to `--illuminate-color` (purple) with matching shadow.
- **Changelog list bullets:** Changed from `list-style-type: square` to a custom `"> "` prefix via `::marker` for top-level items; nested lists use `disc` / `circle`.
- **Changelog nested list items:** Reduced font size to `0.95rem` and colored with `--light-grey-text`.
- **Changelog `li strong` font size:** Reduced from `1.1rem` to `1rem`.
- **Stat card padding:** Changed top padding from `15px` to `8px 15px 15px 15px`.
- **Stat card hover:** Added `translateY(-4px)` lift and yellow glow box-shadow.
- **Stat card progress bar:** Now extends edge-to-edge (negative horizontal margins) with no left/right border.
- **MO card max-width:** Increased from `800px` to `850px`.
- **Planet list card bg image opacity:** Reduced from `0.3` to `0.2`.
- **Progress bar height:** Changed from `1.25em` to `20px` (fixed px for consistent sizing).
- **Progress bar font size:** Standardized to `0.75rem` with `!important` on the text overlay.

### Deprecated

- **Azure hosting** — deployment has moved to Cloudflare Pages; Azure workflow is kept for reference only.

### Removed

#### planet_data_parser.py

- Removed individual region field keys (`regionId`, `regionHash`, `regionName`, `regionDesc`, `regionHealth`, `regionMaxHealth`, `regionSize`, `regionRegen`, `regionAvailability`, `regionIsAvailable`, `regionPlayers`) from the planet output dict.

### Fixed

- **Timestamp format typo** (`datetime_converter.py`): `%H:%M:$S` corrected to `%H:%M:%S`.
- **`bullets_fired` / `bullets_hit` swap** (`planet_data_parser.py`): The two fields were assigned to each other's variable names.
- **Galaxy stats `missionTime` mutation**: Parser no longer overwrites the raw value in `overall_stats_dict`; formatted version goes into the clean output dict only.
- **Changelog markdown rendering**: Added `tab_length=2` to `markdown.markdown()` call in `api_source.py` to fix nested list indentation.

### Security

- Obfuscation measures have been implemented for security purposes.

### Known Issues

- **Persisting formatting issues on pages:** *All Planets, Major Order(s), Galaxy Stats, Galactic Map*.
- Mobile formatting inconsistencies.
- Galactic Map can appear to visually lag.
- Some objectIDs have not been properly defined yet and may result in `Greatcloak of Rebar Resolve` in the output.

## [0.8.1] - 2026-02-26 HOTFIX

### Added

### Changed

### Deprecated

### Removed

### Fixed

- Fixed error on loading **All Planets** and **Galaxy Stats** pages.
  - Changed sources from local testing to proper domain.

### Security

### Known Issues

## [0.8.0] - 2026-02-26

### Added

- Planet image resources gathered using `download_assets.py` from `helldiverscompanion.com` public resources.

#### api_source.py

- Imported `HTMLResonse` from `FastAPI.responses`.
- Added `import markdown` to import list.
- Created `changelog_page()` to view full `CHANGELOG.md`.

#### download_assets.py

- Created a script to access and save public image resources from `helldiverscompanion.com`.
- *Can be altered based on URL or desired directory.*

#### requirements.txt

- Updated required third-party libraries list.

#### index.html

- Created reference pages for `CHANGELOG.md` display.
- Inserted planet-overlay element for upcoming planet card overlay.

#### main.js

- Created `openPlanetOverlay()` function to handle upcoming planet card overlay activation.
  - `closePlanetOverlay()` is created however currently unpopulated.
- **Changelog** page title and routing added.
- `renderPlanetsPage()` officially implemented; search bar and dropdown filter menu to offer users organized planet or faction-specific data.
  - *You can search by planet name or by Sector name. More search parameters will be added soon.*
- Created two new functions- `analyzeSectors()` and `evaluateSectorControl()`- to check **Planet's** current sector and its owner, and to provide dynamic styling respectively.
- Created a proper **Planet Card** that provides a more dynamic experience for the user.
  - *More information to be added over time. May result in some unexpected formatting issues.*
- `renderChangelog()` function created to render `CHANGELOG.md` notes.

### Changed

- Changed the `json` directory from a submodule to hosting local files to avoid inconsistencies and to allow self-configuration.

#### main.js

- `renderPlanetsPage()` changed planet.owner value results to faction string instead of an integer ('2' => 'terminids', etc.)

#### styles.css

- With AI assistance the document has been reformatted for a more cohesive and organized coding experience.

### Deprecated

### Removed

#### main.js

- Removed prior loading message (inconsistent message appearing).

### Fixed

- Fixed some formatting issues across application.

### Security

### Known Issues

- **Persisting formatting issues on pages:** *All Planets, Major Order(s), Galaxy Stats, Galactic Map*
- Mobile formatting inconsistencies

## [0.7.3] - Wednesday, 2026-02-25

### Added

- **Bidirectional Progress Bar:** Added a proper 'Contest' MOs progress bar.
- **Binary Progress Bar:** Created a dedicated MO progress bar to handle majority cases.
- Filled the **War Effort Summary** with full Galactic statistics.

#### galaxy_stats_parser.py

- Added missing statistics to stats dictionary (`missions_won`, `missions_lost`, `missions_total`, `accidentals`).

### Changed

#### main.js

- Decreased size of liberation percentage bar in **Planet Cards** on Homepage.
- Text formatting for `<p>` in Homepage cards has been decreased, making room for future additions.
- Moved defense timer above progression bars.
- **War Effort Summary** stats written in `<div>` instead of `<p>`.

### Deprecated

- Previous **War Effort Summary** layout.

### Removed

- Removed `planet_node` in preparation for dedicated *Planets* page.

### Fixed

- Implemented safety measures to prevent app from crashing due to unforeseen raw data.

### Security

### Known Issues

- **Persisting formatting issues on pages:** *All Planets, Major Order(s), Galaxy Stats, Galactic Map.*
- Mobile formatting inconsistencies.

## [0.7.2] - Sunday, 2026-02-22

### Added

### Changed

- **History Save Timeframe:**
  - Previous change was to `main_exe.py`.
  - Present change changed data bot interval from *every hour* to *every 3 hours & once at 5am (UTC 0:00).*

### Deprecated

### Removed

### Fixed

- **Data Bot Error Code 01:** Made repo changes to ensure the data bot can correctly read `.env` variables.

### Security

### Known Issues

- **Cloud Persistence:** Data history snapshots saved on Azure Static Web Apps (or similar serverless environments) are temporary and will be wiped when the instance idles. A local or external storage solution is required for permanent data retention.
- **Persisting formatting issues on pages:** *All Planets, Major Order(s), Galaxy Stats, Galactic Map*
- Mobile formatting inconsistencies

## [0.7.1] - Saturday, 2026-02-07

### Added

### Changed

- **History Save Timeframe:** Increased the timeframe from 6 seconds (for testing) to 21,600 (= 6 hrs).

### Deprecated

### Removed

- **Removed conflicting workflow files:** Removed extra Azure workflorws that were creating build and deploy conflicts.

### Fixed

### Security

### Known Issues

- **Cloud Persistence:** Data history snapshots saved on Azure Static Web Apps (or similar serverless environments) are temporary and will be wiped when the instance idles. A local or external storage solution is required for permanent data retention.
- **Persisting formatting issues on pages:** *All Planets, Major Order(s), Galaxy Stats, Galactic Map*
- Mobile formatting inconsistencies

## [0.7.0] - Tuesday, 2026-02-03

### Added

- **Caching System:** Implemented a *"Cache-Aside"* architecture `data_fetcher.py` to store API responses locally with a configurable Time-To-Live (default 60s), *significantly* reducing API request volume.
- **Data Archival:** Added a history snapshot feature that saves raw JSON data for Major Orders, Galaxy Stats, and Planets to a local `data_history` directory for future analysis.
  - **Structured History:** Implemented a date-based folder hierarchy `/data_history/{category}/{date}/{time}.json` to automatically organize saved snapshots.
- **Background Worker:** Updated `main_exe.py` to function as a standalone background service that handles scheduled data scraping and history saving independently of the web API.
- **Static Resource Loading:** `main_exe.py` now correctly pre-loads static JSON resources at startup, aligning it with the API's behavior.

### Changed

- **API Endpoints:** Refactored `api_source.py` to use the new `fetch_data_from_url` utility, ensuring all web requests benefit from the caching layer.
- **Parser Logic:** Updated `PlanetParser` and `MajorOrderParser` to accept and propagate `save_history` flags down to the data fetching layer.
- **Azure Compatibility:** `data_fetcher.py` now detects read-only file systems and automatically falls back to the system's temporary directory for caching to prevent crashes.

### Deprecated

### Removed

### Fixed

- **Frontend Progress Bar:** Resolved a visual bug where completed objectives were displaying as 0% progress; added logic to force the visual indicator to 100% when the isComplete flag is true, regardless of planet health data.
- **Major Order Crash:** Fixed a TypeError in main_exe.py that occurred when parsing tasks with no numerical goal (e.g., "Hold Planet" territory tasks); added safe formatting checks to handle None values.
- **Parser Instantiation:** Resolved critical crashes in main_exe.py where MajorOrderParser and PlanetParser were being initialized without required static data arguments.

### Security

- Instated *Locks* on resources to avoid a human-made error.

### Known Issues

- **Cloud Persistence:** Data history snapshots saved on Azure Static Web Apps (or similar serverless environments) are temporary and will be wiped when the instance idles. A local or external storage solution is required for permanent data retention.
- **Persisting formatting issues on pages:** *All Planets, Major Order(s), Galaxy Stats, Galactic Map*
- Mobile formatting inconsistencies

## [0.6.1] - Saturday, 2025-12-27

### Added

- Able to handle Markdown back-end errors correctly with config file.
- `main.js`:
  - Created two new functions to handle sidebar toggling and to
  update the current page's name (keep user informed on current page).
- Added a '*Known Issues*' section to the Changelog for future referencing.

### Changed

- **Reworked sidebar navigation:** improved UI & reorganized back-end code
to include more dynamic elements:
  - Dynamic slide-in sidebar included.
  - Page content is slightly blurred to focus users to sidebar.
  - Created new styles to handle:
    - Dynamic page heading.
    - Create icons for user interaction (menu button, close button).
    - User's link-clicking interaction is shown.
      - Changed overall design to match desired aesthetic.
      - Sidebar navigation is not in an unlisted list.
- `main.js`:
  - Changed the page title's default route if no pages are defined.
- `styles.css`:
  - Changed parameters for .sidebar-nav style for more dynamic sidebar.

### Fixed

- `main.js`:
  - Reordered page section's z-index so the top bar is always shown & the
  sidebar nav with overlay covers the content.

### Security

- Back- and front-end are now officially running online for
public access (user must know link for now).
  - Running through third-party software to ensure consistent
  runtime and access.

### Known Issues

- Contest MO-type is displaying improper information.
- Most additional webpages are either broken or do not display correct/full information.

## [0.6.0] - Friday, 2025-12-05

### Added

- Initial GitHub release
- Updated after rebase debacle...

### Changed

- Reverted to older version of project to debug rebase issue

### Deprecated

### Removed

### Fixed

- Fixed issue causing 'Error: No URL Provided' to appear in the console

### Security

### Known Issues

<!-- Links -->
[keep a changelog]: https://keepachangelog.com/en/1.0.0/
[semantic versioning]: https://semver.org/spec/v2.0.0.html

<!-- Versions -->
[unreleased]: https://github.com
