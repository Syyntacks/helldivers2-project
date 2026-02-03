# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog],
and this project adheres to [Semantic Versioning].

## [Unreleased]

## [0.7.0] - 2026-02-03

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
- Persisting formatting issues on pages: **All Planets, Major Order(s), Galaxy Stats, Galactic Map**
- Mobile formatting inconsistencies

## [0.6.1] - 2025-12-27

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

## [0.6.0] - 2025-12-05

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
