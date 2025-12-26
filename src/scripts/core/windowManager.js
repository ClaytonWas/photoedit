/**
 * Window Manager - A flexible, draggable, resizable window system
 * 
 * Features:
 * - Draggable windows with title bar
 * - Resizable windows
 * - Minimizable/maximizable
 * - Z-index management (click to focus)
 * - Docking support (snap to edges)
 * - Tabbed window groups
 * - Window state persistence (localStorage)
 * - Event system for window lifecycle
 * - Mobile-responsive slide-up panels
 */

class WindowManager {
    constructor() {
        this.windows = new Map()
        this.tabGroups = new Map() // Tab group containers
        this.windowOrder = [] // z-index ordering
        this.baseZIndex = 1000
        this.snapThreshold = 20
        this.edgeSnapThreshold = 40 // Distance to trigger edge docking
        this.windowSnapThreshold = 15 // Distance to snap to other windows
        this.tabDropThreshold = 50 // Distance to trigger tab merge
        this.minimizedWindows = []
        this.windowIdCounter = 0
        this.tabGroupIdCounter = 0
        this.snapPreview = null // Snap preview element
        this.currentSnapZone = null // Current detected snap zone
        this.currentTabTarget = null // Window being hovered for tab merge
        this.mobileBreakpoint = 768 // Pixel width below which mobile mode activates
        this.mobilePanels = new Map() // Track mobile panels separately
        this.activeMobilePanel = null // Currently open mobile panel
        
        this.init()
    }
    
    /**
     * Check if we're on a mobile device or narrow screen
     * More conservative - touch capability alone doesn't mean mobile
     */
    isMobile() {
        // Check screen width
        const isNarrow = window.innerWidth <= this.mobileBreakpoint
        
        // Check user agent for mobile devices (only if also reasonably narrow)
        const mobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
        const isMobileDevice = mobileUA && window.innerWidth <= 1024
        
        // Must be narrow to be considered mobile
        // Touch capability alone shouldn't trigger mobile (VS Code webview has touch)
        return isNarrow || isMobileDevice
    }
    
    init() {
        // Create container for all managed windows
        this.container = document.createElement('div')
        this.container.className = 'wm-container'
        document.body.appendChild(this.container)
        
        // Create minimized windows dock
        this.dock = document.createElement('div')
        this.dock.className = 'wm-dock'
        document.body.appendChild(this.dock)
        
        // Create snap preview element
        this.snapPreview = document.createElement('div')
        this.snapPreview.className = 'wm-snap-preview'
        document.body.appendChild(this.snapPreview)
        
        // Create mobile panel overlay
        this.mobileOverlay = document.createElement('div')
        this.mobileOverlay.className = 'wm-mobile-overlay'
        this.mobileOverlay.addEventListener('click', () => this.closeAllMobilePanels())
        document.body.appendChild(this.mobileOverlay)
        
        // Create mobile panels container
        this.mobilePanelContainer = document.createElement('div')
        this.mobilePanelContainer.className = 'wm-mobile-panel-container'
        document.body.appendChild(this.mobilePanelContainer)
        
        // Inject styles
        this.injectStyles()
        
        // Restore window states from localStorage
        this.restoreWindowStates()
        
        // Listen for resize to handle switching between mobile/desktop
        window.addEventListener('resize', () => this.handleResize())
    }
    
    /**
     * Create a new window
     * @param {Object} options - Window configuration
     * @returns {Window} The created window instance
     */
    createWindow(options = {}) {
        const id = options.id || `window-${++this.windowIdCounter}`
        
        // Check if window with this ID already exists
        if (this.windows.has(id)) {
            const existing = this.windows.get(id)
            // On mobile, open the mobile panel
            if (this.isMobile() && this.mobilePanels.has(id)) {
                this.openMobilePanel(id)
            } else {
                this.focusWindow(id)
            }
            return existing
        }
        
        const defaults = {
            id,
            title: 'Window',
            width: 400,
            height: 300,
            minWidth: 200,
            minHeight: 150,
            x: null,
            y: null,
            resizable: true,
            minimizable: true,
            maximizable: true,
            closable: true,
            content: null,
            contentClass: '',
            onClose: null,
            onMinimize: null,
            onMaximize: null,
            onResize: null,
            onMove: null,
            onCreate: null,
            autoFocus: true,
            persistent: true, // Save state to localStorage
            icon: null
        }
        
        const config = { ...defaults, ...options }
        
        // On mobile, create a slide-up panel instead
        if (this.isMobile()) {
            return this.createMobilePanel(id, config)
        }
        
        // Create window element
        const windowEl = document.createElement('div')
        windowEl.className = 'wm-window'
        windowEl.id = id
        windowEl.dataset.windowId = id
        
        // Set initial position
        const savedState = this.getSavedState(id)
        let x = config.x ?? savedState?.x ?? this.getDefaultPosition().x
        let y = config.y ?? savedState?.y ?? this.getDefaultPosition().y
        let width = savedState?.width ?? config.width
        let height = savedState?.height ?? config.height
        
        windowEl.style.cssText = `
            width: ${width}px;
            height: ${height}px;
            left: ${x}px;
            top: ${y}px;
            min-width: ${config.minWidth}px;
            min-height: ${config.minHeight}px;
        `
        
        // Build window HTML
        windowEl.innerHTML = `
            <div class="wm-titlebar">
                ${config.icon ? `<span class="wm-icon">${config.icon}</span>` : ''}
                <span class="wm-title">${config.title}</span>
                <div class="wm-controls">
                    ${config.minimizable ? '<button class="wm-btn wm-minimize" title="Minimize">─</button>' : ''}
                    ${config.maximizable ? '<button class="wm-btn wm-maximize" title="Maximize">□</button>' : ''}
                    ${config.closable ? '<button class="wm-btn wm-close" title="Close">×</button>' : ''}
                </div>
            </div>
            <div class="wm-content ${config.contentClass}"></div>
            ${config.resizable ? `
                <div class="wm-resize-handle wm-resize-n"></div>
                <div class="wm-resize-handle wm-resize-s"></div>
                <div class="wm-resize-handle wm-resize-e"></div>
                <div class="wm-resize-handle wm-resize-w"></div>
                <div class="wm-resize-handle wm-resize-nw"></div>
                <div class="wm-resize-handle wm-resize-ne"></div>
                <div class="wm-resize-handle wm-resize-sw"></div>
                <div class="wm-resize-handle wm-resize-se"></div>
            ` : ''}
        `
        
        // Get content container
        const contentEl = windowEl.querySelector('.wm-content')
        
        // Set content
        if (config.content) {
            if (typeof config.content === 'string') {
                contentEl.innerHTML = config.content
            } else if (config.content instanceof HTMLElement) {
                contentEl.appendChild(config.content)
            }
        }
        
        // Create window instance
        const windowInstance = {
            id,
            element: windowEl,
            content: contentEl,
            config,
            state: {
                minimized: false,
                maximized: false,
                docked: null, // Docked position: 'left', 'right', 'top-left', etc.
                preDockState: null, // Store state before docking
                tabGroupId: null, // ID of tab group this window belongs to
                x,
                y,
                width,
                height,
                prevState: null // Store state before maximizing
            },
            
            // API methods
            setTitle: (title) => {
                windowEl.querySelector('.wm-title').textContent = title
                config.title = title
            },
            setContent: (content) => {
                if (typeof content === 'string') {
                    contentEl.innerHTML = content
                } else if (content instanceof HTMLElement) {
                    contentEl.innerHTML = ''
                    contentEl.appendChild(content)
                }
            },
            appendContent: (content) => {
                if (typeof content === 'string') {
                    contentEl.innerHTML += content
                } else if (content instanceof HTMLElement) {
                    contentEl.appendChild(content)
                }
            },
            getContentElement: () => contentEl,
            close: () => this.closeWindow(id),
            minimize: () => this.minimizeWindow(id),
            maximize: () => this.maximizeWindow(id),
            restore: () => this.restoreWindow(id),
            focus: () => this.focusWindow(id),
            undock: () => this.undockWindow(id),
            dock: (zone) => this.dockWindowToZone(id, zone),
            resize: (w, h) => {
                windowEl.style.width = `${w}px`
                windowEl.style.height = `${h}px`
                windowInstance.state.width = w
                windowInstance.state.height = h
                this.saveWindowState(id)
            },
            move: (newX, newY) => {
                windowEl.style.left = `${newX}px`
                windowEl.style.top = `${newY}px`
                windowInstance.state.x = newX
                windowInstance.state.y = newY
                this.saveWindowState(id)
            },
            getState: () => ({ ...windowInstance.state }),
            show: () => {
                windowEl.classList.remove('wm-hidden')
            },
            hide: () => {
                windowEl.classList.add('wm-hidden')
            },
            isVisible: () => !windowEl.classList.contains('wm-hidden'),
            isDocked: () => windowInstance.state.docked !== null,
            isInTabGroup: () => windowInstance.state.tabGroupId !== null,
            getTabGroup: () => windowInstance.state.tabGroupId ? this.tabGroups.get(windowInstance.state.tabGroupId) : null,
            detachFromTabs: () => this.detachFromTabGroup(id),
            mergeWith: (targetId) => this.mergeIntoTabGroup(id, targetId)
        }
        
        // Add to container and tracking
        this.container.appendChild(windowEl)
        this.windows.set(id, windowInstance)
        this.windowOrder.push(id)
        
        // Setup event handlers
        this.setupWindowEvents(windowInstance)
        
        // Restore docked state if saved
        if (savedState?.docked) {
            windowInstance.state.preDockState = savedState.preDockState
            this.dockWindowToZone(id, savedState.docked)
        }
        
        // Focus if autoFocus
        if (config.autoFocus) {
            this.focusWindow(id)
        }
        
        // Call onCreate callback
        if (config.onCreate) {
            config.onCreate(windowInstance)
        }
        
        // Save initial state
        if (config.persistent) {
            this.saveWindowState(id)
        }
        
        return windowInstance
    }
    
    setupWindowEvents(windowInstance) {
        const { element, config, id } = windowInstance
        const titlebar = element.querySelector('.wm-titlebar')
        
        // Click to focus
        element.addEventListener('mousedown', () => this.focusWindow(id))
        element.addEventListener('touchstart', () => this.focusWindow(id), { passive: true })
        
        // Dragging
        this.setupDragging(windowInstance, titlebar)
        
        // Resizing
        if (config.resizable) {
            this.setupResizing(windowInstance)
        }
        
        // Control buttons
        const minimizeBtn = element.querySelector('.wm-minimize')
        const maximizeBtn = element.querySelector('.wm-maximize')
        const closeBtn = element.querySelector('.wm-close')
        
        if (minimizeBtn) {
            minimizeBtn.addEventListener('click', (e) => {
                e.stopPropagation()
                this.minimizeWindow(id)
            })
        }
        
        if (maximizeBtn) {
            maximizeBtn.addEventListener('click', (e) => {
                e.stopPropagation()
                if (windowInstance.state.maximized) {
                    this.restoreWindow(id)
                } else {
                    this.maximizeWindow(id)
                }
            })
            
            // Double-click titlebar to maximize
            titlebar.addEventListener('dblclick', () => {
                if (windowInstance.state.maximized) {
                    this.restoreWindow(id)
                } else {
                    this.maximizeWindow(id)
                }
            })
        }
        
        if (closeBtn) {
            closeBtn.addEventListener('click', (e) => {
                e.stopPropagation()
                this.closeWindow(id)
            })
        }
    }
    
    setupDragging(windowInstance, handle) {
        const { element, state, config, id } = windowInstance
        let isDragging = false
        let startX, startY, startLeft, startTop
        let draggedFromTabGroup = false
        
        const onStart = (e) => {
            if (state.maximized) return
            if (e.target.closest('.wm-controls')) return
            if (e.target.closest('.wm-tab') && !e.target.closest('.wm-tab-close')) return // Let tab clicks through
            
            // If window is in a tab group, we need to detach it first
            if (state.tabGroupId) {
                const tabGroup = this.tabGroups.get(state.tabGroupId)
                if (tabGroup && tabGroup.tabs.length > 1) {
                    // Detach from tab group on drag
                    draggedFromTabGroup = true
                    this.detachFromTabGroup(id)
                }
            }
            
            // If window was docked, undock it first
            if (state.docked) {
                this.undockWindow(id)
            }
            
            isDragging = true
            element.classList.add('wm-dragging')
            
            const clientX = e.touches ? e.touches[0].clientX : e.clientX
            const clientY = e.touches ? e.touches[0].clientY : e.clientY
            
            startX = clientX
            startY = clientY
            startLeft = element.offsetLeft
            startTop = element.offsetTop
            
            e.preventDefault()
        }
        
        const onMove = (e) => {
            if (!isDragging) return
            
            const clientX = e.touches ? e.touches[0].clientX : e.clientX
            const clientY = e.touches ? e.touches[0].clientY : e.clientY
            
            let newX = startLeft + (clientX - startX)
            let newY = startTop + (clientY - startY)
            
            // Check for tab merge target (another window to combine with)
            const tabTarget = this.detectTabMergeTarget(id, clientX, clientY)
            this.showTabMergePreview(tabTarget)
            
            // Check for edge snap zones (for docking to screen edges)
            if (!tabTarget) {
                const snapZone = this.detectEdgeSnapZone(clientX, clientY)
                this.showSnapPreview(snapZone)
            } else {
                this.hideSnapPreview()
            }
            
            // Check for snapping to other windows
            const windowSnap = this.detectWindowSnap(id, newX, newY, element.offsetWidth, element.offsetHeight)
            if (windowSnap.x !== null) newX = windowSnap.x
            if (windowSnap.y !== null) newY = windowSnap.y
            
            // Snap to basic edges if no window snap
            if (windowSnap.x === null) {
                const container = this.container.getBoundingClientRect()
                if (Math.abs(newX) < this.snapThreshold) newX = 0
                if (Math.abs(newX + element.offsetWidth - container.width) < this.snapThreshold) {
                    newX = container.width - element.offsetWidth
                }
            }
            
            // Keep titlebar visible
            newY = Math.max(0, newY)
            
            element.style.left = `${newX}px`
            element.style.top = `${newY}px`
            state.x = newX
            state.y = newY
            
            if (config.onMove) config.onMove(windowInstance)
        }
        
        const onEnd = (e) => {
            if (!isDragging) return
            isDragging = false
            element.classList.remove('wm-dragging')
            
            // Check if we should merge into a tab group
            if (this.currentTabTarget) {
                this.mergeIntoTabGroup(id, this.currentTabTarget)
                this.hideTabMergePreview()
                this.hideSnapPreview()
                draggedFromTabGroup = false
                return
            }
            
            // Check if we should dock to an edge
            if (this.currentSnapZone) {
                this.dockWindowToZone(id, this.currentSnapZone)
            }
            
            this.hideSnapPreview()
            this.hideTabMergePreview()
            this.saveWindowState(id)
            draggedFromTabGroup = false
        }
        
        handle.addEventListener('mousedown', onStart)
        handle.addEventListener('touchstart', onStart, { passive: false })
        document.addEventListener('mousemove', onMove)
        document.addEventListener('touchmove', onMove, { passive: false })
        document.addEventListener('mouseup', onEnd)
        document.addEventListener('touchend', onEnd)
    }
    
    /**
     * Detect if cursor is in an edge snap zone
     */
    detectEdgeSnapZone(clientX, clientY) {
        const bottomNavHeight = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--bottom-nav-height') || '64')
        const screenWidth = window.innerWidth
        const screenHeight = window.innerHeight - bottomNavHeight
        const threshold = this.edgeSnapThreshold
        
        // Corner zones (for quarter-screen docking)
        if (clientX < threshold && clientY < threshold) return 'top-left'
        if (clientX > screenWidth - threshold && clientY < threshold) return 'top-right'
        if (clientX < threshold && clientY > screenHeight - threshold) return 'bottom-left'
        if (clientX > screenWidth - threshold && clientY > screenHeight - threshold) return 'bottom-right'
        
        // Edge zones (for half-screen docking)
        if (clientX < threshold) return 'left'
        if (clientX > screenWidth - threshold) return 'right'
        if (clientY < threshold) return 'top'
        
        return null
    }
    
    /**
     * Detect snapping to other windows
     */
    detectWindowSnap(draggedId, x, y, width, height) {
        const result = { x: null, y: null }
        const threshold = this.windowSnapThreshold
        
        for (const [id, win] of this.windows) {
            if (id === draggedId) continue
            if (win.state.minimized || win.state.maximized) continue
            
            const rect = win.element.getBoundingClientRect()
            const winX = win.state.x
            const winY = win.state.y
            const winW = win.state.width
            const winH = win.state.height
            
            // Check horizontal alignment (left edge to left edge, right to right, left to right, right to left)
            // Left edge to left edge
            if (Math.abs(x - winX) < threshold) result.x = winX
            // Right edge to right edge  
            if (Math.abs((x + width) - (winX + winW)) < threshold) result.x = winX + winW - width
            // Left edge to right edge (snap beside)
            if (Math.abs(x - (winX + winW)) < threshold) result.x = winX + winW
            // Right edge to left edge (snap beside)
            if (Math.abs((x + width) - winX) < threshold) result.x = winX - width
            
            // Check vertical alignment
            // Top to top
            if (Math.abs(y - winY) < threshold) result.y = winY
            // Bottom to bottom
            if (Math.abs((y + height) - (winY + winH)) < threshold) result.y = winY + winH - height
            // Top to bottom (snap below)
            if (Math.abs(y - (winY + winH)) < threshold) result.y = winY + winH
            // Bottom to top (snap above)
            if (Math.abs((y + height) - winY) < threshold) result.y = winY - height
        }
        
        return result
    }
    
    /**
     * Show snap preview overlay
     */
    showSnapPreview(zone) {
        this.currentSnapZone = zone
        
        if (!zone) {
            this.snapPreview.classList.remove('wm-snap-preview-visible')
            return
        }
        
        const bottomNavHeight = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--bottom-nav-height') || '64')
        const screenWidth = window.innerWidth
        const screenHeight = window.innerHeight - bottomNavHeight
        
        let previewStyle = {}
        
        switch (zone) {
            case 'left':
                previewStyle = { left: 0, top: 0, width: screenWidth / 2, height: screenHeight }
                break
            case 'right':
                previewStyle = { left: screenWidth / 2, top: 0, width: screenWidth / 2, height: screenHeight }
                break
            case 'top':
                previewStyle = { left: 0, top: 0, width: screenWidth, height: screenHeight }
                break
            case 'top-left':
                previewStyle = { left: 0, top: 0, width: screenWidth / 2, height: screenHeight / 2 }
                break
            case 'top-right':
                previewStyle = { left: screenWidth / 2, top: 0, width: screenWidth / 2, height: screenHeight / 2 }
                break
            case 'bottom-left':
                previewStyle = { left: 0, top: screenHeight / 2, width: screenWidth / 2, height: screenHeight / 2 }
                break
            case 'bottom-right':
                previewStyle = { left: screenWidth / 2, top: screenHeight / 2, width: screenWidth / 2, height: screenHeight / 2 }
                break
        }
        
        this.snapPreview.style.left = `${previewStyle.left}px`
        this.snapPreview.style.top = `${previewStyle.top}px`
        this.snapPreview.style.width = `${previewStyle.width}px`
        this.snapPreview.style.height = `${previewStyle.height}px`
        this.snapPreview.classList.add('wm-snap-preview-visible')
    }
    
    hideSnapPreview() {
        this.currentSnapZone = null
        this.snapPreview.classList.remove('wm-snap-preview-visible')
    }
    
    /**
     * Dock a window to a snap zone
     */
    dockWindowToZone(id, zone) {
        const windowInstance = this.windows.get(id)
        if (!windowInstance) return
        
        const { element, state, config } = windowInstance
        const bottomNavHeight = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--bottom-nav-height') || '64')
        const screenWidth = window.innerWidth
        const screenHeight = window.innerHeight - bottomNavHeight
        
        // Store pre-dock state for restoration
        if (!state.preDockState) {
            state.preDockState = {
                x: state.x,
                y: state.y,
                width: state.width,
                height: state.height
            }
        }
        
        let dockStyle = {}
        
        switch (zone) {
            case 'left':
                dockStyle = { x: 0, y: 0, width: screenWidth / 2, height: screenHeight }
                break
            case 'right':
                dockStyle = { x: screenWidth / 2, y: 0, width: screenWidth / 2, height: screenHeight }
                break
            case 'top':
                // Maximize
                dockStyle = { x: 0, y: 0, width: screenWidth, height: screenHeight }
                break
            case 'top-left':
                dockStyle = { x: 0, y: 0, width: screenWidth / 2, height: screenHeight / 2 }
                break
            case 'top-right':
                dockStyle = { x: screenWidth / 2, y: 0, width: screenWidth / 2, height: screenHeight / 2 }
                break
            case 'bottom-left':
                dockStyle = { x: 0, y: screenHeight / 2, width: screenWidth / 2, height: screenHeight / 2 }
                break
            case 'bottom-right':
                dockStyle = { x: screenWidth / 2, y: screenHeight / 2, width: screenWidth / 2, height: screenHeight / 2 }
                break
        }
        
        element.style.left = `${dockStyle.x}px`
        element.style.top = `${dockStyle.y}px`
        element.style.width = `${dockStyle.width}px`
        element.style.height = `${dockStyle.height}px`
        
        state.x = dockStyle.x
        state.y = dockStyle.y
        state.width = dockStyle.width
        state.height = dockStyle.height
        state.docked = zone
        
        element.classList.add('wm-docked')
        
        if (config.onResize) config.onResize(windowInstance)
        this.saveWindowState(id)
    }
    
    /**
     * Undock a window from its snap zone
     */
    undockWindow(id) {
        const windowInstance = this.windows.get(id)
        if (!windowInstance || !windowInstance.state.docked) return
        
        const { element, state, config } = windowInstance
        
        // Restore pre-dock state
        if (state.preDockState) {
            element.style.width = `${state.preDockState.width}px`
            element.style.height = `${state.preDockState.height}px`
            state.width = state.preDockState.width
            state.height = state.preDockState.height
            // Keep x/y at current cursor position, will be set by drag
        }
        
        state.docked = null
        state.preDockState = null
        element.classList.remove('wm-docked')
        
        if (config.onResize) config.onResize(windowInstance)
    }
    
    /**
     * Snap a window next to another window
     */
    snapWindowToWindow(sourceId, targetId, position) {
        const sourceWin = this.windows.get(sourceId)
        const targetWin = this.windows.get(targetId)
        if (!sourceWin || !targetWin) return
        
        const targetState = targetWin.state
        const sourceElement = sourceWin.element
        const sourceState = sourceWin.state
        
        let newX = sourceState.x
        let newY = sourceState.y
        
        switch (position) {
            case 'left':
                newX = targetState.x - sourceState.width
                newY = targetState.y
                break
            case 'right':
                newX = targetState.x + targetState.width
                newY = targetState.y
                break
            case 'top':
                newX = targetState.x
                newY = targetState.y - sourceState.height
                break
            case 'bottom':
                newX = targetState.x
                newY = targetState.y + targetState.height
                break
        }
        
        sourceElement.style.left = `${newX}px`
        sourceElement.style.top = `${newY}px`
        sourceState.x = newX
        sourceState.y = newY
        
        this.saveWindowState(sourceId)
    }
    
    // ==================== TAB GROUP METHODS ====================
    
    /**
     * Detect if dragging window is over another window for tab merge
     */
    detectTabMergeTarget(draggedId, clientX, clientY) {
        const draggedWin = this.windows.get(draggedId)
        const draggedGroupId = draggedWin?.state.tabGroupId
        
        for (const [id, win] of this.windows) {
            if (id === draggedId) continue
            if (win.state.minimized) continue
            // Skip windows that are in the same tab group as the dragged window
            if (draggedGroupId && win.state.tabGroupId === draggedGroupId) continue
            // Skip windows that are hidden in a tab group (not standalone)
            if (win.state.tabGroupId && win.element.style.display === 'none') continue
            
            const rect = win.element.getBoundingClientRect()
            const titlebarHeight = 36 // Approximate titlebar height
            
            // Check if cursor is over the titlebar area of another window
            if (clientX >= rect.left && clientX <= rect.right &&
                clientY >= rect.top && clientY <= rect.top + titlebarHeight + this.tabDropThreshold) {
                return id
            }
        }
        
        // Also check tab groups
        for (const [groupId, group] of this.tabGroups) {
            // Don't target a group that contains the dragged window
            if (group.tabs.includes(draggedId)) continue
            // Don't target the same group the dragged window came from
            if (draggedGroupId === groupId) continue
            
            const rect = group.element.getBoundingClientRect()
            const titlebarHeight = 60 // Tab group has taller header
            
            if (clientX >= rect.left && clientX <= rect.right &&
                clientY >= rect.top && clientY <= rect.top + titlebarHeight + this.tabDropThreshold) {
                // Return first window in the tab group as target
                return group.tabs[0]
            }
        }
        
        return null
    }
    
    /**
     * Show visual preview for tab merge
     */
    showTabMergePreview(targetId) {
        this.currentTabTarget = targetId
        
        // Remove previous highlights
        this.container.querySelectorAll('.wm-tab-merge-target').forEach(el => {
            el.classList.remove('wm-tab-merge-target')
        })
        
        if (!targetId) return
        
        const targetWin = this.windows.get(targetId)
        if (targetWin) {
            // If target is in a tab group, highlight the group
            if (targetWin.state.tabGroupId) {
                const group = this.tabGroups.get(targetWin.state.tabGroupId)
                if (group) group.element.classList.add('wm-tab-merge-target')
            } else {
                targetWin.element.classList.add('wm-tab-merge-target')
            }
        }
    }
    
    /**
     * Hide tab merge preview
     */
    hideTabMergePreview() {
        this.currentTabTarget = null
        this.container.querySelectorAll('.wm-tab-merge-target').forEach(el => {
            el.classList.remove('wm-tab-merge-target')
        })
    }
    
    /**
     * Merge a window into a tab group with another window
     */
    mergeIntoTabGroup(sourceId, targetId) {
        const sourceWin = this.windows.get(sourceId)
        const targetWin = this.windows.get(targetId)
        if (!sourceWin || !targetWin) return
        
        // Don't merge if they're already in the same tab group
        if (sourceWin.state.tabGroupId && sourceWin.state.tabGroupId === targetWin.state.tabGroupId) {
            return
        }
        
        // If source is already in a tab group, we need to detach it first
        if (sourceWin.state.tabGroupId) {
            this.detachFromTabGroup(sourceId, true) // true = keep content in window
        }
        
        // If target is already in a tab group, add source to that group
        if (targetWin.state.tabGroupId) {
            this.addToTabGroup(sourceId, targetWin.state.tabGroupId)
            return
        }
        
        // Create new tab group with both windows
        this.createTabGroup([targetId, sourceId])
    }
    
    /**
     * Create a new tab group from windows
     */
    createTabGroup(windowIds) {
        if (windowIds.length < 2) return null
        
        const groupId = `tab-group-${++this.tabGroupIdCounter}`
        const firstWin = this.windows.get(windowIds[0])
        if (!firstWin) return null
        
        // Create tab group container
        const groupEl = document.createElement('div')
        groupEl.className = 'wm-tab-group'
        groupEl.id = groupId
        groupEl.style.cssText = `
            width: ${firstWin.state.width}px;
            height: ${firstWin.state.height}px;
            left: ${firstWin.state.x}px;
            top: ${firstWin.state.y}px;
        `
        
        // Create tab bar container (holds tabs + close button)
        const tabBarContainer = document.createElement('div')
        tabBarContainer.className = 'wm-tab-bar-container'
        groupEl.appendChild(tabBarContainer)
        
        // Create tab bar
        const tabBar = document.createElement('div')
        tabBar.className = 'wm-tab-bar'
        tabBarContainer.appendChild(tabBar)
        
        // Create close all button
        const closeAllBtn = document.createElement('button')
        closeAllBtn.className = 'wm-tab-group-close'
        closeAllBtn.title = 'Close all tabs'
        closeAllBtn.innerHTML = '×'
        closeAllBtn.addEventListener('click', () => this.closeTabGroup(groupId))
        tabBarContainer.appendChild(closeAllBtn)
        
        // Create content area
        const contentArea = document.createElement('div')
        contentArea.className = 'wm-tab-content'
        groupEl.appendChild(contentArea)
        
        // Add all 8 resize handles (use createElement to avoid destroying tabBar/contentArea references)
        const resizeN = document.createElement('div')
        resizeN.className = 'wm-resize-handle wm-resize-n'
        groupEl.appendChild(resizeN)
        
        const resizeS = document.createElement('div')
        resizeS.className = 'wm-resize-handle wm-resize-s'
        groupEl.appendChild(resizeS)
        
        const resizeE = document.createElement('div')
        resizeE.className = 'wm-resize-handle wm-resize-e'
        groupEl.appendChild(resizeE)
        
        const resizeW = document.createElement('div')
        resizeW.className = 'wm-resize-handle wm-resize-w'
        groupEl.appendChild(resizeW)
        
        const resizeNW = document.createElement('div')
        resizeNW.className = 'wm-resize-handle wm-resize-nw'
        groupEl.appendChild(resizeNW)
        
        const resizeNE = document.createElement('div')
        resizeNE.className = 'wm-resize-handle wm-resize-ne'
        groupEl.appendChild(resizeNE)
        
        const resizeSW = document.createElement('div')
        resizeSW.className = 'wm-resize-handle wm-resize-sw'
        groupEl.appendChild(resizeSW)
        
        const resizeSE = document.createElement('div')
        resizeSE.className = 'wm-resize-handle wm-resize-se'
        groupEl.appendChild(resizeSE)
        
        this.container.appendChild(groupEl)
        
        // Create tab group instance
        const tabGroup = {
            id: groupId,
            element: groupEl,
            tabBarContainer,
            tabBar,
            contentArea,
            tabs: [],
            activeTab: null,
            state: {
                x: firstWin.state.x,
                y: firstWin.state.y,
                width: firstWin.state.width,
                height: firstWin.state.height,
                docked: null,
                preDockState: null
            }
        }
        
        this.tabGroups.set(groupId, tabGroup)
        
        // Setup drag/resize for tab group
        this.setupTabGroupDragging(tabGroup)
        this.setupTabGroupResizing(tabGroup)
        
        // Add windows to group
        windowIds.forEach((winId, index) => {
            this.addWindowToTabGroup(winId, tabGroup, index === 0)
        })
        
        // Focus the group
        this.focusTabGroup(groupId)
        
        return tabGroup
    }
    
    /**
     * Add a window to an existing tab group
     */
    addToTabGroup(windowId, groupId) {
        const tabGroup = this.tabGroups.get(groupId)
        if (!tabGroup) return
        
        this.addWindowToTabGroup(windowId, tabGroup, false)
    }
    
    /**
     * Internal: Add window to tab group
     */
    addWindowToTabGroup(windowId, tabGroup, setActive) {
        const win = this.windows.get(windowId)
        if (!win) return
        
        // Don't add if already in this tab group
        if (tabGroup.tabs.includes(windowId)) return
        
        // If window is in another tab group, detach it first
        if (win.state.tabGroupId && win.state.tabGroupId !== tabGroup.id) {
            this.detachFromTabGroup(windowId, true)
        }
        
        // Hide the original window
        win.element.style.display = 'none'
        win.state.tabGroupId = tabGroup.id
        
        // Create tab
        const tab = document.createElement('div')
        tab.className = 'wm-tab'
        tab.dataset.windowId = windowId
        tab.innerHTML = `
            ${win.config.icon ? `<span class="wm-tab-icon">${win.config.icon}</span>` : ''}
            <span class="wm-tab-title">${win.config.title}</span>
            <button class="wm-tab-close" title="Close">×</button>
        `
        
        // Tab click to activate
        tab.addEventListener('click', (e) => {
            if (!e.target.closest('.wm-tab-close')) {
                this.activateTab(tabGroup.id, windowId)
            }
        })
        
        // Tab close button
        tab.querySelector('.wm-tab-close').addEventListener('click', (e) => {
            e.stopPropagation()
            this.closeTabInGroup(tabGroup.id, windowId)
        })
        
        // Tab drag to detach
        this.setupTabDragging(tab, windowId, tabGroup)
        
        tabGroup.tabBar.appendChild(tab)
        tabGroup.tabs.push(windowId)
        
        // Clone content to tab group
        const contentWrapper = document.createElement('div')
        contentWrapper.className = 'wm-tab-panel'
        contentWrapper.dataset.windowId = windowId
        contentWrapper.style.display = 'none'
        
        // Move content from window to tab panel
        while (win.content.firstChild) {
            contentWrapper.appendChild(win.content.firstChild)
        }
        tabGroup.contentArea.appendChild(contentWrapper)
        
        if (setActive || tabGroup.tabs.length === 1) {
            this.activateTab(tabGroup.id, windowId)
        }
    }
    
    /**
     * Activate a tab in a group
     */
    activateTab(groupId, windowId) {
        const tabGroup = this.tabGroups.get(groupId)
        if (!tabGroup) return
        
        tabGroup.activeTab = windowId
        
        // Update tab styles
        tabGroup.tabBar.querySelectorAll('.wm-tab').forEach(tab => {
            tab.classList.toggle('wm-tab-active', tab.dataset.windowId === windowId)
        })
        
        // Show active panel, hide others
        tabGroup.contentArea.querySelectorAll('.wm-tab-panel').forEach(panel => {
            panel.style.display = panel.dataset.windowId === windowId ? 'block' : 'none'
        })
    }
    
    /**
     * Close all tabs in a group
     */
    closeTabGroup(groupId) {
        const tabGroup = this.tabGroups.get(groupId)
        if (!tabGroup) return
        
        // Close all windows in the group
        const tabsToClose = [...tabGroup.tabs]
        tabsToClose.forEach(windowId => {
            const win = this.windows.get(windowId)
            if (win) {
                win.state.tabGroupId = null
                this.closeWindow(windowId)
            }
        })
        
        // Remove the tab group
        tabGroup.element.remove()
        this.tabGroups.delete(groupId)
    }
    
    /**
     * Close a tab in a group
     */
    closeTabInGroup(groupId, windowId) {
        const tabGroup = this.tabGroups.get(groupId)
        const win = this.windows.get(windowId)
        if (!tabGroup || !win) return
        
        // Remove tab
        const tab = tabGroup.tabBar.querySelector(`[data-window-id="${windowId}"]`)
        if (tab) tab.remove()
        
        // Remove content panel
        const panel = tabGroup.contentArea.querySelector(`[data-window-id="${windowId}"]`)
        if (panel) panel.remove()
        
        // Remove from tabs array
        const index = tabGroup.tabs.indexOf(windowId)
        if (index > -1) tabGroup.tabs.splice(index, 1)
        
        // Clear tab group reference
        win.state.tabGroupId = null
        
        // Close the window
        this.closeWindow(windowId)
        
        // If only one tab left, convert back to regular window
        if (tabGroup.tabs.length === 1) {
            this.dissolveTabGroup(groupId)
        } else if (tabGroup.tabs.length > 0 && tabGroup.activeTab === windowId) {
            // Activate another tab
            this.activateTab(groupId, tabGroup.tabs[0])
        } else if (tabGroup.tabs.length === 0) {
            // Remove empty group
            tabGroup.element.remove()
            this.tabGroups.delete(groupId)
        }
    }
    
    /**
     * Detach a window from its tab group (when dragging)
     * @param {string} windowId - The window to detach
     * @param {boolean} forMerge - If true, window stays hidden (being moved to another group)
     */
    detachFromTabGroup(windowId, forMerge = false) {
        const win = this.windows.get(windowId)
        if (!win || !win.state.tabGroupId) return
        
        const tabGroup = this.tabGroups.get(win.state.tabGroupId)
        if (!tabGroup) return
        
        // Get tab position for new window position
        const groupRect = tabGroup.element.getBoundingClientRect()
        
        // Remove tab
        const tab = tabGroup.tabBar.querySelector(`[data-window-id="${windowId}"]`)
        if (tab) tab.remove()
        
        // Get content back from panel
        const panel = tabGroup.contentArea.querySelector(`[data-window-id="${windowId}"]`)
        if (panel) {
            while (panel.firstChild) {
                win.content.appendChild(panel.firstChild)
            }
            panel.remove()
        }
        
        // Remove from tabs array
        const index = tabGroup.tabs.indexOf(windowId)
        if (index > -1) tabGroup.tabs.splice(index, 1)
        
        // Clear tab group reference
        const oldGroupId = win.state.tabGroupId
        win.state.tabGroupId = null
        
        // Show window again (unless we're moving to another group)
        if (!forMerge) {
            win.element.style.display = ''
            win.element.style.left = `${groupRect.left + 20}px`
            win.element.style.top = `${groupRect.top + 20}px`
            win.state.x = groupRect.left + 20
            win.state.y = groupRect.top + 20
            
            this.focusWindow(windowId)
        }
        
        // Check if tab group needs to be dissolved
        if (tabGroup.tabs.length === 1) {
            this.dissolveTabGroup(oldGroupId)
        } else if (tabGroup.tabs.length > 0 && tabGroup.activeTab === windowId) {
            this.activateTab(oldGroupId, tabGroup.tabs[0])
        } else if (tabGroup.tabs.length === 0) {
            // Remove empty group
            tabGroup.element.remove()
            this.tabGroups.delete(oldGroupId)
        }
    }
    
    /**
     * Dissolve a tab group back to a single window
     */
    dissolveTabGroup(groupId) {
        const tabGroup = this.tabGroups.get(groupId)
        if (!tabGroup || tabGroup.tabs.length !== 1) return
        
        const windowId = tabGroup.tabs[0]
        const win = this.windows.get(windowId)
        if (!win) return
        
        // Get content back
        const panel = tabGroup.contentArea.querySelector(`[data-window-id="${windowId}"]`)
        if (panel) {
            while (panel.firstChild) {
                win.content.appendChild(panel.firstChild)
            }
        }
        
        // Restore window position/size from group
        win.element.style.left = `${tabGroup.state.x}px`
        win.element.style.top = `${tabGroup.state.y}px`
        win.element.style.width = `${tabGroup.state.width}px`
        win.element.style.height = `${tabGroup.state.height}px`
        win.state.x = tabGroup.state.x
        win.state.y = tabGroup.state.y
        win.state.width = tabGroup.state.width
        win.state.height = tabGroup.state.height
        win.state.tabGroupId = null
        
        // Show window
        win.element.style.display = ''
        
        // Remove tab group
        tabGroup.element.remove()
        this.tabGroups.delete(groupId)
        
        this.focusWindow(windowId)
    }
    
    /**
     * Focus a tab group
     */
    focusTabGroup(groupId) {
        const tabGroup = this.tabGroups.get(groupId)
        if (!tabGroup) return
        
        // Bring to front
        const maxZ = Math.max(this.baseZIndex, ...Array.from(this.windows.values()).map(w => 
            parseInt(w.element.style.zIndex) || 0
        ))
        tabGroup.element.style.zIndex = maxZ + 1
    }
    
    /**
     * Setup dragging for tab group container
     */
    setupTabGroupDragging(tabGroup) {
        const handle = tabGroup.tabBarContainer
        let isDragging = false
        let startX, startY, startLeft, startTop
        
        const onStart = (e) => {
            if (e.target.closest('.wm-tab')) return // Don't drag when clicking tabs
            if (e.target.closest('.wm-tab-group-close')) return // Don't drag when clicking close
            
            // If docked, undock first
            if (tabGroup.state.docked) {
                this.undockTabGroup(tabGroup.id)
            }
            
            isDragging = true
            tabGroup.element.classList.add('wm-dragging')
            
            const clientX = e.touches ? e.touches[0].clientX : e.clientX
            const clientY = e.touches ? e.touches[0].clientY : e.clientY
            
            startX = clientX
            startY = clientY
            startLeft = tabGroup.element.offsetLeft
            startTop = tabGroup.element.offsetTop
            
            e.preventDefault()
        }
        
        const onMove = (e) => {
            if (!isDragging) return
            
            const clientX = e.touches ? e.touches[0].clientX : e.clientX
            const clientY = e.touches ? e.touches[0].clientY : e.clientY
            
            let newX = startLeft + (clientX - startX)
            let newY = startTop + (clientY - startY)
            
            // Edge snap
            const snapZone = this.detectEdgeSnapZone(clientX, clientY)
            this.showSnapPreview(snapZone)
            
            // Keep visible
            newY = Math.max(0, newY)
            
            tabGroup.element.style.left = `${newX}px`
            tabGroup.element.style.top = `${newY}px`
            tabGroup.state.x = newX
            tabGroup.state.y = newY
        }
        
        const onEnd = () => {
            if (!isDragging) return
            isDragging = false
            tabGroup.element.classList.remove('wm-dragging')
            
            if (this.currentSnapZone) {
                this.dockTabGroupToZone(tabGroup.id, this.currentSnapZone)
            }
            
            this.hideSnapPreview()
        }
        
        handle.addEventListener('mousedown', onStart)
        handle.addEventListener('touchstart', onStart, { passive: false })
        document.addEventListener('mousemove', onMove)
        document.addEventListener('touchmove', onMove, { passive: false })
        document.addEventListener('mouseup', onEnd)
        document.addEventListener('touchend', onEnd)
    }
    
    /**
     * Undock a tab group
     */
    undockTabGroup(groupId) {
        const tabGroup = this.tabGroups.get(groupId)
        if (!tabGroup || !tabGroup.state.docked) return
        
        // Restore pre-dock state
        if (tabGroup.state.preDockState) {
            tabGroup.element.style.width = `${tabGroup.state.preDockState.width}px`
            tabGroup.element.style.height = `${tabGroup.state.preDockState.height}px`
            tabGroup.state.width = tabGroup.state.preDockState.width
            tabGroup.state.height = tabGroup.state.preDockState.height
        }
        
        tabGroup.state.docked = null
        tabGroup.state.preDockState = null
        tabGroup.element.classList.remove('wm-docked')
    }
    
    /**
     * Setup resizing for tab group
     */
    setupTabGroupResizing(tabGroup) {
        const handles = tabGroup.element.querySelectorAll('.wm-resize-handle')
        
        handles.forEach(handle => {
            let isResizing = false
            let startX, startY, startWidth, startHeight, startLeft, startTop
            let resizeType = ''
            
            const onStart = (e) => {
                isResizing = true
                tabGroup.element.classList.add('wm-resizing')
                
                // Detect resize type from class name - check compound directions first
                const className = handle.className
                if (className.includes('nw')) resizeType = 'nw'
                else if (className.includes('ne')) resizeType = 'ne'
                else if (className.includes('sw')) resizeType = 'sw'
                else if (className.includes('se')) resizeType = 'se'
                else if (className.includes('-n')) resizeType = 'n'
                else if (className.includes('-s')) resizeType = 's'
                else if (className.includes('-e')) resizeType = 'e'
                else if (className.includes('-w')) resizeType = 'w'
                
                const clientX = e.touches ? e.touches[0].clientX : e.clientX
                const clientY = e.touches ? e.touches[0].clientY : e.clientY
                
                startX = clientX
                startY = clientY
                startWidth = tabGroup.element.offsetWidth
                startHeight = tabGroup.element.offsetHeight
                startLeft = tabGroup.element.offsetLeft
                startTop = tabGroup.element.offsetTop
                
                e.preventDefault()
                e.stopPropagation()
            }
            
            const onMove = (e) => {
                if (!isResizing) return
                
                const clientX = e.touches ? e.touches[0].clientX : e.clientX
                const clientY = e.touches ? e.touches[0].clientY : e.clientY
                
                const deltaX = clientX - startX
                const deltaY = clientY - startY
                
                let newWidth = startWidth
                let newHeight = startHeight
                let newLeft = startLeft
                let newTop = startTop
                
                const minWidth = 250
                const minHeight = 150
                
                // Handle east (right) resize
                if (resizeType.includes('e')) {
                    newWidth = Math.max(minWidth, startWidth + deltaX)
                }
                // Handle west (left) resize
                if (resizeType.includes('w')) {
                    const proposedWidth = startWidth - deltaX
                    if (proposedWidth >= minWidth) {
                        newWidth = proposedWidth
                        newLeft = startLeft + deltaX
                    }
                }
                // Handle south (bottom) resize
                if (resizeType.includes('s')) {
                    newHeight = Math.max(minHeight, startHeight + deltaY)
                }
                // Handle north (top) resize
                if (resizeType.includes('n')) {
                    const proposedHeight = startHeight - deltaY
                    if (proposedHeight >= minHeight) {
                        newHeight = proposedHeight
                        newTop = startTop + deltaY
                    }
                }
                
                tabGroup.element.style.width = `${newWidth}px`
                tabGroup.element.style.height = `${newHeight}px`
                tabGroup.element.style.left = `${newLeft}px`
                tabGroup.element.style.top = `${newTop}px`
                tabGroup.state.width = newWidth
                tabGroup.state.height = newHeight
                tabGroup.state.x = newLeft
                tabGroup.state.y = newTop
            }
            
            const onEnd = () => {
                if (!isResizing) return
                isResizing = false
                tabGroup.element.classList.remove('wm-resizing')
            }
            
            handle.addEventListener('mousedown', onStart)
            handle.addEventListener('touchstart', onStart, { passive: false })
            document.addEventListener('mousemove', onMove)
            document.addEventListener('touchmove', onMove, { passive: false })
            document.addEventListener('mouseup', onEnd)
            document.addEventListener('touchend', onEnd)
        })
    }
    
    /**
     * Setup dragging for individual tabs (to detach)
     */
    setupTabDragging(tabEl, windowId, tabGroup) {
        let isDragging = false
        let startX, startY
        let dragThreshold = 20
        let hasMoved = false
        
        const onStart = (e) => {
            if (e.target.closest('.wm-tab-close')) return
            
            isDragging = true
            hasMoved = false
            
            const clientX = e.touches ? e.touches[0].clientX : e.clientX
            const clientY = e.touches ? e.touches[0].clientY : e.clientY
            
            startX = clientX
            startY = clientY
        }
        
        const onMove = (e) => {
            if (!isDragging) return
            
            const clientX = e.touches ? e.touches[0].clientX : e.clientX
            const clientY = e.touches ? e.touches[0].clientY : e.clientY
            
            const deltaX = Math.abs(clientX - startX)
            const deltaY = Math.abs(clientY - startY)
            
            // If dragged far enough, detach the tab and continue dragging as window
            if (!hasMoved && (deltaX > dragThreshold || deltaY > dragThreshold)) {
                hasMoved = true
                isDragging = false
                
                // Only detach if more than one tab
                if (tabGroup.tabs.length > 1) {
                    // Detach and immediately start window dragging
                    this.detachAndStartDragging(windowId, clientX, clientY)
                }
            }
        }
        
        const onEnd = () => {
            isDragging = false
            hasMoved = false
        }
        
        tabEl.addEventListener('mousedown', onStart)
        tabEl.addEventListener('touchstart', onStart, { passive: true })
        document.addEventListener('mousemove', onMove)
        document.addEventListener('touchmove', onMove, { passive: true })
        document.addEventListener('mouseup', onEnd)
        document.addEventListener('touchend', onEnd)
    }
    
    /**
     * Detach a window from tab group and immediately start dragging it
     */
    detachAndStartDragging(windowId, clientX, clientY) {
        const win = this.windows.get(windowId)
        if (!win) return
        
        // Detach from tab group
        this.detachFromTabGroup(windowId)
        
        // Position window centered under cursor
        const width = win.element.offsetWidth
        const height = win.element.offsetHeight
        const newX = clientX - width / 2
        const newY = clientY - 20 // Position near top of window under cursor
        
        win.element.style.left = `${newX}px`
        win.element.style.top = `${newY}px`
        win.state.x = newX
        win.state.y = newY
        
        // Trigger synthetic drag start on the window
        this.startWindowDrag(win, clientX, clientY)
    }
    
    /**
     * Programmatically start dragging a window
     */
    startWindowDrag(windowInstance, clientX, clientY) {
        const { element, state, config, id } = windowInstance
        
        element.classList.add('wm-dragging')
        this.focusWindow(id)
        
        let startX = clientX
        let startY = clientY
        let startLeft = element.offsetLeft
        let startTop = element.offsetTop
        
        const onMove = (e) => {
            const cx = e.touches ? e.touches[0].clientX : e.clientX
            const cy = e.touches ? e.touches[0].clientY : e.clientY
            
            let newX = startLeft + (cx - startX)
            let newY = startTop + (cy - startY)
            
            // Check for tab merge target
            const tabTarget = this.detectTabMergeTarget(id, cx, cy)
            this.showTabMergePreview(tabTarget)
            
            // Check for edge snap zones
            if (!tabTarget) {
                const snapZone = this.detectEdgeSnapZone(cx, cy)
                this.showSnapPreview(snapZone)
            } else {
                this.hideSnapPreview()
            }
            
            // Check for window snapping
            const windowSnap = this.detectWindowSnap(id, newX, newY, element.offsetWidth, element.offsetHeight)
            if (windowSnap.x !== null) newX = windowSnap.x
            if (windowSnap.y !== null) newY = windowSnap.y
            
            // Keep titlebar visible
            newY = Math.max(0, newY)
            
            element.style.left = `${newX}px`
            element.style.top = `${newY}px`
            state.x = newX
            state.y = newY
            
            if (config.onMove) config.onMove(windowInstance)
        }
        
        const onEnd = () => {
            element.classList.remove('wm-dragging')
            
            // Check if we should merge into a tab group
            if (this.currentTabTarget) {
                this.mergeIntoTabGroup(id, this.currentTabTarget)
                this.hideTabMergePreview()
                this.hideSnapPreview()
            } else if (this.currentSnapZone) {
                // Check if we should dock to an edge
                this.dockWindowToZone(id, this.currentSnapZone)
            }
            
            this.hideSnapPreview()
            this.hideTabMergePreview()
            this.saveWindowState(id)
            
            // Clean up listeners
            document.removeEventListener('mousemove', onMove)
            document.removeEventListener('touchmove', onMove)
            document.removeEventListener('mouseup', onEnd)
            document.removeEventListener('touchend', onEnd)
        }
        
        document.addEventListener('mousemove', onMove)
        document.addEventListener('touchmove', onMove, { passive: false })
        document.addEventListener('mouseup', onEnd)
        document.addEventListener('touchend', onEnd)
    }
    
    /**
     * Dock a tab group to a screen zone
     */
    dockTabGroupToZone(groupId, zone) {
        const tabGroup = this.tabGroups.get(groupId)
        if (!tabGroup) return
        
        const bottomNavHeight = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--bottom-nav-height') || '64')
        const screenWidth = window.innerWidth
        const screenHeight = window.innerHeight - bottomNavHeight
        
        // Save pre-dock state
        if (!tabGroup.state.preDockState) {
            tabGroup.state.preDockState = {
                x: tabGroup.state.x,
                y: tabGroup.state.y,
                width: tabGroup.state.width,
                height: tabGroup.state.height
            }
        }
        
        let dockStyle = {}
        
        switch (zone) {
            case 'left':
                dockStyle = { x: 0, y: 0, width: screenWidth / 2, height: screenHeight }
                break
            case 'right':
                dockStyle = { x: screenWidth / 2, y: 0, width: screenWidth / 2, height: screenHeight }
                break
            case 'top':
                dockStyle = { x: 0, y: 0, width: screenWidth, height: screenHeight }
                break
            case 'top-left':
                dockStyle = { x: 0, y: 0, width: screenWidth / 2, height: screenHeight / 2 }
                break
            case 'top-right':
                dockStyle = { x: screenWidth / 2, y: 0, width: screenWidth / 2, height: screenHeight / 2 }
                break
            case 'bottom-left':
                dockStyle = { x: 0, y: screenHeight / 2, width: screenWidth / 2, height: screenHeight / 2 }
                break
            case 'bottom-right':
                dockStyle = { x: screenWidth / 2, y: screenHeight / 2, width: screenWidth / 2, height: screenHeight / 2 }
                break
        }
        
        tabGroup.element.style.left = `${dockStyle.x}px`
        tabGroup.element.style.top = `${dockStyle.y}px`
        tabGroup.element.style.width = `${dockStyle.width}px`
        tabGroup.element.style.height = `${dockStyle.height}px`
        
        tabGroup.state.x = dockStyle.x
        tabGroup.state.y = dockStyle.y
        tabGroup.state.width = dockStyle.width
        tabGroup.state.height = dockStyle.height
        tabGroup.state.docked = zone
        
        tabGroup.element.classList.add('wm-docked')
    }
    
    // ==================== END TAB GROUP METHODS ====================
    
    setupResizing(windowInstance) {
        const { element, state, config, id } = windowInstance
        const handles = element.querySelectorAll('.wm-resize-handle')
        
        handles.forEach(handle => {
            let isResizing = false
            let startX, startY, startWidth, startHeight, startLeft, startTop
            let resizeType = ''
            
            const onStart = (e) => {
                if (state.maximized) return
                
                isResizing = true
                element.classList.add('wm-resizing')
                
                // Detect resize type from class name - check compound directions first
                const className = handle.className
                if (className.includes('nw')) resizeType = 'nw'
                else if (className.includes('ne')) resizeType = 'ne'
                else if (className.includes('sw')) resizeType = 'sw'
                else if (className.includes('se')) resizeType = 'se'
                else if (className.includes('-n')) resizeType = 'n'
                else if (className.includes('-s')) resizeType = 's'
                else if (className.includes('-e')) resizeType = 'e'
                else if (className.includes('-w')) resizeType = 'w'
                
                const clientX = e.touches ? e.touches[0].clientX : e.clientX
                const clientY = e.touches ? e.touches[0].clientY : e.clientY
                
                startX = clientX
                startY = clientY
                startWidth = element.offsetWidth
                startHeight = element.offsetHeight
                startLeft = element.offsetLeft
                startTop = element.offsetTop
                
                e.preventDefault()
                e.stopPropagation()
            }
            
            const onMove = (e) => {
                if (!isResizing) return
                
                const clientX = e.touches ? e.touches[0].clientX : e.clientX
                const clientY = e.touches ? e.touches[0].clientY : e.clientY
                
                const deltaX = clientX - startX
                const deltaY = clientY - startY
                
                let newWidth = startWidth
                let newHeight = startHeight
                let newLeft = startLeft
                let newTop = startTop
                
                // Handle east (right) resize
                if (resizeType.includes('e')) {
                    newWidth = Math.max(config.minWidth, startWidth + deltaX)
                }
                // Handle west (left) resize
                if (resizeType.includes('w')) {
                    const proposedWidth = startWidth - deltaX
                    if (proposedWidth >= config.minWidth) {
                        newWidth = proposedWidth
                        newLeft = startLeft + deltaX
                    }
                }
                // Handle south (bottom) resize
                if (resizeType.includes('s')) {
                    newHeight = Math.max(config.minHeight, startHeight + deltaY)
                }
                // Handle north (top) resize
                if (resizeType.includes('n')) {
                    const proposedHeight = startHeight - deltaY
                    if (proposedHeight >= config.minHeight) {
                        newHeight = proposedHeight
                        newTop = startTop + deltaY
                    }
                }
                
                element.style.width = `${newWidth}px`
                element.style.height = `${newHeight}px`
                element.style.left = `${newLeft}px`
                element.style.top = `${newTop}px`
                state.width = newWidth
                state.height = newHeight
                state.x = newLeft
                state.y = newTop
                
                if (config.onResize) config.onResize(windowInstance)
            }
            
            const onEnd = () => {
                if (!isResizing) return
                isResizing = false
                element.classList.remove('wm-resizing')
                this.saveWindowState(id)
            }
            
            handle.addEventListener('mousedown', onStart)
            handle.addEventListener('touchstart', onStart, { passive: false })
            document.addEventListener('mousemove', onMove)
            document.addEventListener('touchmove', onMove, { passive: false })
            document.addEventListener('mouseup', onEnd)
            document.addEventListener('touchend', onEnd)
        })
    }
    
    focusWindow(id) {
        const windowInstance = this.windows.get(id)
        if (!windowInstance) return
        
        // On mobile panels, open them instead of focusing
        if (windowInstance.isMobilePanel) {
            this.openMobilePanel(id)
            return
        }
        
        // Remove from current position and add to end (top)
        const index = this.windowOrder.indexOf(id)
        if (index > -1) {
            this.windowOrder.splice(index, 1)
        }
        this.windowOrder.push(id)
        
        // Update z-indices
        this.windowOrder.forEach((winId, i) => {
            const win = this.windows.get(winId)
            if (win && !win.isMobilePanel) {
                win.element.style.zIndex = this.baseZIndex + i
                win.element.classList.remove('wm-focused')
            }
        })
        
        windowInstance.element.classList.add('wm-focused')
    }
    
    minimizeWindow(id) {
        const windowInstance = this.windows.get(id)
        if (!windowInstance || windowInstance.state.minimized) return
        
        windowInstance.state.minimized = true
        windowInstance.element.classList.add('wm-minimized')
        
        // Create dock button
        const dockBtn = document.createElement('button')
        dockBtn.className = 'wm-dock-btn'
        dockBtn.dataset.windowId = id
        dockBtn.innerHTML = `
            ${windowInstance.config.icon || ''}
            <span>${windowInstance.config.title}</span>
        `
        dockBtn.addEventListener('click', () => this.restoreWindow(id))
        this.dock.appendChild(dockBtn)
        
        if (windowInstance.config.onMinimize) {
            windowInstance.config.onMinimize(windowInstance)
        }
    }
    
    maximizeWindow(id) {
        const windowInstance = this.windows.get(id)
        if (!windowInstance || windowInstance.state.maximized) return
        
        // Store current state
        windowInstance.state.prevState = {
            x: windowInstance.state.x,
            y: windowInstance.state.y,
            width: windowInstance.state.width,
            height: windowInstance.state.height
        }
        
        windowInstance.state.maximized = true
        windowInstance.element.classList.add('wm-maximized')
        
        // Update maximize button
        const maxBtn = windowInstance.element.querySelector('.wm-maximize')
        if (maxBtn) maxBtn.innerHTML = '❐'
        
        if (windowInstance.config.onMaximize) {
            windowInstance.config.onMaximize(windowInstance)
        }
    }
    
    restoreWindow(id) {
        const windowInstance = this.windows.get(id)
        if (!windowInstance) return
        
        // Restore from minimized
        if (windowInstance.state.minimized) {
            windowInstance.state.minimized = false
            windowInstance.element.classList.remove('wm-minimized')
            
            // Remove dock button
            const dockBtn = this.dock.querySelector(`[data-window-id="${id}"]`)
            if (dockBtn) dockBtn.remove()
            
            this.focusWindow(id)
        }
        
        // Restore from maximized
        if (windowInstance.state.maximized) {
            windowInstance.state.maximized = false
            windowInstance.element.classList.remove('wm-maximized')
            
            // Restore previous state
            if (windowInstance.state.prevState) {
                const prev = windowInstance.state.prevState
                windowInstance.element.style.left = `${prev.x}px`
                windowInstance.element.style.top = `${prev.y}px`
                windowInstance.element.style.width = `${prev.width}px`
                windowInstance.element.style.height = `${prev.height}px`
                windowInstance.state.x = prev.x
                windowInstance.state.y = prev.y
                windowInstance.state.width = prev.width
                windowInstance.state.height = prev.height
            }
            
            // Update maximize button
            const maxBtn = windowInstance.element.querySelector('.wm-maximize')
            if (maxBtn) maxBtn.innerHTML = '□'
        }
    }
    
    // ==================== Mobile Panel System ====================
    
    /**
     * Create a mobile-friendly slide-up panel
     */
    createMobilePanel(id, config) {
        // Create the panel element
        const panelEl = document.createElement('div')
        panelEl.className = 'wm-mobile-panel'
        panelEl.id = `mobile-${id}`
        panelEl.dataset.windowId = id
        
        // Panel HTML
        panelEl.innerHTML = `
            <div class="wm-mobile-panel-header">
                <div class="wm-mobile-panel-handle"></div>
                ${config.icon ? `<span class="wm-mobile-panel-icon">${config.icon}</span>` : ''}
                <span class="wm-mobile-panel-title">${config.title}</span>
                <button class="wm-mobile-panel-close" title="Close">×</button>
            </div>
            <div class="wm-mobile-panel-content ${config.contentClass}"></div>
        `
        
        const contentEl = panelEl.querySelector('.wm-mobile-panel-content')
        
        // Set content
        if (config.content) {
            if (typeof config.content === 'string') {
                contentEl.innerHTML = config.content
            } else if (config.content instanceof HTMLElement) {
                contentEl.appendChild(config.content)
            }
        }
        
        // Add to container
        this.mobilePanelContainer.appendChild(panelEl)
        
        // Setup close button
        const closeBtn = panelEl.querySelector('.wm-mobile-panel-close')
        closeBtn.addEventListener('click', () => {
            this.closeMobilePanel(id)
            if (config.onClose) config.onClose(panelInstance)
        })
        
        // Setup swipe-to-close
        this.setupMobilePanelSwipe(panelEl, id)
        
        // Create panel instance with same API as window
        const panelInstance = {
            id,
            element: panelEl,
            content: contentEl,
            config,
            isMobilePanel: true,
            state: {
                minimized: false,
                maximized: false,
                docked: null,
                preDockState: null,
                tabGroupId: null,
                x: 0,
                y: 0,
                width: window.innerWidth,
                height: config.height || 400,
                prevState: null
            },
            
            // API methods (same interface as windows)
            setTitle: (title) => {
                panelEl.querySelector('.wm-mobile-panel-title').textContent = title
                config.title = title
            },
            setContent: (content) => {
                if (typeof content === 'string') {
                    contentEl.innerHTML = content
                } else if (content instanceof HTMLElement) {
                    contentEl.innerHTML = ''
                    contentEl.appendChild(content)
                }
            },
            appendContent: (content) => {
                if (typeof content === 'string') {
                    contentEl.innerHTML += content
                } else if (content instanceof HTMLElement) {
                    contentEl.appendChild(content)
                }
            },
            getContentElement: () => contentEl,
            close: () => this.closeMobilePanel(id),
            minimize: () => this.closeMobilePanel(id), // On mobile, minimize = close
            maximize: () => {}, // No-op on mobile
            restore: () => {},
            focus: () => this.openMobilePanel(id),
            show: () => this.openMobilePanel(id),
            hide: () => this.closeMobilePanel(id),
            isMinimized: () => !panelEl.classList.contains('active'),
            isMaximized: () => false,
            isVisible: () => panelEl.classList.contains('active'),
            isDocked: () => false,
            isInTabGroup: () => false,
            getTabGroup: () => null,
            detachFromTabs: () => {},
            mergeWith: () => {},
            setPosition: () => {},
            getState: () => ({ ...panelInstance.state })
        }
        
        // Store in both maps for compatibility
        this.windows.set(id, panelInstance)
        this.mobilePanels.set(id, panelInstance)
        
        // Call onCreate callback
        if (config.onCreate) config.onCreate(panelInstance)
        
        // Auto-open the panel
        if (config.autoFocus !== false) {
            this.openMobilePanel(id)
        }
        
        return panelInstance
    }
    
    /**
     * Setup swipe-down-to-close gesture for mobile panels
     */
    setupMobilePanelSwipe(panelEl, id) {
        const header = panelEl.querySelector('.wm-mobile-panel-header')
        let startY = 0
        let currentY = 0
        let isDragging = false
        
        const onStart = (e) => {
            isDragging = true
            startY = e.touches ? e.touches[0].clientY : e.clientY
            currentY = startY
            panelEl.style.transition = 'none'
        }
        
        const onMove = (e) => {
            if (!isDragging) return
            currentY = e.touches ? e.touches[0].clientY : e.clientY
            const deltaY = currentY - startY
            
            // Only allow dragging down
            if (deltaY > 0) {
                panelEl.style.transform = `translateY(${deltaY}px)`
            }
        }
        
        const onEnd = () => {
            if (!isDragging) return
            isDragging = false
            panelEl.style.transition = ''
            
            const deltaY = currentY - startY
            
            // If dragged more than 100px down, close the panel
            if (deltaY > 100) {
                this.closeMobilePanel(id)
            } else {
                panelEl.style.transform = ''
            }
        }
        
        header.addEventListener('touchstart', onStart, { passive: true })
        header.addEventListener('mousedown', onStart)
        document.addEventListener('touchmove', onMove, { passive: true })
        document.addEventListener('mousemove', onMove)
        document.addEventListener('touchend', onEnd)
        document.addEventListener('mouseup', onEnd)
    }
    
    /**
     * Open a mobile panel
     */
    openMobilePanel(id) {
        const panel = this.mobilePanels.get(id)
        if (!panel) return
        
        // Close any other open panel
        this.closeAllMobilePanels()
        
        // Show overlay and panel
        this.mobileOverlay.classList.add('active')
        panel.element.classList.add('active')
        this.activeMobilePanel = id
    }
    
    /**
     * Close a mobile panel
     */
    closeMobilePanel(id) {
        const panel = this.mobilePanels.get(id)
        if (!panel) return
        
        panel.element.classList.remove('active')
        panel.element.style.transform = ''
        
        if (this.activeMobilePanel === id) {
            this.mobileOverlay.classList.remove('active')
            this.activeMobilePanel = null
        }
    }
    
    /**
     * Close all mobile panels
     */
    closeAllMobilePanels() {
        this.mobilePanels.forEach((panel, id) => {
            panel.element.classList.remove('active')
            panel.element.style.transform = ''
        })
        this.mobileOverlay.classList.remove('active')
        this.activeMobilePanel = null
    }
    
    /**
     * Handle window resize - switch between mobile/desktop modes
     */
    handleResize() {
        // This could be enhanced to migrate windows to/from mobile panels
        // For now, existing windows stay as they are
    }
    
    // ==================== End Mobile Panel System ====================
    
    closeWindow(id) {
        const windowInstance = this.windows.get(id)
        if (!windowInstance) return
        
        // If it's a mobile panel, use mobile close
        if (windowInstance.isMobilePanel) {
            this.closeMobilePanel(id)
            // Remove from tracking
            this.mobilePanels.delete(id)
            this.windows.delete(id)
            windowInstance.element.remove()
            return
        }
        
        // Call onClose callback
        if (windowInstance.config.onClose) {
            const shouldClose = windowInstance.config.onClose(windowInstance)
            if (shouldClose === false) return // Allow preventing close
        }
        
        // Remove dock button if minimized
        const dockBtn = this.dock.querySelector(`[data-window-id="${id}"]`)
        if (dockBtn) dockBtn.remove()
        
        // Remove from DOM
        windowInstance.element.remove()
        
        // Remove from tracking
        this.windows.delete(id)
        const index = this.windowOrder.indexOf(id)
        if (index > -1) {
            this.windowOrder.splice(index, 1)
        }
        
        // Clear saved state
        this.clearSavedState(id)
    }
    
    getWindow(id) {
        return this.windows.get(id)
    }
    
    getAllWindows() {
        return Array.from(this.windows.values())
    }
    
    getDefaultPosition() {
        // Cascade windows
        const offset = (this.windows.size % 10) * 30
        return {
            x: 50 + offset,
            y: 50 + offset
        }
    }
    
    // State persistence
    saveWindowState(id) {
        const windowInstance = this.windows.get(id)
        if (!windowInstance || !windowInstance.config.persistent) return
        
        const states = JSON.parse(localStorage.getItem('wm-window-states') || '{}')
        states[id] = {
            x: windowInstance.state.x,
            y: windowInstance.state.y,
            width: windowInstance.state.width,
            height: windowInstance.state.height,
            docked: windowInstance.state.docked,
            preDockState: windowInstance.state.preDockState
        }
        localStorage.setItem('wm-window-states', JSON.stringify(states))
    }
    
    getSavedState(id) {
        const states = JSON.parse(localStorage.getItem('wm-window-states') || '{}')
        return states[id]
    }
    
    clearSavedState(id) {
        const states = JSON.parse(localStorage.getItem('wm-window-states') || '{}')
        delete states[id]
        localStorage.setItem('wm-window-states', JSON.stringify(states))
    }
    
    clearAllSavedStates() {
        localStorage.removeItem('wm-window-states')
    }
    
    restoreWindowStates() {
        // Called on init - windows will pick up their states when created
    }
    
    injectStyles() {
        const style = document.createElement('style')
        style.id = 'wm-styles'
        style.textContent = `
            .wm-container {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                pointer-events: none;
                z-index: 1000;
            }
            
            .wm-window {
                position: absolute;
                background: var(--bg-secondary, #1e293b);
                border-radius: 8px;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.1);
                display: flex;
                flex-direction: column;
                pointer-events: auto;
                transition: box-shadow 0.15s ease;
                overflow: hidden;
            }
            
            .wm-window.wm-focused {
                box-shadow: 0 12px 48px rgba(0, 0, 0, 0.4), 0 0 0 1px var(--accent, #6366f1);
            }
            
            .wm-window.wm-dragging,
            .wm-window.wm-resizing {
                opacity: 0.9;
                transition: none;
            }
            
            .wm-window.wm-minimized {
                display: none;
            }
            
            .wm-window.wm-maximized {
                left: 0 !important;
                top: 0 !important;
                width: 100% !important;
                height: calc(100% - var(--bottom-nav-height, 64px) - env(safe-area-inset-bottom, 0px)) !important;
                border-radius: 0;
            }
            
            .wm-window.wm-hidden {
                display: none;
            }
            
            .wm-titlebar {
                display: flex;
                align-items: center;
                padding: 8px 12px;
                background: var(--bg-tertiary, #334155);
                border-bottom: 1px solid rgba(255, 255, 255, 0.05);
                cursor: move;
                user-select: none;
                flex-shrink: 0;
            }
            
            .wm-icon {
                margin-right: 8px;
                font-size: 14px;
                display: flex;
                align-items: center;
            }
            
            .wm-icon svg {
                width: 16px;
                height: 16px;
            }
            
            .wm-title {
                flex: 1;
                font-size: 13px;
                font-weight: 600;
                color: var(--text-primary, #f1f5f9);
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            
            .wm-controls {
                display: flex;
                gap: 4px;
                margin-left: 8px;
            }
            
            .wm-btn {
                width: 24px;
                height: 24px;
                border: none;
                background: transparent;
                border-radius: 4px;
                color: var(--text-secondary, #94a3b8);
                font-size: 14px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.15s ease;
            }
            
            .wm-btn:hover {
                background: rgba(255, 255, 255, 0.1);
                color: var(--text-primary, #f1f5f9);
            }
            
            .wm-close:hover {
                background: #ef4444;
                color: white;
            }
            
            .wm-content {
                flex: 1;
                overflow: auto;
                padding: 12px;
            }
            
            .wm-content.no-padding {
                padding: 0;
            }
            
            /* Resize handles */
            .wm-resize-handle {
                position: absolute;
                background: transparent;
                z-index: 10;
            }
            
            .wm-resize-se {
                right: 0;
                bottom: 0;
                width: 20px;
                height: 20px;
                cursor: se-resize;
            }
            
            .wm-resize-e {
                right: 0;
                top: 0;
                width: 12px;
                height: calc(100% - 20px);
                cursor: e-resize;
            }
            
            .wm-resize-s {
                bottom: 0;
                left: 0;
                width: calc(100% - 20px);
                height: 12px;
                cursor: s-resize;
            }
            
            .wm-resize-n {
                top: 0;
                left: 0;
                width: calc(100% - 20px);
                height: 8px;
                cursor: n-resize;
            }
            
            .wm-resize-w {
                left: 0;
                top: 0;
                width: 12px;
                height: calc(100% - 20px);
                cursor: w-resize;
            }
            
            .wm-resize-nw {
                left: 0;
                top: 0;
                width: 20px;
                height: 20px;
                cursor: nw-resize;
            }
            
            .wm-resize-ne {
                right: 0;
                top: 0;
                width: 20px;
                height: 20px;
                cursor: ne-resize;
            }
            
            .wm-resize-sw {
                left: 0;
                bottom: 0;
                width: 20px;
                height: 20px;
                cursor: sw-resize;
            }
            
            /* Dock for minimized windows */
            .wm-dock {
                position: fixed;
                bottom: calc(var(--bottom-nav-height, 64px) + 8px + env(safe-area-inset-bottom, 0px));
                left: 50%;
                transform: translateX(-50%);
                display: flex;
                gap: 8px;
                padding: 8px;
                background: var(--bg-secondary, #1e293b);
                border-radius: 12px;
                box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
                z-index: 999;
                pointer-events: auto;
            }
            
            .wm-dock:empty {
                display: none;
            }
            
            .wm-dock-btn {
                display: flex;
                align-items: center;
                gap: 6px;
                padding: 8px 12px;
                background: var(--bg-tertiary, #334155);
                border: none;
                border-radius: 8px;
                color: var(--text-primary, #f1f5f9);
                font-size: 12px;
                cursor: pointer;
                transition: all 0.15s ease;
            }
            
            .wm-dock-btn:hover {
                background: var(--accent, #6366f1);
            }
            
            .wm-dock-btn svg {
                width: 14px;
                height: 14px;
            }
            
            /* Scrollbar styling for window content */
            .wm-content::-webkit-scrollbar {
                width: 8px;
                height: 8px;
            }
            
            .wm-content::-webkit-scrollbar-track {
                background: transparent;
            }
            
            .wm-content::-webkit-scrollbar-thumb {
                background: var(--text-tertiary, #64748b);
                border-radius: 4px;
            }
            
            .wm-content::-webkit-scrollbar-thumb:hover {
                background: var(--text-secondary, #94a3b8);
            }
            
            /* Snap preview overlay */
            .wm-snap-preview {
                position: fixed;
                background: var(--accent, #6366f1);
                opacity: 0;
                border-radius: 8px;
                pointer-events: none;
                z-index: 998;
                transition: opacity 0.15s ease, left 0.1s ease, top 0.1s ease, width 0.1s ease, height 0.1s ease;
            }
            
            .wm-snap-preview-visible {
                opacity: 0.2;
            }
            
            /* Docked window state */
            .wm-window.wm-docked {
                border-radius: 0;
                transition: all 0.2s ease;
            }
            
            /* Snap indicator lines (shown when near another window) */
            .wm-snap-line {
                position: fixed;
                background: var(--accent, #6366f1);
                z-index: 999;
                pointer-events: none;
            }
            
            .wm-snap-line-h {
                height: 2px;
                width: 100%;
            }
            
            .wm-snap-line-v {
                width: 2px;
                height: 100%;
            }
            
            /* Tab Groups */
            .wm-tab-group {
                position: absolute;
                background: var(--bg-secondary, #1e293b);
                border-radius: 8px;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.1);
                display: flex;
                flex-direction: column;
                pointer-events: auto;
                overflow: hidden;
            }
            
            .wm-tab-group.wm-dragging {
                opacity: 0.9;
            }
            
            .wm-tab-group.wm-docked {
                border-radius: 0;
            }
            
            .wm-tab-bar-container {
                display: flex;
                align-items: stretch;
                background: var(--bg-tertiary, #334155);
                border-bottom: 1px solid rgba(255, 255, 255, 0.05);
                cursor: move;
            }
            
            .wm-tab-bar {
                display: flex;
                flex: 1;
                padding: 4px 4px 0;
                gap: 2px;
                overflow-x: auto;
                min-height: 36px;
                align-items: flex-end;
            }
            
            .wm-tab-bar::-webkit-scrollbar {
                height: 4px;
            }
            
            .wm-tab-bar::-webkit-scrollbar-thumb {
                background: var(--text-tertiary, #64748b);
                border-radius: 2px;
            }
            
            .wm-tab-group-close {
                width: 32px;
                display: flex;
                align-items: center;
                justify-content: center;
                background: transparent;
                border: none;
                color: var(--text-tertiary, #64748b);
                font-size: 18px;
                cursor: pointer;
                transition: all 0.15s ease;
                flex-shrink: 0;
            }
            
            .wm-tab-group-close:hover {
                background: rgba(239, 68, 68, 0.2);
                color: #ef4444;
            }
            
            .wm-tab {
                display: flex;
                align-items: center;
                gap: 6px;
                padding: 8px 10px;
                background: transparent;
                border-radius: 6px 6px 0 0;
                font-size: 12px;
                color: var(--text-secondary, #94a3b8);
                cursor: pointer;
                user-select: none;
                white-space: nowrap;
                transition: all 0.15s ease;
                border: none;
                position: relative;
            }
            
            .wm-tab:hover {
                background: rgba(255, 255, 255, 0.05);
                color: var(--text-primary, #f1f5f9);
            }
            
            .wm-tab.wm-tab-active {
                background: var(--bg-secondary, #1e293b);
                color: var(--text-primary, #f1f5f9);
            }
            
            .wm-tab.wm-tab-active::after {
                content: '';
                position: absolute;
                bottom: 0;
                left: 0;
                right: 0;
                height: 2px;
                background: var(--accent, #6366f1);
            }
            
            .wm-tab-icon {
                display: flex;
                align-items: center;
            }
            
            .wm-tab-icon svg {
                width: 14px;
                height: 14px;
            }
            
            .wm-tab-title {
                max-width: 120px;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            
            .wm-tab-close {
                width: 16px;
                height: 16px;
                border: none;
                background: transparent;
                color: var(--text-tertiary, #64748b);
                font-size: 14px;
                line-height: 1;
                cursor: pointer;
                border-radius: 3px;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.15s ease;
                padding: 0;
                margin-left: 2px;
            }
            
            .wm-tab-close:hover {
                background: rgba(239, 68, 68, 0.2);
                color: #ef4444;
            }
            
            .wm-tab-content {
                flex: 1;
                overflow: hidden;
                position: relative;
            }
            
            .wm-tab-panel {
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                overflow: auto;
                padding: 12px;
            }
            
            .wm-tab-panel.no-padding {
                padding: 0;
            }
            
            /* Tab merge preview */
            .wm-tab-merge-target {
                box-shadow: 0 0 0 3px var(--accent, #6366f1), 0 8px 32px rgba(0, 0, 0, 0.3) !important;
            }
            
            /* Tab group resize handles */
            .wm-tab-group .wm-resize-handle {
                position: absolute;
                background: transparent;
            }
            
            .wm-tab-group .wm-resize-se {
                right: 0;
                bottom: 0;
                width: 16px;
                height: 16px;
                cursor: se-resize;
            }
            
            .wm-tab-group .wm-resize-e {
                right: 0;
                top: 0;
                width: 6px;
                height: calc(100% - 16px);
                cursor: e-resize;
            }
            
            .wm-tab-group .wm-resize-s {
                bottom: 0;
                left: 0;
                width: calc(100% - 16px);
                height: 6px;
                cursor: s-resize;
            }
            
            /* ==================== Mobile Panel Styles ==================== */
            
            .wm-mobile-overlay {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.5);
                opacity: 0;
                pointer-events: none;
                transition: opacity 0.3s ease;
                z-index: 1999;
            }
            
            .wm-mobile-overlay.active {
                opacity: 1;
                pointer-events: auto;
            }
            
            .wm-mobile-panel-container {
                position: fixed;
                bottom: 0;
                left: 0;
                right: 0;
                pointer-events: none;
                z-index: 2000;
            }
            
            .wm-mobile-panel {
                position: fixed;
                bottom: 0;
                left: 0;
                right: 0;
                max-height: 85vh;
                min-height: 50vh;
                background: var(--bg-secondary, #1e293b);
                border-radius: 16px 16px 0 0;
                box-shadow: 0 -4px 32px rgba(0, 0, 0, 0.3);
                transform: translateY(100%);
                transition: transform 0.3s cubic-bezier(0.32, 0.72, 0, 1);
                display: flex;
                flex-direction: column;
                pointer-events: auto;
                padding-bottom: env(safe-area-inset-bottom, 0px);
            }
            
            .wm-mobile-panel.active {
                transform: translateY(0);
            }
            
            .wm-mobile-panel-header {
                display: flex;
                align-items: center;
                padding: 12px 16px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                flex-shrink: 0;
                position: relative;
            }
            
            .wm-mobile-panel-handle {
                position: absolute;
                top: 8px;
                left: 50%;
                transform: translateX(-50%);
                width: 40px;
                height: 4px;
                background: var(--text-tertiary, #64748b);
                border-radius: 2px;
                opacity: 0.5;
            }
            
            .wm-mobile-panel-icon {
                margin-right: 10px;
                font-size: 16px;
                display: flex;
                align-items: center;
            }
            
            .wm-mobile-panel-icon svg {
                width: 20px;
                height: 20px;
            }
            
            .wm-mobile-panel-title {
                flex: 1;
                font-size: 15px;
                font-weight: 600;
                color: var(--text-primary, #f1f5f9);
                margin-top: 8px;
            }
            
            .wm-mobile-panel-close {
                width: 36px;
                height: 36px;
                border: none;
                background: var(--bg-tertiary, #334155);
                color: var(--text-secondary, #94a3b8);
                font-size: 20px;
                font-weight: 300;
                cursor: pointer;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.15s ease;
                margin-top: 8px;
            }
            
            .wm-mobile-panel-close:active {
                background: rgba(239, 68, 68, 0.2);
                color: #ef4444;
                transform: scale(0.95);
            }
            
            .wm-mobile-panel-content {
                flex: 1;
                overflow-y: auto;
                overflow-x: hidden;
                padding: 16px;
                -webkit-overflow-scrolling: touch;
            }
            
            .wm-mobile-panel-content.no-padding {
                padding: 0;
            }
            
            /* Mobile panel content specific styles */
            .wm-mobile-panel .histogram-container,
            .wm-mobile-panel .color-info-container,
            .wm-mobile-panel .image-stats-container {
                width: 100%;
                max-width: 100%;
            }
            
            .wm-mobile-panel canvas {
                width: 100% !important;
                max-width: 100%;
            }
            
            /* Hide desktop windows on mobile */
            @media (max-width: 768px) {
                .wm-container {
                    display: none;
                }
                
                .wm-dock {
                    display: none;
                }
                
                .wm-snap-preview {
                    display: none;
                }
            }
            
            /* Hide mobile panels on desktop */
            @media (min-width: 769px) {
                .wm-mobile-overlay,
                .wm-mobile-panel-container,
                .wm-mobile-panel {
                    display: none !important;
                }
            }
        `
        document.head.appendChild(style)
    }
}

// Create and export singleton instance
const windowManager = new WindowManager()

export { windowManager, WindowManager }
