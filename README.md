# Tabloom

> Keep tabs clear. Save what matters.

Tabloom is a local-first tab manager for Chrome and Microsoft Edge. It brings your open tabs, pages to revisit, and saved pages together in one calm desktop workspace.

Tabloom does not require an account or backend server, and it does not send your browsing data anywhere.

## Installation

### From a GitHub release

1. Download `tab-atlas.zip` from the [latest release](https://github.com/cinlachan/tabloom/releases/latest).
2. Unzip the downloaded file.
3. Open `chrome://extensions` in Chrome or `edge://extensions` in Microsoft Edge.
4. Enable **Developer mode**.
5. Click **Load unpacked**.
6. Select the extracted folder that contains `manifest.json`.
7. Pin **Tabloom** from the browser's Extensions menu.
8. Click the Tabloom toolbar icon to open the dashboard.

## Features

- **For Later** keeps pages you want to handle later, even after their original tabs have been closed.
- **Open Tabs** groups tabs from every browser window by website.
- **Saved** keeps pages that are worth returning to over the long term.
- Click a page to switch to its existing tab or reopen it if the tab has already been closed.
- Manage individual pages, entire website groups, or use `Complete all`, `Close all`, and `Remove all`.
- Search across page titles, summaries, website names, and URLs.
- Collapse each section independently.
- Confirm destructive bulk actions and undo the most recent action in each section.
- Follow the system theme by default, with manual Light and Dark options.
- Choose between Off, Subtle, and Playful interaction sounds.
- Enjoy lightweight tactile animations and click-position cursor effects.
- Keep webpage titles and summaries in their original language while the Tabloom interface remains in English.

## Maintainer Documentation

The following maintainer documents are currently written in Chinese:

- [Product and interaction specification](docs/PRODUCT_SPEC.md)
- [Visual design and copy guidelines](docs/DESIGN_SYSTEM.md)
- [Technical architecture and data model](docs/ARCHITECTURE.md)
- [Maintenance guide](docs/MAINTENANCE.md)
- [Testing and release checklist](docs/RELEASE_CHECKLIST.md)
- [Changelog](CHANGELOG.md)

## Project Structure

```text
tabloom/
├── manifest.json          # Extension manifest, version, and permissions
├── background.js          # Toolbar action and page metadata storage
├── content-script.js      # Reads public page metadata for summaries
├── dashboard.html         # Dashboard structure
├── dashboard.css          # Responsive layout and Light/Dark themes
├── dashboard.js           # Tab management, collections, and interactions
├── docs/                  # Product, design, technical, and maintenance docs
├── CHANGELOG.md           # Version history
└── README.md              # Project overview
```

## Privacy and Permissions

Tabloom is local-first and does not upload browsing data.

- `tabs` allows Tabloom to read tab titles and URLs, focus existing tabs, and close tabs.
- `storage` keeps For Later, Saved, theme, sound, and collapsed-section preferences in the browser's local storage.
- `<all_urls>` allows Tabloom to read publicly available page metadata such as the title, favicon, site name, and description. It does not read form fields or upload page data.

Protected browser pages such as `chrome://settings` do not allow content scripts, so their summaries may fall back to URL information.

Undoing a closed tab reopens its URL, but the browser cannot restore the original tab's back/forward history, scroll position, or form state.

## Development

Tabloom uses native HTML, CSS, and JavaScript with Chrome Extension Manifest V3. It has no build step and no third-party runtime dependencies.

After changing the source files:

1. Open the browser's extensions page.
2. Click **Reload** on the Tabloom extension card.
3. Refresh the open Tabloom dashboard.
4. If `content-script.js` changed, refresh the ordinary webpages used for testing as well.
