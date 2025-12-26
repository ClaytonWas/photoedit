/**
 * Color Info Panel
 * 
 * Shows real-time color information:
 * - Color at cursor position
 * - RGB/HSL/HEX values
 * - Color swatch preview
 * - Color picker history
 */

import { windowManager } from '../core/windowManager.js'

let colorInfoWindow = null
let imageEditor = null
let canvas = null
let ctx = null
let colorHistory = []
const MAX_HISTORY = 12
let eyedropperActive = false
let boundHandleCanvasMove = null
let boundHandleCanvasClick = null

/**
 * Initialize with editor reference
 */
export function initColorInfo(editor) {
    imageEditor = editor
}

/**
 * Convert RGB to HSL
 */
function rgbToHsl(r, g, b) {
    r /= 255
    g /= 255
    b /= 255
    
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    let h, s, l = (max + min) / 2
    
    if (max === min) {
        h = s = 0
    } else {
        const d = max - min
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
        
        switch (max) {
            case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
            case g: h = ((b - r) / d + 2) / 6; break
            case b: h = ((r - g) / d + 4) / 6; break
        }
    }
    
    return {
        h: Math.round(h * 360),
        s: Math.round(s * 100),
        l: Math.round(l * 100)
    }
}

/**
 * Convert RGB to HEX
 */
function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(x => {
        const hex = x.toString(16)
        return hex.length === 1 ? '0' + hex : hex
    }).join('').toUpperCase()
}

/**
 * Get color at canvas position
 */
function getColorAtPosition(x, y) {
    const editor = window.getActiveEditor?.() || imageEditor
    if (!editor || !editor.canvas) return null
    
    const canvasEl = editor.canvas
    const ctx = canvasEl.getContext('2d')
    
    // Ensure coordinates are within bounds
    if (x < 0 || x >= canvasEl.width || y < 0 || y >= canvasEl.height) {
        return null
    }
    
    const pixel = ctx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data
    
    return {
        r: pixel[0],
        g: pixel[1],
        b: pixel[2],
        a: pixel[3]
    }
}

/**
 * Update color display
 */
function updateColorDisplay(color) {
    if (!colorInfoWindow) return
    
    const content = colorInfoWindow.getContentElement()
    if (!content) return
    
    const swatchEl = content.querySelector('.color-swatch')
    const rgbEl = content.querySelector('.color-rgb')
    const hslEl = content.querySelector('.color-hsl')
    const hexEl = content.querySelector('.color-hex')
    const alphaEl = content.querySelector('.color-alpha')
    
    if (!color) {
        if (swatchEl) swatchEl.style.background = 'transparent'
        if (rgbEl) rgbEl.textContent = '--'
        if (hslEl) hslEl.textContent = '--'
        if (hexEl) hexEl.textContent = '--'
        if (alphaEl) alphaEl.textContent = '--'
        return
    }
    
    const hex = rgbToHex(color.r, color.g, color.b)
    const hsl = rgbToHsl(color.r, color.g, color.b)
    
    if (swatchEl) swatchEl.style.background = hex
    if (rgbEl) rgbEl.textContent = `${color.r}, ${color.g}, ${color.b}`
    if (hslEl) hslEl.textContent = `${hsl.h}°, ${hsl.s}%, ${hsl.l}%`
    if (hexEl) hexEl.textContent = hex
    if (alphaEl) alphaEl.textContent = `${Math.round(color.a / 255 * 100)}%`
}

/**
 * Add color to history
 */
function addToHistory(color) {
    if (!color) return
    
    const hex = rgbToHex(color.r, color.g, color.b)
    
    // Don't add duplicates
    if (colorHistory.length > 0 && colorHistory[0].hex === hex) {
        return
    }
    
    colorHistory.unshift({ ...color, hex })
    
    if (colorHistory.length > MAX_HISTORY) {
        colorHistory.pop()
    }
    
    updateHistoryDisplay()
}

/**
 * Update history display
 */
function updateHistoryDisplay() {
    if (!colorInfoWindow) return
    
    const content = colorInfoWindow.getContentElement()
    const historyEl = content?.querySelector('.color-history-swatches')
    if (!historyEl) return
    
    historyEl.innerHTML = colorHistory.map((c, i) => `
        <button class="history-swatch" data-index="${i}" style="background: ${c.hex}" title="${c.hex}"></button>
    `).join('')
    
    // Add click handlers
    historyEl.querySelectorAll('.history-swatch').forEach(swatch => {
        swatch.addEventListener('click', () => {
            const index = parseInt(swatch.dataset.index)
            const color = colorHistory[index]
            if (color) {
                updateColorDisplay(color)
                copyToClipboard(color.hex)
            }
        })
    })
}

/**
 * Copy text to clipboard
 */
async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text)
        showCopyFeedback()
    } catch (err) {
        console.error('Failed to copy:', err)
    }
}

/**
 * Show copy feedback
 */
function showCopyFeedback() {
    if (!colorInfoWindow) return
    
    const content = colorInfoWindow.getContentElement()
    const feedback = content?.querySelector('.copy-feedback')
    if (!feedback) return
    
    feedback.classList.add('show')
    setTimeout(() => feedback.classList.remove('show'), 1500)
}

/**
 * Handle mouse move on canvas
 */
function handleCanvasMove(e) {
    const editor = window.getActiveEditor?.() || imageEditor
    if (!editor || !editor.canvas) return
    
    const canvasEl = editor.canvas
    const rect = canvasEl.getBoundingClientRect()
    
    // Calculate position relative to canvas
    const scaleX = canvasEl.width / rect.width
    const scaleY = canvasEl.height / rect.height
    
    const x = (e.clientX - rect.left) * scaleX
    const y = (e.clientY - rect.top) * scaleY
    
    const color = getColorAtPosition(x, y)
    updateColorDisplay(color)
    
    // Update position display
    const content = colorInfoWindow?.getContentElement()
    const posEl = content?.querySelector('.color-position')
    if (posEl) {
        posEl.textContent = color ? `${Math.floor(x)}, ${Math.floor(y)}` : '--'
    }
}

/**
 * Handle click on canvas to add to history
 */
function handleCanvasClick(e) {
    const editor = window.getActiveEditor?.() || imageEditor
    if (!editor || !editor.canvas) return
    
    const canvasEl = editor.canvas
    const rect = canvasEl.getBoundingClientRect()
    
    const scaleX = canvasEl.width / rect.width
    const scaleY = canvasEl.height / rect.height
    
    const x = (e.clientX - rect.left) * scaleX
    const y = (e.clientY - rect.top) * scaleY
    
    const color = getColorAtPosition(x, y)
    if (color) {
        addToHistory(color)
    }
}

/**
 * Create color info content
 */
function createColorInfoContent() {
    const content = document.createElement('div')
    content.className = 'color-info-panel'
    content.innerHTML = `
        <div class="color-preview-section">
            <div class="color-swatch-container">
                <div class="color-swatch"></div>
                <span class="copy-feedback">Copied!</span>
            </div>
            <div class="color-values">
                <div class="color-value-row">
                    <span class="color-label">Position</span>
                    <span class="color-value color-position">--</span>
                </div>
                <div class="color-value-row">
                    <span class="color-label">RGB</span>
                    <span class="color-value color-rgb">--</span>
                </div>
                <div class="color-value-row">
                    <span class="color-label">HSL</span>
                    <span class="color-value color-hsl">--</span>
                </div>
                <div class="color-value-row clickable" data-copy="hex">
                    <span class="color-label">HEX</span>
                    <span class="color-value color-hex">--</span>
                </div>
                <div class="color-value-row">
                    <span class="color-label">Alpha</span>
                    <span class="color-value color-alpha">--</span>
                </div>
            </div>
        </div>
        <div class="eyedropper-section">
            <button class="eyedropper-btn" title="Pick color from image">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21.17 2.83a2.83 2.83 0 0 0-4 0l-3.5 3.5-1.41-1.41-1.42 1.41 1.42 1.42-6.59 6.58a2 2 0 0 0-.58 1.42V18h2.24c.53 0 1.04-.21 1.41-.59l6.59-6.58 1.41 1.41 1.42-1.41-1.42-1.42 3.5-3.5a2.83 2.83 0 0 0 0-4z"></path>
                    <path d="M2 22l4-4"></path>
                </svg>
                <span class="eyedropper-text">Pick Color</span>
            </button>
        </div>
        <div class="color-history-section">
            <div class="color-history-header">
                <span>Color History</span>
                <button class="clear-history-btn" title="Clear history">Clear</button>
            </div>
            <div class="color-history-swatches"></div>
        </div>
        <div class="color-info-hint">
            Click "Pick Color" to enable eyedropper. Hover over image for color info, click to save.
        </div>
    `
    
    // Add styles
    const style = document.createElement('style')
    style.id = 'color-info-styles'
    if (!document.getElementById('color-info-styles')) {
        style.textContent = `
            .color-info-panel {
                display: flex;
                flex-direction: column;
                gap: 12px;
                padding: 12px;
            }
            
            .color-preview-section {
                display: flex;
                gap: 12px;
            }
            
            .color-swatch-container {
                position: relative;
            }
            
            .color-swatch {
                width: 80px;
                height: 80px;
                border-radius: 8px;
                border: 2px solid rgba(255, 255, 255, 0.1);
                background: transparent;
                background-image: linear-gradient(45deg, #ccc 25%, transparent 25%),
                                  linear-gradient(-45deg, #ccc 25%, transparent 25%),
                                  linear-gradient(45deg, transparent 75%, #ccc 75%),
                                  linear-gradient(-45deg, transparent 75%, #ccc 75%);
                background-size: 10px 10px;
                background-position: 0 0, 0 5px, 5px -5px, -5px 0px;
            }
            
            .copy-feedback {
                position: absolute;
                bottom: -20px;
                left: 50%;
                transform: translateX(-50%);
                font-size: 11px;
                color: var(--accent, #6366f1);
                opacity: 0;
                transition: opacity 0.2s ease;
            }
            
            .copy-feedback.show {
                opacity: 1;
            }
            
            .color-values {
                flex: 1;
                display: flex;
                flex-direction: column;
                gap: 4px;
            }
            
            .color-value-row {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 4px 8px;
                background: var(--bg-tertiary, #334155);
                border-radius: 4px;
            }
            
            .color-value-row.clickable {
                cursor: pointer;
                transition: background 0.15s ease;
            }
            
            .color-value-row.clickable:hover {
                background: var(--accent, #6366f1);
            }
            
            .color-label {
                font-size: 11px;
                color: var(--text-secondary, #94a3b8);
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            
            .color-value {
                font-size: 12px;
                font-weight: 600;
                color: var(--text-primary, #f1f5f9);
                font-family: 'IBM Plex Mono', monospace;
            }
            
            .eyedropper-section {
                display: flex;
                justify-content: center;
            }
            
            .eyedropper-btn {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 10px 20px;
                background: var(--bg-tertiary, #334155);
                border: 2px solid rgba(255, 255, 255, 0.1);
                border-radius: 8px;
                color: var(--text-primary, #f1f5f9);
                font-size: 13px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s ease;
                width: 100%;
                justify-content: center;
            }
            
            .eyedropper-btn svg {
                width: 18px;
                height: 18px;
            }
            
            .eyedropper-btn:hover {
                background: var(--accent, #6366f1);
                border-color: var(--accent, #6366f1);
            }
            
            .eyedropper-btn.active {
                background: var(--accent, #6366f1);
                border-color: var(--accent, #6366f1);
                animation: eyedropper-pulse 1.5s ease-in-out infinite;
            }
            
            @keyframes eyedropper-pulse {
                0%, 100% { box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.4); }
                50% { box-shadow: 0 0 0 8px rgba(99, 102, 241, 0); }
            }
            
            .color-history-section {
                border-top: 1px solid rgba(255, 255, 255, 0.1);
                padding-top: 12px;
            }
            
            .color-history-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 8px;
            }
            
            .color-history-header span {
                font-size: 12px;
                font-weight: 600;
                color: var(--text-secondary, #94a3b8);
            }
            
            .clear-history-btn {
                padding: 4px 8px;
                background: transparent;
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 4px;
                color: var(--text-tertiary, #64748b);
                font-size: 11px;
                cursor: pointer;
                transition: all 0.15s ease;
            }
            
            .clear-history-btn:hover {
                background: rgba(239, 68, 68, 0.2);
                border-color: #ef4444;
                color: #ef4444;
            }
            
            .color-history-swatches {
                display: flex;
                flex-wrap: wrap;
                gap: 6px;
            }
            
            .history-swatch {
                width: 28px;
                height: 28px;
                border-radius: 4px;
                border: 2px solid transparent;
                cursor: pointer;
                transition: all 0.15s ease;
            }
            
            .history-swatch:hover {
                border-color: var(--accent, #6366f1);
                transform: scale(1.1);
            }
            
            .color-info-hint {
                font-size: 11px;
                color: var(--text-tertiary, #64748b);
                text-align: center;
                padding: 8px;
                background: var(--bg-tertiary, #334155);
                border-radius: 6px;
            }
        `
        document.head.appendChild(style)
    }
    
    return content
}

/**
 * Enable eyedropper mode
 */
function enableEyedropper() {
    if (eyedropperActive) return
    
    eyedropperActive = true
    
    // Create bound handlers if not exists
    if (!boundHandleCanvasMove) {
        boundHandleCanvasMove = handleCanvasMove
    }
    if (!boundHandleCanvasClick) {
        boundHandleCanvasClick = handleCanvasClick
    }
    
    // Add event listeners
    const canvasDiv = document.getElementById('imageCanvasDiv')
    if (canvasDiv) {
        canvasDiv.addEventListener('mousemove', boundHandleCanvasMove)
        canvasDiv.addEventListener('click', boundHandleCanvasClick)
        canvasDiv.style.cursor = 'crosshair'
    }
    
    // Update button state
    updateEyedropperButtonState()
}

/**
 * Disable eyedropper mode
 */
function disableEyedropper() {
    if (!eyedropperActive) return
    
    eyedropperActive = false
    
    // Remove event listeners
    const canvasDiv = document.getElementById('imageCanvasDiv')
    if (canvasDiv) {
        if (boundHandleCanvasMove) {
            canvasDiv.removeEventListener('mousemove', boundHandleCanvasMove)
        }
        if (boundHandleCanvasClick) {
            canvasDiv.removeEventListener('click', boundHandleCanvasClick)
        }
        canvasDiv.style.cursor = ''
    }
    
    // Update button state
    updateEyedropperButtonState()
}

/**
 * Toggle eyedropper mode
 */
function toggleEyedropper() {
    if (eyedropperActive) {
        disableEyedropper()
    } else {
        enableEyedropper()
    }
}

/**
 * Update eyedropper button visual state
 */
function updateEyedropperButtonState() {
    if (!colorInfoWindow) return
    
    const content = colorInfoWindow.getContentElement()
    const btn = content?.querySelector('.eyedropper-btn')
    const textEl = content?.querySelector('.eyedropper-text')
    
    if (btn) {
        if (eyedropperActive) {
            btn.classList.add('active')
            if (textEl) textEl.textContent = 'Picking... (click to stop)'
        } else {
            btn.classList.remove('active')
            if (textEl) textEl.textContent = 'Pick Color'
        }
    }
}

/**
 * Open or focus color info window
 */
export function openColorInfoWindow(editor) {
    if (editor) {
        imageEditor = editor
    }
    
    if (colorInfoWindow) {
        colorInfoWindow.focus()
        colorInfoWindow.show()
        return colorInfoWindow
    }
    
    const content = createColorInfoContent()
    
    colorInfoWindow = windowManager.createWindow({
        id: 'color-info-panel',
        title: 'Color Info',
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <circle cx="12" cy="12" r="6"></circle>
            <circle cx="12" cy="12" r="2"></circle>
        </svg>`,
        width: 280,
        height: 380,
        minWidth: 250,
        minHeight: 340,
        content,
        contentClass: 'no-padding',
        onClose: () => {
            // Disable eyedropper on close
            disableEyedropper()
            colorInfoWindow = null
        },
        onCreate: (win) => {
            const contentEl = win.getContentElement()
            
            // Setup eyedropper button
            const eyedropperBtn = contentEl.querySelector('.eyedropper-btn')
            if (eyedropperBtn) {
                eyedropperBtn.addEventListener('click', toggleEyedropper)
            }
            
            // Setup copy on hex click
            contentEl.querySelector('[data-copy="hex"]')?.addEventListener('click', () => {
                const hex = contentEl.querySelector('.color-hex')?.textContent
                if (hex && hex !== '--') {
                    copyToClipboard(hex)
                }
            })
            
            // Setup clear history
            contentEl.querySelector('.clear-history-btn')?.addEventListener('click', () => {
                colorHistory = []
                updateHistoryDisplay()
            })
            
            // Update history display
            updateHistoryDisplay()
            
            // Auto-enable eyedropper on first open
            enableEyedropper()
        }
    })
    
    return colorInfoWindow
}

/**
 * Close color info window
 */
export function closeColorInfoWindow() {
    if (colorInfoWindow) {
        colorInfoWindow.close()
    }
}

/**
 * Check if color info is open (exists and not closed)
 */
export function isColorInfoOpen() {
    return colorInfoWindow !== null
}
