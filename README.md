# StoryMap

A mobile-first web app for tracking book characters and their relationships while reading. Runs entirely in the browser — no accounts, no backend calls, no internet required after the first load.

## Features

- **Bookshelf** — manage multiple books, each with its own cast of characters
- **Character cards** — name, alias, role, color tag, description, and notes per character
- **Relationships** — labeled, directional links between characters (one-way or mutual)
- **Mind map** — force-directed, pannable, zoomable canvas showing every character and connection at a glance; nodes are draggable
- **Export / Import** — save any book or individual character as a portable `.storymap.json` file and reload it later or on another device
- **Light and dark mode** — follows system preference with a manual toggle always visible
- **Offline-capable** — all data is also cached in `localStorage` so the UI works even if the server is unreachable

## Getting Started

Requires [Node.js](https://nodejs.org/) 16 or later (no npm packages to install).

```bash
cd StoryMap
npm start
```

Then open **http://localhost:3000** in your browser.

To use a different port:

```bash
PORT=8080 npm start
```

## Data Storage

All data is written to `storymap-data.json` in the project directory. The file is created automatically on first run. It is plain JSON and human-readable — you can back it up, copy it between machines, or inspect it directly.

The app also mirrors data in `localStorage` as an instant-load cache. If the server is stopped, the UI continues to work from that cache and will sync back to disk the next time the server is running.

## Export / Import

**Book export** — each book card has an export button that downloads `<title>.storymap.json` containing the book, all its characters, and all its relationships.

**Character export** — the Character Detail screen has an "Export Character" button that downloads `<name>.storymap-character.json` with that character and their relationships.

**Import** — the Bookshelf has an "Import Book" button that accepts either export format. Imported data always gets fresh IDs so it never collides with existing entries.

## Project Structure

```
StoryMap/
├── index.html          # App shell (minimal)
├── style.css           # All styles; theming via CSS custom properties
├── app.js              # All application logic (~1600 lines)
├── server.js           # Tiny Node HTTP server (no dependencies)
├── package.json
└── storymap-data.json  # Live data file (auto-created)
```

No build step, no bundler, no npm dependencies.

## Mind Map Controls

| Action | How |
|---|---|
| Pan | Touch-drag (one finger) or click-drag |
| Zoom | Pinch (mobile) or scroll wheel |
| Move a node | Tap and drag the circle |
| Open a character | Tap a node (without dragging) |

## Design

Warm and literary — serif fonts for titles and names, aged-gold accents, off-white / deep-navy palette. Designed for comfortable one-handed mobile use with large touch targets throughout.
