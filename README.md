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
- **Undo/Redo History** — Snapshots share the base image by reference, so undo is instant
- **Off-thread Rendering** — Full-quality compositing runs in a Web Worker, so dragging a
  slider never blocks the UI; a quarter-scale preview keeps feedback immediate
- **Crop Tool** — Live adjustable selection with handles, aspect presets, rule-of-thirds
  guides, keyboard nudge/commit, and full mouse, pen and touch support

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
- **GIF Studio** — One window for the whole workflow: frame timeline with playback and
  scrubbing, reordering, retiming, and multi-select
- Bake the current layer stack into selected frames or all of them in a single pass
- Animate any number of layer parameters at once into a new frame sequence
- Export with quality, dithering and loop-count control, previewed in-app before download
- Hand-written GIF decoder with correct disposal, delay and loop-count semantics

### User Interface
- **Custom Window Manager** — Draggable, resizable, tabbed windows with z-index management
- **Dockable Panels** — Snap-to-edge docking with visual previews
- **Responsive Design** — Mobile-optimized slide-up panels for smaller screens
- Desktop menu bar with keyboard shortcuts (Ctrl+O, Ctrl+S, Ctrl+Z/Y)

---

## Technical Highlights

| Area | Implementation |
|------|----------------|
| **Rendering** | Layer compositing in a Web Worker over transferable buffers; the same pure module runs inline as a fallback |
| **State Management** | Snapshot stack with structural sharing of the base image |
| **Architecture** | Plugin effects resolved through a registry, so they can cross the worker boundary |
| **Performance** | Scale-bounded statistical sampling for analysis panels; reused scratch buffers; coalesced render requests |
| **Input** | Pointer Events throughout, so mouse, pen and touch share one path |
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
│   │   ├── imageEditor.js     # Main editor class: base image, render scheduling, history
│   │   ├── layers.js          # Layer model and stack
│   │   ├── composite.js       # Pure layer compositing — shared by main thread and worker
│   │   ├── effectRegistry.js  # Effect function <-> stable id, by function identity
│   │   ├── renderService.js   # Worker client: request coalescing, inline fallback
│   │   ├── viewport.js        # Pan/zoom state and image <-> screen mapping
│   │   ├── imageSampler.js    # Bounded point-sampling for the analysis panels
│   │   ├── history.js         # Undo/redo state
│   │   ├── windowManager.js   # Custom windowing system
│   │   └── dockablePanels.js  # Panel docking logic
│   ├── tools/
│   │   └── cropTool.js        # Interactive crop overlay
│   ├── gif/
│   │   └── gifStudio.js       # Frame timeline, animation authoring, export
│   ├── plugins/               # Modular image effects and analysis panels
│   │   ├── histogram.js
│   │   ├── hsvAdjustment.js
│   │   ├── filmEffects.js
│   │   ├── paintedStylization.js
│   │   └── gifAnimator.js     # GIF decode, frame stack, encode, playback
│   └── workers/
│       └── renderWorker.js    # Off-thread layer compositing
└── styles/
    └── styles.css
```

### Rendering pipeline

Effects are pure functions over `ImageData`. `composite.js` applies a stack of them with
no DOM access at all, which is what lets the identical code run on the main thread and
inside the render worker — the worker resolves effects from `effectRegistry.js` by id,
since functions cannot cross a `postMessage` boundary.

`renderService.js` keeps the worker's copy of the base image in sync, so an interactive
render sends only the layer descriptors, and results come back as transferable buffers.
If workers are unavailable, or a layer uses an effect that is not in the registry, the
editor composites inline instead — output is identical either way.

---

## License

MIT
