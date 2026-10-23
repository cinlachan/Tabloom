# Tabloom

> Keep tabs clear. Save what matters.

Tabloom is a local-first tab manager for Chrome and Microsoft Edge. It brings your open tabs, pages to revisit, and saved pages together in one calm desktop workspace.

Tabloom does not require an account or backend server, and it does not send your browsing data anywhere.

## Installation

### From a GitHub release

1. Download `tabloom.zip` from the [latest release](https://github.com/cinlachan/tabloom/releases/latest).
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
- Press `Alt+Shift+L` on any page to keep it for later, or `Alt+Shift+S` to save it — or right-click a page or link. `Alt+Shift+T` opens Tabloom. These browser-wide shortcuts are listed in Settings, with a link to the browser page where they can be changed.
- Customize the dashboard shortcuts (Jump to, Filter, Undo) in Settings: click a shortcut and press the new keys. Conflicts and browser-reserved combos are caught.
- Press `⌘K` (`Ctrl+K` on Windows/Linux) to jump to any open tab, For Later or Saved page, or type `>` to run commands such as closing duplicate tabs.
- Every removal shows an Undo button; `⌘Z` / `Ctrl+Z` undoes the latest action. Closed tabs come back with their history when the browser still remembers them.
- Click a page to switch to its existing tab or reopen it if the tab has already been closed.
- Reorder Open Tabs site cards with the six-dot drag handle or arrow keys, or sort them by tab count, recent activity, or site name.
- Manage individual pages, entire website groups, or use `Complete all`, `Close all`, and `Remove all`.
- Filter the dashboard with `/` across page titles, summaries, website names, and URLs.
- Collapse each section independently.
- `Complete all` and `Remove all` run instantly with Undo; only `Close all` asks first. Bulk closes never touch pinned tabs.
- For Later pages slowly fade the longer they wait, with an amber marker and an "Added 5 days ago" label, so anything put off for over a week stands out.
- When the same URL is open more than once, a `N dupes` chip appears on that site's card — click it to close just the extra copies. The tab you are using stays, pinned tabs stay, and the most recently visited copy stays.
- **Stash a window**: `Stash a window` in the For Later header asks which window to put aside — one window per gesture, never everything at once. The tabs in that window close and the set waits at the top of For Later with its tab count and age; `Restore` reopens it in a new window, and either action can be undone.
- **Sleep idle tabs** discards tabs you have not touched in 30 minutes to free memory. They keep their place and their titles, and come back the moment you click them. Settings can make this automatic after 1 or 4 hours idle. Tabs playing audio, pinned tabs, the active tab, and browser pages are skipped.
- **Reminders for For Later**: the clock button on any page offers Tonight, Tomorrow morning, Next Monday, or an exact date and time. When one comes due the row is highlighted, the toolbar badge counts what is waiting, and a system notification fires. Opening Tabloom clears the badge.
- **Compost prompt**: when pages have been sitting in For Later for over two weeks, a small compost card offers to move them to Saved, let them go, or ask again next week.
- **The little flower reacts**: the header bloom wilts gradually from 15 open tabs and closes fully at 30, then thanks you with one line of copy when For Later is emptied.
- Follow the system theme by default, with manual Light and Dark options.
- Choose between Off, Subtle, and Playful interaction sounds.
- Enjoy lightweight tactile animations — cards fold, restore and settle in place.
- Theme, sound, language, auto-sleep, and shortcuts live together in one Settings panel behind the gear button.
- Use the interface in English or Simplified Chinese — it follows the browser language by default and can be switched in Settings. The dashboard, right-click menu, and in-page confirmations all change together; webpage titles and summaries always stay in their original language.

## Maintainer Documentation

The following maintainer documents are currently written in Chinese:

- [Reusable browser extension product development SOP](docs/PLUGIN_DEVELOPMENT_SOP.md)
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
├── background.js          # Toolbar action, shortcuts, context menu, metadata, alarms
├── content-script.js      # Page metadata and in-page confirmation toast
├── i18n.js                # English / Chinese copy shared by every surface
├── dashboard.html         # Dashboard structure
├── dashboard.css          # Responsive layout and Light/Dark themes
├── dashboard.js           # Tab management, collections, and interactions
├── icons/                 # Toolbar and favicon PNGs (16/32/48/128)
├── docs/                  # SOP, product, design, technical, and maintenance docs
├── CHANGELOG.md           # Version history
└── README.md              # Project overview
```

## Privacy and Permissions

Tabloom is local-first and does not upload browsing data.

- `tabs` allows Tabloom to read tab titles and URLs, focus existing tabs, and close tabs.
- `storage` keeps For Later, Saved, stashed windows, theme, sound, language, auto-sleep, shortcut, and collapsed-section preferences in the browser's local storage. Temporary page metadata is cleared when a tab closes and swept again on browser start.
- `contextMenus` adds the Keep for later and Save items to the right-click menu.
- `sessions` lets Undo restore recently closed tabs with their back/forward history.
- `scripting` lets Tabloom show its confirmation on tabs that were already open before the extension was installed or reloaded.
- `alarms` schedules the periodic reminder check and the optional auto-sleep sweep.
- `notifications` shows a system notification when a For Later reminder comes due.
- `<all_urls>` allows Tabloom to read publicly available page metadata such as the title, favicon, site name, and description. It does not read form fields or upload page data.

Protected browser pages such as `chrome://settings` do not allow content scripts, so their summaries may fall back to URL information.

Undoing a closed tab restores it from the browser's recently closed list, including its history. If the browser no longer remembers it, Tabloom reopens the URL instead.

## Development

Tabloom uses native HTML, CSS, and JavaScript with Chrome Extension Manifest V3. It has no build step and no third-party runtime dependencies.

After changing the source files:

1. Open the browser's extensions page.
2. Click **Reload** on the Tabloom extension card.
3. Refresh the open Tabloom dashboard.
4. If `content-script.js` changed, refresh the ordinary webpages used for testing as well.
