# 📖 Readmd — Immersive Reader

> A browser extension that transforms any web article into a clean, distraction-free reading experience — with full annotation, highlighting, and export capabilities.

<p align="center">
  <img src="public/icons/icon128.png" alt="Readmd Logo" width="128" />
</p>

## ✨ Why Readmd?

web page as a page,is an important way for people to get informations.But we can`t to touch directly and change it by what we want to,so I made this to help to let reading more easy and comfortable.

Modern web pages are cluttered with ads, sidebars, navigation bars, and popups. Readmd strips all of that away and gives you a beautiful, customizable reading environment. But it doesn't stop at reading — **Readmd is also your digital notebook**. Highlight important passages, scribble notes in the margins, add text annotations, and export everything as a polished HTML or PDF file.

Think of it as **Readability + Notability**, right in your browser.

---

## 🚀 Features

### 📰 Smart Content Extraction

- Powered by Mozilla's [Readability](https://github.com/mozilla/readability) algorithm
- Automatically identifies and extracts the main article body
- Filters out navigation, ads, sidebars, and other clutter
- Falls back intelligently if auto-extraction fails

### 📖 Immersive Reading Mode

- Full-screen overlay with high `z-index` isolation — no CSS conflicts
- Code blocks get special treatment: visual separation, scrollable containers, proper dedentation
- SVG elements are automatically normalized and stabilized for consistent rendering
- Quick toggle: click the extension icon or use the popup controls

### 📐 Single / Dual Page Layout

- **Single page**: Classic scrolling, great for focused reading
- **Dual page**: Book-like two-column layout, ideal for wide screens
- Seamless layout switching without losing your reading position

### 🎨 10 Themes + Font Size Control

- **Light themes**: Light, Eye-care Yellow, Bean Green, Lavender Purple, Mist Gray, Ocean Blue
- **Dark themes**: Dark, Dark Purple, Dark Gray, Dark Blue
- Font size adjustable from 14px to 24px
- All preferences synced across devices via `chrome.storage.sync`

### 📍 Reading Progress Memory

- Automatically remembers where you left off — per URL
- Restores scroll position when you re-enter reading mode
- Works across both single and dual page layouts

### ✏️ Full Annotation Suite

This is where Readmd truly shines. The annotation engine operates in two modes:

#### DOM Highlight Mode

- Select any text in the reading view and apply fluorescent highlight colors
- 8 preset highlight colors with a floating color palette
- Click existing highlights to recolor or remove them
- Highlights survive undo/redo and are preserved in exports

#### Canvas Annotation Mode

When you need more than just highlights, Readmd captures a high-resolution snapshot of the content and lets you draw on top:

- **🖊️ Pen**: Freehand drawing with configurable color, size (S/M/L), and opacity
- **🧹 Eraser**: Remove strokes cleanly
- **💬 Text Notes**: Click anywhere to add editable text annotations (with edit ✏️ and delete × buttons)
- **🖍️ Highlighter**: Wide, translucent strokes for emphasis
- **🎨 Color Picker**: 8 preset colors + native OS color picker for custom colors
- **🖐️ Pan Mode**: Grab and drag to navigate large pages
- **↩️ Undo/Redo**: 50-step history, works across all tool types
- **🗑️ Clear All**: Reset everything in one click

### 📄 Export

Export your annotated reading as a self-contained file:

- **📄 Export HTML**: Annotations, highlights, text notes — all preserved in a standalone HTML file
- **📑 Export PDF**: Multi-page PDF with proper A4 pagination, annotations merged onto the content

---

## ⌨️ Keyboard Shortcuts

| Shortcut                         | Action                            |
| -------------------------------- | --------------------------------- |
| `A`                            | Switch to Pen tool                |
| `E`                            | Switch to Eraser tool             |
| `T`                            | Switch to Text tool               |
| `H`                            | Switch to Highlight tool          |
| `D`                            | Toggle Draw / Pan cursor          |
| `Esc`                          | Deactivate tool / exit annotation |
| `Ctrl+Z` / `⌘Z`             | Undo                              |
| `Ctrl+Y` / `⌘Y`             | Redo                              |
| `Ctrl+S` / `⌘S`             | Export HTML                       |
| `Ctrl+Shift+S` / `⌘Shift+S` | Export PDF                        |

---

## 📸 Screenshots

<!-- TODO: Add actual screenshots -->

<!--
1. Before/After: Original webpage vs Readmd reading mode
2. Canvas annotation mode with drawings and text notes
3. DOM highlight mode with floating color palette
4. Popup settings panel
5. Exported PDF with annotations
-->

---

## 🔧 Installation

### Chrome Web Store

> *(Coming soon)*

### Microsoft Edge Add-ons

> *(Coming soon)*

### Firefox Add-ons

> *(Coming soon)*

### Manual Installation (Developer Mode)

1. Clone this repository:

   ```bash
   git clone https://github.com/your-username/readmd.git
   cd readmd
   ```
2. Install dependencies:

   ```bash
   npm install
   ```
3. Build the extension:

   ```bash
   # For Chrome/Edge
   npm run build

   # For Firefox
   npm run build:firefox
   ```
4. Load in your browser:

   - **Chrome/Edge**: Go to `chrome://extensions/` → Enable "Developer mode" → Click "Load unpacked" → Select the `.output/chrome-mv3` folder
   - **Firefox**: Go to `about:debugging` → "This Firefox" → "Load Temporary Add-on" → Select any file in `.output/firefox-mv2`

---

## 🛠️ Development

```bash
# Start dev server with hot reload
npm run dev

# Start dev server for Firefox
npm run dev:firefox

# Build for production
npm run build

# Build for Firefox
npm run build:firefox

# Create zip for store submission
npm run zip
```

### Tech Stack

| Technology                                                   | Purpose                     |
| ------------------------------------------------------------ | --------------------------- |
| [WXT](https://wxt.dev/)                                       | Browser extension framework |
| [TypeScript](https://www.typescriptlang.org/)                 | Type-safe development       |
| [Mozilla Readability](https://github.com/mozilla/readability) | Content extraction          |
| [html2canvas](https://html2canvas.hertzen.com/)               | DOM → Canvas rendering     |
| [jsPDF](https://github.com/parallax/jsPDF)                    | PDF generation              |

### Project Structure

```
readmd/
├── components/
│   ├── annotate-engine.ts    # Full annotation system (pen, eraser, text, highlight, canvas)
│   ├── reader-mode.ts        # Content extraction, overlay, layout, themes, progress
│   └── storage.ts            # WXT storage wrappers for preferences & reading progress
├── entrypoints/
│   ├── background.ts         # Service worker: HTML & PDF export handlers
│   ├── content.ts            # Content script: bridges popup ↔ reader/annotation engines
│   └── popup/
│       ├── index.html         # Popup UI
│       ├── main.ts            # Popup logic
│       └── style.css          # Popup styles
├── styles/
│   ├── annotate.css           # Annotation toolbar & overlay styles
│   └── content.css            # Reading mode overlay styles
├── public/icons/              # Extension icons
├── wxt.config.ts              # WXT & manifest configuration
└── package.json
```

---

## 🔒 Privacy

Readmd is designed with privacy in mind:

- **No data collection**: No personal data is collected, stored, or transmitted
- **Local processing**: All content extraction, annotation, and export happens entirely in your browser
- **Local storage only**: Preferences are stored locally using browser storage APIs; reading progress is saved per-URL for your convenience
- **No account required**: No sign-up, no login, no tracking
- **No remote servers**: No article content is ever uploaded anywhere

See [PRIVACY_POLICY.md](PRIVACY_POLICY.md) for full details.

---

## 🗺️ Roadmap

- [ ] Image export (PNG, JPEG)
- [ ] Markdown export
- [ ] Annotation layer toggle (show/hide annotations)
- [ ] Multi-tab reading session management
- [ ] Custom CSS themes
- [ ] Reading time estimation
- [ ] Table of contents auto-generation
- [ ] Firefox official store release

---

## 📄 License

[MIT](LICENSE)

---

## 🙏 Acknowledgments

Readmd is built on the shoulders of these excellent open-source projects:

- [Mozilla Readability](https://github.com/mozilla/readability) — Content extraction engine
- [html2canvas](https://html2canvas.hertzen.com/) — DOM to Canvas rendering
- [jsPDF](https://github.com/parallax/jsPDF) — PDF generation
- [WXT](https://wxt.dev/) — Modern browser extension framework

---

<p align="center">
  <sub>Made with ❤️ for readers and note-takers everywhere.</sub>
</p>
