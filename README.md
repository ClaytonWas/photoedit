# PhotoEdit

**A professional-grade, browser-based photo editor built with vanilla JavaScript and modern web APIs.**

[Live Demo](https://photoedit.ca)

![Demo](./public/images/gif2.gif)

---

## Examples

| HSV Hue Rotation | Contrast Animation | Editor Interface |
|:---:|:---:|:---:|
| ![Hue Animation](https://www.wasmund.ca/images/hero_gifs/IMG_9466_hue.gif) | ![Contrast Animation](https://www.wasmund.ca/images/hero_gifs/IMG_8840_contrast.gif) | ![Editor](https://www.wasmund.ca/images/projects/WebAppPhotoEdits3.jpeg) |

---

## Overview

PhotoEdit is a full-featured image manipulation application that runs entirely in the browser. It demonstrates advanced front-end architecture patterns including a non-destructive layer system, Web Worker rendering pipeline, and a custom windowing system with dockable panels.

---

## Key Features

### Image Editing
- **Non-destructive Layer System** — Stack multiple effects with adjustable opacity and blend modes
- **Undo/Redo History** — Full state management with configurable history depth
- **Real-time Preview** — Optimized rendering with progressive quality refinement

### Effects & Filters
- HSV Adjustment (Hue, Saturation, Value)
- Film Effects & Color Grading
- Greyscale, Sepia, and custom color palettes
- Painted Stylization with configurable brush parameters
- Edge Detection (Sobel, Prewitt) with directional coloring

### Analysis Tools
- **Live Histogram** — Real-time RGB and luminance channel visualization using Chart.js
- **Image Statistics** — Color distribution and metadata display
- **Color Info Panel** — Pixel-level color inspection

### GIF Support
- Create animated GIFs from effect automation
- Load and decompose existing GIFs into editable frame stacks
- Export edited frames back to GIF format

### User Interface
- **Custom Window Manager** — Draggable, resizable, tabbed windows with z-index management
- **Dockable Panels** — Snap-to-edge docking with visual previews
- **Responsive Design** — Mobile-optimized slide-up panels for smaller screens
- Desktop menu bar with keyboard shortcuts (Ctrl+O, Ctrl+S, Ctrl+Z/Y)

---

## Technical Highlights

| Area | Implementation |
|------|----------------|
| **Rendering** | Web Workers for off-main-thread image processing |
| **State Management** | Immutable snapshots with cursor-based undo/redo |
| **Architecture** | Plugin system for extensible effects |
| **Performance** | Progressive rendering, debounced updates, bitmap caching |
| **Build Tool** | Vite for fast HMR and optimized production builds |

---

## Tech Stack

- **Core:** Vanilla JavaScript (ES Modules)
- **Build:** Vite
- **Canvas:** HTML5 Canvas API, ImageData manipulation
- **Charts:** Chart.js for histogram visualization
- **GIF:** gif.js with Web Worker encoding
- **Fonts:** Inter, IBM Plex Mono

---

## Getting Started

```bash
# Install dependencies (Node v20+)
npm ci

# Start development server
npm run dev

# Build for production
npm run build
```

---

## Architecture

```
src/
├── scripts/
│   ├── core/
│   │   ├── imageEditor.js    # Main editor class
│   │   ├── layers.js         # Layer management
│   │   ├── history.js        # Undo/redo state
│   │   ├── windowManager.js  # Custom windowing system
│   │   └── dockablePanels.js # Panel docking logic
│   ├── plugins/              # Modular image effects
│   │   ├── histogram.js
│   │   ├── hsvAdjustment.js
│   │   ├── filmEffects.js
│   │   ├── paintedStylization.js
│   │   └── gifAnimator.js
│   └── workers/
│       └── renderWorker.js   # Off-thread rendering
└── styles/
    └── styles.css
```

---

## License

MIT
