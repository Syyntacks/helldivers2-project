# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog],
and this project adheres to [Semantic Versioning].

## [Unreleased]

## [0.6.1] - 2025-12-27

### Added

- Able to handle Markdown back-end errors correctly with config file.
- `main.js`:
  - Created two new functions to handle sidebar toggling and to
  update the current page's name (keep user informed on current page).
- Added a '*Known Issues*' section to the Changelog for future referencing.

### Changed

- Reworked sidebar navigation; improved UI & reorganized back-end code
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

### Deprecated

### Removed

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
