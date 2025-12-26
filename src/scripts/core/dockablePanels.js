/**
 * Dockable Panels - Convert existing static panels to dockable windows
 * 
 * This module creates dockable versions of:
 * - Layers Panel
 * - Image Properties Panel
 */

import { windowManager } from './windowManager.js'

// Panel references
let layersWindow = null
let imagePropertiesWindow = null

// Track if panels have been initialized
let panelsInitialized = false

/**
 * Initialize all dockable panels
 */
export function initDockablePanels() {
    if (panelsInitialized) return
    panelsInitialized = true
    
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupPanels)
    } else {
        setupPanels()
    }
}

function setupPanels() {
    // Move existing content into windows
    createLayersWindow()
    createImagePropertiesWindow()
    
    // Hide old static modules
    hideStaticPanels()
    
    // Update CSS for new layout
    updateLayoutStyles()
}

/**
 * Create the Layers window from existing content
 */
function createLayersWindow() {
    // Get existing layers content
    const existingLayersModule = document.querySelector('.layersModule')
    const existingMobileLayersContent = document.querySelector('#layersMenu .menuPanelContent')
    
    // Clone the content structure
    const content = document.createElement('div')
    content.className = 'layers-panel-content'
    content.innerHTML = `
        <div class="layers-props" id="windowCurrentLayerSelector">
            <!-- Layer properties populated dynamically -->
        </div>
        <div class="layers-list-container">
            <ul class="layers-list" id="windowLayersList">
                <!-- Layers list populated dynamically -->
            </ul>
        </div>
        <div class="layers-controls">
            <div class="layer-reorder-group">
                <button id="windowMoveLayerUp" type="button" title="Move layer up">▲</button>
                <button id="windowMoveLayerDown" type="button" title="Move layer down">▼</button>
            </div>
            <button id="windowDeleteLayer" class="delete-btn">Delete Layer</button>
        </div>
    `
    
    layersWindow = windowManager.createWindow({
        id: 'layers-panel',
        title: 'Layers',
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
            <polyline points="2 17 12 22 22 17"></polyline>
            <polyline points="2 12 12 17 22 12"></polyline>
        </svg>`,
        width: 280,
        height: 400,
        minWidth: 220,
        minHeight: 250,
        x: window.innerWidth - 300,
        y: 20,
        content,
        contentClass: 'no-padding',
        closable: true,
        onClose: () => {
            layersWindow = null
        },
        onCreate: (win) => {
            injectLayersPanelStyles()
            
            // Wire up button events - they'll be handled by layersHandler.js
            // We just need to sync with the existing system
            syncLayersWithWindow()
        }
    })
    
    return layersWindow
}

/**
 * Create the Image Properties window from existing content
 */
function createImagePropertiesWindow() {
    const content = document.createElement('div')
    content.className = 'image-props-content'
    content.innerHTML = `
        <div class="props-group">
            <label class="props-label">Name</label>
            <input class="props-input" type="text" id="windowImageNameInput" placeholder="Image name" autocomplete="off" spellcheck="false" />
        </div>
        <div class="props-group">
            <label class="props-label">Dimensions</label>
            <div class="props-dimensions">
                <input type="number" id="windowImageWidthInput" min="1" placeholder="W" />
                <span class="props-separator">×</span>
                <input type="number" id="windowImageHeightInput" min="1" placeholder="H" />
            </div>
            <div class="props-dim-actions">
                <button id="windowDoubleDimensions" title="Double dimensions">2×</button>
                <button id="windowHalveDimensions" title="Halve dimensions">½×</button>
                <button id="windowApplyDimensions" class="primary">Apply</button>
            </div>
            <label class="props-checkbox">
                <input type="checkbox" id="windowConstrainedCheckbox">
                <span>Lock aspect ratio</span>
            </label>
        </div>
        <div class="props-group">
            <label class="props-label">Format</label>
            <select id="windowImageExtensionSelector" class="props-select">
                <option value="png">PNG (.png)</option>
                <option value="jpeg">JPEG (.jpeg)</option>
                <option value="webp">WEBP (.webp)</option>
            </select>
        </div>
    `
    
    imagePropertiesWindow = windowManager.createWindow({
        id: 'image-props-panel',
        title: 'Image Properties',
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
            <circle cx="8.5" cy="8.5" r="1.5"></circle>
            <polyline points="21 15 16 10 5 21"></polyline>
        </svg>`,
        width: 260,
        height: 320,
        minWidth: 220,
        minHeight: 250,
        x: window.innerWidth - 300,
        y: 440,
        content,
        contentClass: 'no-padding',
        closable: true,
        onClose: () => {
            imagePropertiesWindow = null
        },
        onCreate: (win) => {
            injectImagePropsStyles()
            syncImagePropsWithWindow()
        }
    })
    
    return imagePropertiesWindow
}

/**
 * Sync layers window with existing layers handler
 */
function syncLayersWithWindow() {
    // Map window elements to existing element IDs expected by layersHandler
    const mappings = [
        ['windowCurrentLayerSelector', 'currentLayerSelector'],
        ['windowLayersList', 'layersList'],
        ['windowMoveLayerUp', 'moveLayerUp'],
        ['windowMoveLayerDown', 'moveLayerDown'],
        ['windowDeleteLayer', 'deleteLayer']
    ]
    
    mappings.forEach(([windowId, originalId]) => {
        const windowEl = document.getElementById(windowId)
        const originalEl = document.getElementById(originalId)
        
        if (windowEl && originalEl) {
            // Copy event listeners by replacing original with reference
            // The handlers look up by ID, so we need to update them
            // For now, add data attribute and we'll handle in the sync
            windowEl.dataset.syncWith = originalId
        }
    })
    
    // Setup mutation observer to sync content
    setupLayersSyncObserver()
}

/**
 * Sync image props window with existing inputs
 */
function syncImagePropsWithWindow() {
    const mappings = [
        ['windowImageNameInput', 'imageNameInput'],
        ['windowImageWidthInput', 'imageWidthInput'],
        ['windowImageHeightInput', 'imageHeightInput'],
        ['windowDoubleDimensions', 'doubleDimensions'],
        ['windowHalveDimensions', 'halveDimensions'],
        ['windowApplyDimensions', 'applyDimensions'],
        ['windowConstrainedCheckbox', 'constrainedCheckbox'],
        ['windowImageExtensionSelector', 'imageExtensionSelector']
    ]
    
    mappings.forEach(([windowId, originalId]) => {
        const windowEl = document.getElementById(windowId)
        const originalEl = document.getElementById(originalId)
        
        if (windowEl && originalEl) {
            // Sync values bidirectionally
            if (windowEl.tagName === 'INPUT' || windowEl.tagName === 'SELECT') {
                // Initial sync
                if (windowEl.type === 'checkbox') {
                    windowEl.checked = originalEl.checked
                } else {
                    windowEl.value = originalEl.value
                }
                
                // Window -> Original
                windowEl.addEventListener('input', () => {
                    if (windowEl.type === 'checkbox') {
                        originalEl.checked = windowEl.checked
                    } else {
                        originalEl.value = windowEl.value
                    }
                    originalEl.dispatchEvent(new Event('input', { bubbles: true }))
                })
                
                windowEl.addEventListener('change', () => {
                    if (windowEl.type === 'checkbox') {
                        originalEl.checked = windowEl.checked
                    } else {
                        originalEl.value = windowEl.value
                    }
                    originalEl.dispatchEvent(new Event('change', { bubbles: true }))
                })
                
                // Original -> Window (for programmatic updates)
                const observer = new MutationObserver(() => {
                    if (windowEl.type === 'checkbox') {
                        windowEl.checked = originalEl.checked
                    } else if (windowEl.value !== originalEl.value) {
                        windowEl.value = originalEl.value
                    }
                })
                observer.observe(originalEl, { attributes: true, attributeFilter: ['value'] })
                
                // Also listen for value changes
                originalEl.addEventListener('change', () => {
                    if (windowEl.type === 'checkbox') {
                        windowEl.checked = originalEl.checked
                    } else {
                        windowEl.value = originalEl.value
                    }
                })
            } else if (windowEl.tagName === 'BUTTON') {
                // Proxy button clicks
                windowEl.addEventListener('click', () => {
                    originalEl.click()
                })
            }
        }
    })
}

/**
 * Setup observer to sync layers list content
 */
function setupLayersSyncObserver() {
    const originalLayersList = document.getElementById('layersList')
    const windowLayersList = document.getElementById('windowLayersList')
    const originalLayerSelector = document.getElementById('currentLayerSelector')
    const windowLayerSelector = document.getElementById('windowCurrentLayerSelector')
    
    if (originalLayersList && windowLayersList) {
        // Initial sync
        windowLayersList.innerHTML = originalLayersList.innerHTML
        
        // Observe changes
        const observer = new MutationObserver(() => {
            windowLayersList.innerHTML = originalLayersList.innerHTML
            // Re-attach click handlers to window list items
            reattachLayerClickHandlers()
        })
        observer.observe(originalLayersList, { childList: true, subtree: true, characterData: true })
    }
    
    if (originalLayerSelector && windowLayerSelector) {
        // Initial sync
        windowLayerSelector.innerHTML = originalLayerSelector.innerHTML
        
        // Observe changes
        const observer = new MutationObserver(() => {
            windowLayerSelector.innerHTML = originalLayerSelector.innerHTML
            // Re-attach input handlers
            reattachLayerPropertyHandlers()
        })
        observer.observe(originalLayerSelector, { childList: true, subtree: true, characterData: true })
    }
}

/**
 * Re-attach click handlers to layer items in window
 */
function reattachLayerClickHandlers() {
    const windowLayersList = document.getElementById('windowLayersList')
    const originalLayersList = document.getElementById('layersList')
    
    if (!windowLayersList || !originalLayersList) return
    
    const windowItems = windowLayersList.querySelectorAll('.layerDiv')
    const originalItems = originalLayersList.querySelectorAll('.layerDiv')
    
    windowItems.forEach((item, index) => {
        if (originalItems[index]) {
            item.addEventListener('click', () => {
                originalItems[index].click()
            })
        }
    })
}

/**
 * Re-attach input handlers to layer properties in window
 */
function reattachLayerPropertyHandlers() {
    const windowLayerSelector = document.getElementById('windowCurrentLayerSelector')
    const originalLayerSelector = document.getElementById('currentLayerSelector')
    
    if (!windowLayerSelector || !originalLayerSelector) return
    
    // Find all inputs in window and sync with originals
    const windowInputs = windowLayerSelector.querySelectorAll('input, select')
    const originalInputs = originalLayerSelector.querySelectorAll('input, select')
    
    windowInputs.forEach((windowInput, index) => {
        if (originalInputs[index]) {
            const originalInput = originalInputs[index]
            
            windowInput.addEventListener('input', () => {
                originalInput.value = windowInput.value
                originalInput.dispatchEvent(new Event('input', { bubbles: true }))
            })
            
            windowInput.addEventListener('change', () => {
                originalInput.value = windowInput.value
                originalInput.dispatchEvent(new Event('change', { bubbles: true }))
            })
        }
    })
}

/**
 * Hide static panels that are now windows
 */
function hideStaticPanels() {
    const staticElements = [
        '.layersModule',
        '.contextModules'
    ]
    
    staticElements.forEach(selector => {
        const el = document.querySelector(selector)
        if (el) {
            el.style.display = 'none'
        }
    })
}

/**
 * Update main layout to be full canvas workspace
 */
function updateLayoutStyles() {
    const style = document.createElement('style')
    style.id = 'dockable-layout-styles'
    style.textContent = `
        /* Full canvas workspace */
        .mainContent {
            padding: 8px !important;
            padding-bottom: calc(var(--bottom-nav-height) + 8px + env(safe-area-inset-bottom, 0px)) !important;
        }
        
        .imageModule {
            flex: 1;
            gap: 0;
        }
        
        .imageViewingModule {
            flex: 1;
            min-height: 0;
            border-radius: var(--radius-md);
        }
        
        /* Hide old static panels */
        .layersModule,
        .contextModules {
            display: none !important;
        }
        
        /* Ensure canvas fills space */
        #imageCanvasDiv {
            width: 100%;
            height: 100%;
        }
    `
    document.head.appendChild(style)
}

/**
 * Inject styles for layers panel
 */
function injectLayersPanelStyles() {
    if (document.getElementById('layers-panel-styles')) return
    
    const style = document.createElement('style')
    style.id = 'layers-panel-styles'
    style.textContent = `
        .layers-panel-content {
            display: flex;
            flex-direction: column;
            height: 100%;
            padding: 10px;
            gap: 10px;
        }
        
        .layers-props {
            min-height: 80px;
            max-height: 150px;
            overflow-y: auto;
            padding: 10px;
            background: var(--bg-tertiary, #334155);
            border-radius: 6px;
            font-size: 12px;
        }
        
        .layers-props:empty::before {
            content: 'Select a layer to edit properties';
            color: var(--text-tertiary, #64748b);
            font-style: italic;
        }
        
        .layers-props label {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
            color: var(--text-secondary, #94a3b8);
        }
        
        .layers-props input[type="range"] {
            width: 120px;
        }
        
        .layers-props input[type="number"] {
            width: 60px;
            padding: 4px 6px;
            background: var(--bg-secondary, #1e293b);
            border: 1px solid var(--border, rgba(255,255,255,0.1));
            border-radius: 4px;
            color: var(--text-primary, #f1f5f9);
            font-size: 12px;
        }
        
        .layers-props input[type="color"] {
            width: 40px;
            height: 24px;
            padding: 2px;
            border: 1px solid var(--border);
            border-radius: 4px;
            cursor: pointer;
        }
        
        .layers-list-container {
            flex: 1;
            overflow-y: auto;
            background: var(--bg-tertiary, #334155);
            border-radius: 6px;
            padding: 6px;
        }
        
        .layers-list {
            list-style: none;
            margin: 0;
            padding: 0;
        }
        
        .layers-list .layerDiv {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 10px 12px;
            margin-bottom: 4px;
            background: var(--bg-secondary, #1e293b);
            border: 1px solid transparent;
            border-radius: 4px;
            cursor: pointer;
            transition: all 0.15s ease;
            font-size: 13px;
            color: var(--text-primary, #f1f5f9);
        }
        
        .layers-list .layerDiv:hover {
            background: var(--bg-primary, #0f172a);
        }
        
        .layers-list .layerDiv.selectedLayerDiv,
        .layers-list .selectedLayerDiv {
            border-color: var(--accent, #6366f1);
            background: rgba(99, 102, 241, 0.15);
        }
        
        .layers-controls {
            display: flex;
            gap: 8px;
            align-items: center;
        }
        
        .layer-reorder-group {
            display: flex;
            gap: 4px;
        }
        
        .layer-reorder-group button {
            width: 32px;
            height: 32px;
            background: var(--bg-tertiary, #334155);
            border: 1px solid var(--border, rgba(255,255,255,0.1));
            border-radius: 4px;
            color: var(--text-primary, #f1f5f9);
            cursor: pointer;
            font-size: 12px;
            transition: all 0.15s ease;
        }
        
        .layer-reorder-group button:hover {
            background: var(--accent, #6366f1);
            border-color: var(--accent);
        }
        
        .layers-controls .delete-btn {
            flex: 1;
            padding: 8px 12px;
            background: rgba(239, 68, 68, 0.15);
            border: 1px solid rgba(239, 68, 68, 0.3);
            border-radius: 4px;
            color: #ef4444;
            cursor: pointer;
            font-size: 12px;
            font-weight: 500;
            transition: all 0.15s ease;
        }
        
        .layers-controls .delete-btn:hover {
            background: rgba(239, 68, 68, 0.25);
            border-color: #ef4444;
        }
    `
    document.head.appendChild(style)
}

/**
 * Inject styles for image properties panel
 */
function injectImagePropsStyles() {
    if (document.getElementById('image-props-styles')) return
    
    const style = document.createElement('style')
    style.id = 'image-props-styles'
    style.textContent = `
        .image-props-content {
            padding: 12px;
            display: flex;
            flex-direction: column;
            gap: 14px;
        }
        
        .props-group {
            display: flex;
            flex-direction: column;
            gap: 6px;
        }
        
        .props-label {
            font-size: 11px;
            font-weight: 600;
            color: var(--text-tertiary, #64748b);
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        
        .props-input,
        .props-select {
            width: 100%;
            padding: 8px 10px;
            background: var(--bg-tertiary, #334155);
            border: 1px solid var(--border, rgba(255,255,255,0.1));
            border-radius: 6px;
            color: var(--text-primary, #f1f5f9);
            font-size: 13px;
            transition: border-color 0.15s ease;
        }
        
        .props-input:focus,
        .props-select:focus {
            outline: none;
            border-color: var(--accent, #6366f1);
        }
        
        .props-dimensions {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        .props-dimensions input {
            flex: 1;
            padding: 8px 10px;
            background: var(--bg-tertiary, #334155);
            border: 1px solid var(--border, rgba(255,255,255,0.1));
            border-radius: 6px;
            color: var(--text-primary, #f1f5f9);
            font-size: 13px;
            text-align: center;
        }
        
        .props-dimensions input:focus {
            outline: none;
            border-color: var(--accent, #6366f1);
        }
        
        .props-separator {
            color: var(--text-tertiary, #64748b);
            font-weight: 500;
        }
        
        .props-dim-actions {
            display: flex;
            gap: 6px;
            margin-top: 4px;
        }
        
        .props-dim-actions button {
            flex: 1;
            padding: 6px 10px;
            background: var(--bg-tertiary, #334155);
            border: 1px solid var(--border, rgba(255,255,255,0.1));
            border-radius: 4px;
            color: var(--text-primary, #f1f5f9);
            font-size: 12px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.15s ease;
        }
        
        .props-dim-actions button:hover {
            background: var(--bg-primary, #0f172a);
        }
        
        .props-dim-actions button.primary {
            background: var(--accent, #6366f1);
            border-color: var(--accent);
        }
        
        .props-dim-actions button.primary:hover {
            background: var(--accent-hover, #4f46e5);
        }
        
        .props-checkbox {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-top: 4px;
            font-size: 12px;
            color: var(--text-secondary, #94a3b8);
            cursor: pointer;
        }
        
        .props-checkbox input {
            width: 16px;
            height: 16px;
            accent-color: var(--accent, #6366f1);
        }
        
        .props-select {
            appearance: none;
            background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%2394a3b8' d='M6 8L1 3h10z'/%3E%3C/svg%3E");
            background-repeat: no-repeat;
            background-position: right 10px center;
            padding-right: 30px;
            cursor: pointer;
        }
    `
    document.head.appendChild(style)
}

/**
 * Get layers window instance
 */
export function getLayersWindow() {
    return layersWindow
}

/**
 * Get image properties window instance
 */
export function getImagePropertiesWindow() {
    return imagePropertiesWindow
}

/**
 * Toggle layers window visibility
 */
export function toggleLayersWindow() {
    if (!layersWindow) return
    
    if (layersWindow.isVisible()) {
        layersWindow.minimize()
    } else {
        layersWindow.restore()
        layersWindow.focus()
    }
}

/**
 * Toggle image properties window visibility
 */
export function toggleImagePropertiesWindow() {
    if (!imagePropertiesWindow) return
    
    if (imagePropertiesWindow.isVisible()) {
        imagePropertiesWindow.minimize()
    } else {
        imagePropertiesWindow.restore()
        imagePropertiesWindow.focus()
    }
}
