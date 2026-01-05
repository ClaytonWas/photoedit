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
 * Check if we're on a mobile device
 * More conservative check - only trigger for truly mobile contexts
 */
function isMobile() {
    const mobileBreakpoint = 768
    const isNarrow = window.innerWidth <= mobileBreakpoint
    
    // Only consider mobile UA if also narrow
    const mobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
    const isMobileDevice = mobileUA && window.innerWidth <= 1024
    
    // Must be narrow screen to be considered mobile
    // Touch capability alone shouldn't trigger mobile mode (VS Code webview has touch)
    return isNarrow || isMobileDevice
}

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
    // Hide old static modules
    hideStaticPanels()
    
    // Update CSS for new layout
    updateLayoutStyles()
    
    // Create windows - windowManager handles mobile vs desktop automatically
    createLayersWindow()
    createImagePropertiesWindow()
    
    // On desktop, merge into a tab group and dock
    if (!isMobile()) {
        setupDefaultDockedLayout()
    }
}

/**
 * Set up the default docked layout for desktop
 * Merges Layers and Image Properties into a tabbed panel docked to the right
 * taking 25% of viewport height
 */
function setupDefaultDockedLayout() {
    if (!layersWindow || !imagePropertiesWindow) return
    
    // Wait a short moment for windows to be fully created
    requestAnimationFrame(() => {
        // Merge Image Properties into Layers as a tab group
        windowManager.mergeIntoTabGroup(imagePropertiesWindow.id, layersWindow.id)
        
        // Get the tab group ID from the window's state
        const win = windowManager.windows.get(layersWindow.id)
        if (!win || !win.state.tabGroupId) return
        
        const tabGroup = windowManager.tabGroups.get(win.state.tabGroupId)
        if (!tabGroup) return
        
        // Calculate position: 25% viewport width on the right side, full height
        // On desktop (1024px+), we have a top menu bar (32px) and no bottom taskbar
        const isDesktop = window.innerWidth >= 1024
        const topMenuHeight = isDesktop ? 32 : 0
        const bottomNavHeight = isDesktop ? 0 : parseInt(getComputedStyle(document.documentElement).getPropertyValue('--bottom-nav-height') || '60')
        // Account for safe area inset at bottom (for mobile devices with notches)
        const safeAreaBottom = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--safe-area-inset-bottom') || '0') || 0
        const screenWidth = window.innerWidth
        const availableHeight = window.innerHeight - topMenuHeight - bottomNavHeight - safeAreaBottom
        
        // 25% of viewport width for the panel
        const panelWidth = Math.max(280, screenWidth * 0.25)
        
        // Position to the right side, full height (with gap from taskbar)
        const dockStyle = {
            x: screenWidth - panelWidth,
            y: topMenuHeight,
            width: panelWidth,
            height: availableHeight
        }
        
        // Apply the position/size
        tabGroup.element.style.left = `${dockStyle.x}px`
        tabGroup.element.style.top = `${dockStyle.y}px`
        tabGroup.element.style.width = `${dockStyle.width}px`
        tabGroup.element.style.height = `${dockStyle.height}px`
        
        // Update state
        tabGroup.state.x = dockStyle.x
        tabGroup.state.y = dockStyle.y
        tabGroup.state.width = dockStyle.width
        tabGroup.state.height = dockStyle.height
        tabGroup.state.docked = 'right-25'
        
        // Save pre-dock state for undocking later
        tabGroup.state.preDockState = {
            x: layersWindow.state.x,
            y: layersWindow.state.y,
            width: layersWindow.state.width,
            height: layersWindow.state.height
        }
        
        tabGroup.element.classList.add('wm-docked')
    })
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
        <div class="layers-section layers-props-section" data-section="props">
            <div class="layers-section-header">
                <span class="layers-section-title">Parameters</span>
                <button class="layers-section-collapse" title="Collapse">−</button>
            </div>
            <div class="layers-section-content">
                <div class="layers-props" id="windowCurrentLayerSelector">
                    <!-- Layer properties populated dynamically -->
                </div>
            </div>
        </div>
        <div class="layers-resize-divider" title="Drag to resize"></div>
        <div class="layers-section layers-list-section" data-section="layers">
            <div class="layers-section-header">
                <span class="layers-section-title">Layers</span>
                <button class="layers-section-collapse" title="Collapse">−</button>
            </div>
            <div class="layers-section-content">
                <div class="layers-list-container">
                    <ul class="layers-list" id="windowLayersList">
                        <!-- Layers list populated dynamically -->
                    </ul>
                </div>
            </div>
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
        autoFocus: !isMobile(),
        onClose: () => {
            layersWindow = null
        },
        onCreate: (win) => {
            injectLayersPanelStyles()
            
            // Wire up button events - they'll be handled by layersHandler.js
            // We just need to sync with the existing system
            syncLayersWithWindow()
            
            // Setup section collapse and drag reorder
            setupLayersSectionBehavior(win.getContentElement())
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
        autoFocus: !isMobile(),
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
    
    // Wire up button clicks to proxy to original buttons
    const buttonMappings = [
        ['windowMoveLayerUp', 'moveLayerUp'],
        ['windowMoveLayerDown', 'moveLayerDown'],
        ['windowDeleteLayer', 'deleteLayer']
    ]
    
    buttonMappings.forEach(([windowId, originalId]) => {
        const windowBtn = document.getElementById(windowId)
        const originalBtn = document.getElementById(originalId)
        
        if (windowBtn && originalBtn) {
            windowBtn.addEventListener('click', () => {
                originalBtn.click()
            })
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
/**
 * Setup section collapse and drag-to-reorder behavior
 */
function setupLayersSectionBehavior(container) {
    const sections = container.querySelectorAll('.layers-section')
    const divider = container.querySelector('.layers-resize-divider')
    const propsSection = container.querySelector('.layers-props-section')
    const listSection = container.querySelector('.layers-list-section')
    
    // Setup collapse buttons
    sections.forEach(section => {
        const collapseBtn = section.querySelector('.layers-section-collapse')
        const content = section.querySelector('.layers-section-content')
        
        if (collapseBtn && content) {
            // Remove any existing listeners by cloning
            const newBtn = collapseBtn.cloneNode(true)
            collapseBtn.parentNode.replaceChild(newBtn, collapseBtn)
            
            newBtn.addEventListener('click', (e) => {
                e.preventDefault()
                e.stopPropagation()
                
                const isCollapsed = section.classList.toggle('collapsed')
                newBtn.textContent = isCollapsed ? '+' : '−'
                
                // Reset inline height when collapsing/expanding
                if (!isCollapsed) {
                    section.style.height = ''
                    section.style.flex = ''
                }
                
                // When collapsed, hide divider if both sections are collapsed
                if (divider) {
                    const bothCollapsed = Array.from(sections).every(s => s.classList.contains('collapsed'))
                    divider.style.display = bothCollapsed ? 'none' : ''
                }
            })
        }
    })
    
    // Setup resizable divider
    if (divider && propsSection && listSection) {
        let isResizing = false
        let startY = 0
        let startPropsHeight = 0
        let startListHeight = 0
        
        const onStart = (e) => {
            isResizing = true
            startY = e.touches ? e.touches[0].clientY : e.clientY
            startPropsHeight = propsSection.offsetHeight
            startListHeight = listSection.offsetHeight
            
            // Disable transitions during resize for instant response
            container.classList.add('resizing')
            divider.classList.add('active')
            document.body.style.cursor = 'row-resize'
            document.body.style.userSelect = 'none'
            
            e.preventDefault()
        }
        
        const onMove = (e) => {
            if (!isResizing) return
            
            const clientY = e.touches ? e.touches[0].clientY : e.clientY
            const deltaY = clientY - startY
            
            // Calculate new heights
            let newPropsHeight = startPropsHeight + deltaY
            let newListHeight = startListHeight - deltaY
            
            // Minimum heights
            const minHeight = 50
            
            // Clamp to minimums
            if (newPropsHeight < minHeight) {
                newPropsHeight = minHeight
                newListHeight = startPropsHeight + startListHeight - minHeight
            }
            if (newListHeight < minHeight) {
                newListHeight = minHeight
                newPropsHeight = startPropsHeight + startListHeight - minHeight
            }
            
            // Apply heights directly - no flex, just height for instant response
            propsSection.style.height = newPropsHeight + 'px'
            propsSection.style.flex = 'none'
            listSection.style.height = newListHeight + 'px'
            listSection.style.flex = 'none'
        }
        
        const onEnd = () => {
            if (!isResizing) return
            isResizing = false
            
            container.classList.remove('resizing')
            divider.classList.remove('active')
            document.body.style.cursor = ''
            document.body.style.userSelect = ''
        }
        
        // Mouse events
        divider.addEventListener('mousedown', onStart)
        document.addEventListener('mousemove', onMove)
        document.addEventListener('mouseup', onEnd)
        
        // Touch events
        divider.addEventListener('touchstart', onStart, { passive: false })
        document.addEventListener('touchmove', onMove, { passive: false })
        document.addEventListener('touchend', onEnd)
    }
}

function setupLayersSyncObserver() {
    const originalLayersList = document.getElementById('layersList')
    const windowLayersList = document.getElementById('windowLayersList')
    const originalLayerSelector = document.getElementById('currentLayerSelector')
    const windowLayerSelector = document.getElementById('windowCurrentLayerSelector')
    
    if (originalLayersList && windowLayersList) {
        // Initial sync
        windowLayersList.innerHTML = originalLayersList.innerHTML
        reattachLayerClickHandlers()
        
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
        reattachLayerPropertyHandlers()
        
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
            // Clone to remove old listeners
            const newItem = item.cloneNode(true)
            item.parentNode.replaceChild(newItem, item)
            
            // Handle layer selection click
            newItem.addEventListener('click', (e) => {
                // Don't trigger selection if clicking on checkbox
                if (e.target.type === 'checkbox') return
                originalItems[index].click()
            })
            
            // Handle visibility checkbox
            const windowCheckbox = newItem.querySelector('.layerDivToggleVisability')
            const originalCheckbox = originalItems[index].querySelector('.layerDivToggleVisability')
            
            if (windowCheckbox && originalCheckbox) {
                // Sync the checked state from original
                windowCheckbox.checked = originalCheckbox.checked
                
                windowCheckbox.addEventListener('click', (e) => {
                    e.stopPropagation()
                    originalCheckbox.checked = windowCheckbox.checked
                    originalCheckbox.click()
                })
            }
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
            
            // Clone the input to remove any old listeners
            const newWindowInput = windowInput.cloneNode(true)
            windowInput.parentNode.replaceChild(newWindowInput, windowInput)
            
            // Sync initial value
            if (newWindowInput.type === 'checkbox') {
                newWindowInput.checked = originalInput.checked
            } else {
                // Handles range, number, color, text, select, etc.
                newWindowInput.value = originalInput.value
            }
            
            // Forward input events to original (for live updates while dragging sliders)
            newWindowInput.addEventListener('input', (e) => {
                e.stopPropagation()
                if (newWindowInput.type === 'checkbox') {
                    originalInput.checked = newWindowInput.checked
                } else {
                    originalInput.value = newWindowInput.value
                }
                originalInput.dispatchEvent(new Event('input', { bubbles: true }))
            })
            
            // Forward change events to original (for final values / snapshots)
            newWindowInput.addEventListener('change', (e) => {
                e.stopPropagation()
                if (newWindowInput.type === 'checkbox') {
                    originalInput.checked = newWindowInput.checked
                } else {
                    originalInput.value = newWindowInput.value
                }
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
    // Remove existing styles to ensure updates are applied
    const existingStyle = document.getElementById('layers-panel-styles')
    if (existingStyle) existingStyle.remove()
    
    const style = document.createElement('style')
    style.id = 'layers-panel-styles'
    style.textContent = `
        .layers-panel-content {
            display: flex;
            flex-direction: column;
            height: 100%;
            min-height: 0;
            padding: 8px;
            gap: 8px;
            overflow: hidden;
        }
        
        /* Section styling for collapsible sections */
        .layers-section {
            background: var(--bg-tertiary, #f1f5f9);
            border-radius: 8px;
            overflow: hidden;
            border: 1px solid var(--border, rgba(0,0,0,0.06));
        }
        
        .layers-panel-content:not(.resizing) .layers-section {
            transition: flex 0.15s ease;
        }
        
        .layers-section-header {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 10px;
            background: var(--bg-secondary, #ffffff);
            cursor: default;
            user-select: none;
            position: relative;
            z-index: 1;
            border-bottom: 1px solid var(--border, rgba(0,0,0,0.06));
        }
        
        .layers-section-title {
            flex: 1;
            font-size: 10px;
            font-weight: 600;
            color: var(--text-tertiary, #94a3b8);
            text-transform: uppercase;
            letter-spacing: 0.06em;
        }
        
        .layers-section-collapse {
            width: 20px;
            height: 20px;
            background: var(--bg-primary, #f8fafc);
            border: 1px solid var(--border, rgba(0,0,0,0.08));
            color: var(--text-tertiary, #94a3b8);
            font-size: 12px;
            font-weight: bold;
            cursor: pointer;
            border-radius: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.15s ease;
            flex-shrink: 0;
            position: relative;
            z-index: 2;
        }
        
        .layers-section-collapse:hover {
            background: var(--bg-tertiary, #f1f5f9);
            border-color: var(--border-strong, rgba(0,0,0,0.12));
            color: var(--text-secondary, #475569);
        }
        
        .layers-section-collapse:active {
            background: var(--accent-soft, rgba(37,99,235,0.08));
            border-color: var(--accent, #2563eb);
            color: var(--accent, #2563eb);
        }
        
        .layers-section-content {
            overflow: hidden;
        }
        
        .layers-section.collapsed .layers-section-content {
            display: none;
            height: 0;
            padding: 0;
            margin: 0;
        }
        
        .layers-section.collapsed {
            flex: 0 0 auto !important;
            height: auto !important;
        }
        
        .layers-section.collapsed .layers-section-header {
            border-radius: 8px;
            border-bottom: none;
        }
        
        .layers-props-section {
            flex: 1 1 0;
            min-height: 40px;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }
        
        .layers-props-section .layers-section-content {
            flex: 1;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            min-height: 0;
        }
        
        .layers-list-section {
            flex: 1 1 0;
            display: flex;
            flex-direction: column;
            min-height: 40px;
            overflow: hidden;
        }
        
        .layers-list-section .layers-section-content {
            flex: 1;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            min-height: 0;
        }
        
        /* Resize divider between sections - desktop only */
        .layers-resize-divider {
            height: 6px;
            background: transparent;
            cursor: row-resize;
            position: relative;
            flex-shrink: 0;
            margin: 2px 0;
        }
        
        /* Hide divider on mobile panels */
        .wm-mobile-panel .layers-resize-divider {
            display: none;
        }
        
        /* Mobile panel: ensure layers-panel-content fills container */
        .wm-mobile-panel .layers-panel-content {
            height: 100%;
            max-height: 100%;
            min-height: 0;
            overflow: hidden;
        }
        
        /* On mobile, make each section share available space */
        .wm-mobile-panel .layers-props-section,
        .wm-mobile-panel .layers-list-section {
            flex: 1 1 0;
            height: auto !important;
            min-height: 80px;
            max-height: 50%;
            overflow: hidden;
        }
        
        .wm-mobile-panel .layers-props {
            max-height: none;
            min-height: auto;
            flex: 1;
            overflow-y: auto;
        }
        
        .wm-mobile-panel .layers-list-container {
            flex: 1;
            overflow-y: auto;
        }
        
        .wm-mobile-panel .layers-section-content {
            flex: 1;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            min-height: 0;
        }
        
        /* Ensure controls stay at bottom on mobile */
        .wm-mobile-panel .layers-controls {
            flex-shrink: 0;
            margin-top: auto;
        }
        
        .layers-resize-divider::before {
            content: '';
            position: absolute;
            left: 50%;
            top: 50%;
            transform: translate(-50%, -50%);
            width: 32px;
            height: 3px;
            background: var(--border-strong, rgba(0,0,0,0.12));
            border-radius: 2px;
            transition: all 0.15s ease;
        }
        
        .layers-resize-divider:hover::before,
        .layers-resize-divider.active::before {
            background: var(--accent, #2563eb);
            width: 48px;
        }
        
        .layers-resize-divider.active {
            background: var(--accent-soft, rgba(37,99,235,0.08));
        }
        
        .layers-list-section .layers-section-content {
            flex: 1;
            overflow: hidden;
            display: flex;
            flex-direction: column;
        }
        
        .layers-props {
            flex: 1;
            min-height: 0;
            overflow-y: auto;
            overflow-x: hidden;
            padding: 8px;
            font-size: 12px;
        }
        
        .layers-props:empty::before {
            content: 'Select a layer to edit properties';
            color: var(--text-tertiary, #94a3b8);
            font-style: italic;
            font-size: 11px;
        }
        
        .layers-props label {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 8px;
            margin-bottom: 8px;
            color: var(--text-secondary, #475569);
            flex-wrap: wrap;
            font-size: 11px;
            font-weight: 500;
        }
        
        .layers-props label > span:first-child {
            flex-shrink: 0;
            min-width: 60px;
        }
        
        .layers-props input[type="range"] {
            flex: 1;
            min-width: 60px;
            max-width: 150px;
            accent-color: var(--accent, #2563eb);
        }
        
        .layers-props input[type="number"] {
            width: 48px;
            min-width: 40px;
            padding: 4px;
            background: var(--bg-primary, #f8fafc);
            border: 1px solid var(--border, rgba(0,0,0,0.08));
            border-radius: 4px;
            color: var(--text-primary, #0f172a);
            font-size: 11px;
            text-align: center;
            font-weight: 500;
        }
        
        .layers-props input[type="number"]:focus {
            outline: none;
            border-color: var(--accent, #2563eb);
            box-shadow: 0 0 0 2px var(--accent-soft, rgba(37,99,235,0.08));
        }
        
        .layers-props input[type="color"] {
            width: 36px;
            height: 22px;
            padding: 0;
            border: 1px solid var(--border, rgba(0,0,0,0.08));
            border-radius: 4px;
            cursor: pointer;
            background: transparent;
            -webkit-appearance: none;
            -moz-appearance: none;
            appearance: none;
        }
        
        .layers-props input[type="color"]::-webkit-color-swatch-wrapper {
            padding: 2px;
        }
        
        .layers-props input[type="color"]::-webkit-color-swatch {
            border: none;
            border-radius: 2px;
        }
        
        .layers-list-container {
            flex: 1;
            overflow-y: auto;
            overflow-x: hidden;
            padding: 6px;
            min-height: 0;
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
            gap: 8px;
            padding: 8px 10px;
            margin-bottom: 4px;
            background: var(--bg-secondary, #ffffff);
            border: 1px solid var(--border, rgba(0,0,0,0.06));
            border-radius: 6px;
            cursor: pointer;
            transition: all 0.12s ease;
            font-size: 12px;
            color: var(--text-primary, #0f172a);
        }
        
        .layers-list .layerDiv:last-child {
            margin-bottom: 0;
        }
        
        .layers-list .layerDiv p {
            margin: 0;
            flex: 1;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            font-weight: 500;
        }
        
        .layers-list .layerDiv:hover {
            background: var(--bg-tertiary, #f1f5f9);
            border-color: var(--border-strong, rgba(0,0,0,0.1));
        }
        
        .layers-list .layerDiv.selectedLayerDiv,
        .layers-list .selectedLayerDiv {
            border-color: var(--accent, #2563eb);
            background: var(--accent-soft, rgba(37,99,235,0.08));
        }
        
        /* Layer visibility checkbox - default browser style */
        .layers-list .layerDivToggleVisability {
            width: 16px !important;
            height: 16px !important;
            min-width: 16px !important;
            min-height: 16px !important;
            margin: 0 !important;
            margin-left: 6px !important;
            cursor: pointer !important;
            flex-shrink: 0 !important;
            display: inline-block !important;
            visibility: visible !important;
            opacity: 1 !important;
            position: relative !important;
            accent-color: var(--accent, #2563eb);
        }
        
        .layers-controls {
            display: flex;
            gap: 6px;
            align-items: center;
            flex-shrink: 0;
            padding-top: 8px;
            border-top: 1px solid var(--border, rgba(0,0,0,0.06));
            margin-top: auto;
        }
        
        .layer-reorder-group {
            display: flex;
            gap: 4px;
        }
        
        .layer-reorder-group button {
            width: 30px;
            height: 30px;
            background: var(--bg-primary, #f8fafc);
            border: 1px solid var(--border, rgba(0,0,0,0.08));
            border-radius: 6px;
            color: var(--text-secondary, #475569);
            cursor: pointer;
            font-size: 11px;
            transition: all 0.12s ease;
        }
        
        .layer-reorder-group button:hover {
            background: var(--accent, #2563eb);
            border-color: var(--accent, #2563eb);
            color: white;
        }
        
        .layer-reorder-group button:disabled {
            opacity: 0.4;
            cursor: not-allowed;
        }
        
        .layer-reorder-group button:disabled:hover {
            background: var(--bg-primary, #f8fafc);
            border-color: var(--border, rgba(0,0,0,0.08));
            color: var(--text-secondary, #475569);
        }
        
        .layers-controls .delete-btn {
            flex: 1;
            padding: 6px 10px;
            background: rgba(239, 68, 68, 0.08);
            border: 1px solid rgba(239, 68, 68, 0.2);
            border-radius: 6px;
            color: #ef4444;
            cursor: pointer;
            font-size: 11px;
            font-weight: 600;
            transition: all 0.12s ease;
        }
        
        .layers-controls .delete-btn:hover {
            background: rgba(239, 68, 68, 0.15);
            border-color: rgba(239, 68, 68, 0.4);
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
            padding: 10px;
            display: flex;
            flex-direction: column;
            gap: 12px;
        }
        
        .props-group {
            display: flex;
            flex-direction: column;
            gap: 6px;
            overflow: hidden;
        }
        
        .props-label {
            font-size: 10px;
            font-weight: 600;
            color: var(--text-tertiary, #94a3b8);
            text-transform: uppercase;
            letter-spacing: 0.06em;
        }
        
        .props-input,
        .props-select {
            width: 100%;
            padding: 8px 10px;
            background: var(--bg-primary, #f8fafc);
            border: 1px solid var(--border, rgba(0,0,0,0.08));
            border-radius: 6px;
            color: var(--text-primary, #0f172a);
            font-size: 12px;
            font-weight: 500;
            transition: all 0.12s ease;
            box-shadow: inset 0 1px 2px rgba(0,0,0,0.04);
        }
        
        .props-input:hover,
        .props-select:hover {
            border-color: var(--border-strong, rgba(0,0,0,0.12));
        }
        
        .props-input:focus,
        .props-select:focus {
            outline: none;
            border-color: var(--accent, #2563eb);
            box-shadow: 0 0 0 2px var(--accent-soft, rgba(37,99,235,0.08));
        }
        
        .props-dimensions {
            display: flex;
            align-items: center;
            gap: 6px;
            flex-wrap: wrap;
        }
        
        .props-dimensions input {
            flex: 1;
            min-width: 48px;
            max-width: 72px;
            padding: 6px;
            background: var(--bg-primary, #f8fafc);
            border: 1px solid var(--border, rgba(0,0,0,0.08));
            border-radius: 6px;
            color: var(--text-primary, #0f172a);
            font-size: 12px;
            text-align: center;
            font-weight: 500;
            box-shadow: inset 0 1px 2px rgba(0,0,0,0.04);
        }
        
        .props-dimensions input:hover {
            border-color: var(--border-strong, rgba(0,0,0,0.12));
        }
        
        .props-dimensions input:focus {
            outline: none;
            border-color: var(--accent, #2563eb);
            box-shadow: 0 0 0 2px var(--accent-soft, rgba(37,99,235,0.08));
        }
        
        .props-separator {
            color: var(--text-tertiary, #64748b);
            font-weight: 500;
            flex-shrink: 0;
        }
        
        .props-dim-actions {
            display: flex;
            gap: 4px;
            margin-top: 4px;
            flex-wrap: wrap;
        }
        
        .props-dim-actions button {
            flex: 1;
            min-width: 40px;
            padding: 5px 6px;
            background: var(--bg-tertiary, #334155);
            border: 1px solid var(--border, rgba(255,255,255,0.1));
            border-radius: 4px;
            color: var(--text-primary, #f1f5f9);
            font-size: 11px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.15s ease;
            white-space: nowrap;
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
    // If window was closed/nulled, recreate it (this will also open it)
    if (!layersWindow) {
        createLayersWindow()
        return // createWindow already opens/focuses the window
    }
    
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
    // If window was closed/nulled, recreate it (this will also open it)
    if (!imagePropertiesWindow) {
        createImagePropertiesWindow()
        return // createWindow already opens/focuses the window
    }
    
    if (imagePropertiesWindow.isVisible()) {
        imagePropertiesWindow.minimize()
    } else {
        imagePropertiesWindow.restore()
        imagePropertiesWindow.focus()
    }
}
