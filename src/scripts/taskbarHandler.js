import { ImageEditor } from './core/imageEditor.js'
import { initializeModifiedImageDataModule } from './canvasHandler.js'
import { renderLayerProperties } from './layersHandler.js'
import { paintedStylization, pointsInSpace, vectorsInSpace, sobelEdges, sobelEdgesColouredDirections, prewireEdges, prewireEdgesColouredDirections } from './plugins/paintedStylization.js'
import { filmEffects } from './plugins/filmEffects.js'
import { greyscale } from './plugins/greyscale.js'
import { sepia } from './plugins/sepia.js'
import { createSliderAnimation, exportSliderAnimationAsGif, getAnimatableParameters, previewAnimation, availableEasings, createMultiParameterAnimation, downloadBlob, loadGifFrames, gifFrameStack, loadFrameToEditor, saveEditorToFrame, exportFrameStackAsGif, isGifPlaying, startGifPlayback, stopGifPlayback, toggleGifPlayback, estimateGifFileSize, formatFileSize } from './plugins/gifAnimator.js'
import { openHistogramWindow, initHistogram, queueHistogramUpdate, isHistogramOpen } from './plugins/histogram.js'
import { openColorInfoWindow, initColorInfo, isColorInfoOpen } from './plugins/colorInfo.js'
import { openImageStatsWindow, isImageStatsOpen, refreshImageStats } from './plugins/imageStats.js'
import { toggleLayersWindow, toggleImagePropertiesWindow, getLayersWindow, getImagePropertiesWindow } from './core/dockablePanels.js'
import { windowManager } from './core/windowManager.js'
import * as exifr from 'exifr'

// RAW file extensions supported via embedded preview extraction
const RAW_EXTENSIONS = [
    '.cr2', '.cr3',           // Canon
    '.nef', '.nrw',           // Nikon
    '.arw', '.srf', '.sr2',   // Sony
    '.dng',                   // Adobe DNG
    '.raf',                   // Fujifilm
    '.orf',                   // Olympus
    '.rw2',                   // Panasonic
    '.pef',                   // Pentax
    '.srw',                   // Samsung
    '.x3f',                   // Sigma
    '.3fr', '.fff', '.iiq',   // Hasselblad/Phase One
    '.rwl',                   // Leica
    '.erf',                   // Epson
    '.mef', '.mos',           // Mamiya
    '.mrw',                   // Minolta
    '.kdc', '.dcr'            // Kodak
]


let imageEditor = null
let undoMenuItem = null
let redoMenuItem = null
let renderStatusPollInterval = null

function safeSetTextContent(id, value = '') {
    const element = document.getElementById(id)
    if (element) {
        element.textContent = value
    }
}

function safeSetInputValue(id, value = '') {
    const element = document.getElementById(id)
    if (element) {
        element.value = value
    }
}

function updateDimensionControlsFromEditor(editor) {
    if (!editor || !editor.image) return
    safeSetInputValue('imageWidthInput', Math.round(editor.image.width))
    safeSetInputValue('imageHeightInput', Math.round(editor.image.height))
}

function updateCropInputsFromEditor(editor) {
    if (!editor || !editor.image) return
    safeSetInputValue('cropStartHeight', 0)
    safeSetInputValue('cropStartWidth', 0)
    safeSetInputValue('cropEndHeight', Math.round(editor.image.height))
    safeSetInputValue('cropEndWidth', Math.round(editor.image.width))
}

function resetCropInputs() {
    ['cropStartHeight', 'cropStartWidth', 'cropEndHeight', 'cropEndWidth'].forEach(id => safeSetInputValue(id, ''))
}

function triggerOpenFileDialog() {
    const fileInput = document.getElementById('uploadFile')
    if (!fileInput) return
    fileInput.value = ''
    fileInput.onchange = uploadImages
    fileInput.click()
}

function getCropPanel() {
    return document.getElementById('cropPanel')
}

function openCropPanel(focusManualFields = false) {
    const panel = getCropPanel()
    if (!panel) return
    panel.classList.remove('hidden')
    if (focusManualFields) {
        focusElementById('cropStartWidth')
    }
}

function closeCropPanel() {
    const panel = getCropPanel()
    if (!panel) return
    panel.classList.add('hidden')
}

function triggerCursorCropSelection() {
    if (!imageEditor) return
    openCropPanel()
    window.isCropping = true // Disable dragging in canvasHandler.js if cropping

    const imageCanvasDiv = document.getElementById('imageCanvasDiv')
    if (imageCanvasDiv) {
        imageCanvasDiv.style.cursor = 'default'
    }
    
    const disableSelection = enableSelection((selection) => {
        if (imageCanvasDiv) {
            imageCanvasDiv.style.cursor = 'grab'
        }
        window.isCropping = false

        let { startHeight, startWidth, endHeight, endWidth } = selection

        if (startHeight > endHeight) {
            ;[startHeight, endHeight] = [endHeight, startHeight]
        }
        if (startWidth > endWidth) {
            ;[startWidth, endWidth] = [endWidth, startWidth]
        }
        
        safeSetInputValue('cropStartHeight', startHeight)
        safeSetInputValue('cropStartWidth', startWidth)
        safeSetInputValue('cropEndHeight', endHeight)
        safeSetInputValue('cropEndWidth', endWidth)

        disableSelection()
    })
}

function positionSelectionOverlay(canvas, overlay) {
    if (!canvas || !overlay || !canvas.parentElement) return
    const canvasRect = canvas.getBoundingClientRect()
    const parentRect = canvas.parentElement.getBoundingClientRect()
    overlay.style.left = `${canvasRect.left - parentRect.left}px`
    overlay.style.top = `${canvasRect.top - parentRect.top}px`
}

function getSelectionOverlay(canvas, rect) {
    if (!canvas || !canvas.parentElement) return null
    let overlay = canvas.parentElement.querySelector('.selectionOverlay')
    if (!overlay) {
        overlay = document.createElement('canvas')
        overlay.className = 'selectionOverlay'
        canvas.parentElement.appendChild(overlay)
    }

    const bounds = rect || canvas.getBoundingClientRect()
    overlay.width = bounds.width
    overlay.height = bounds.height
    overlay.style.width = `${bounds.width}px`
    overlay.style.height = `${bounds.height}px`
    overlay.style.position = 'absolute'
    positionSelectionOverlay(canvas, overlay)
    return overlay
}

function removeSelectionOverlay(canvas) {
    if (!canvas || !canvas.parentElement) return
    const overlay = canvas.parentElement.querySelector('.selectionOverlay')
    if (overlay) {
        overlay.remove()
    }
}

function adjustDimensionsByFactor(factor) {
    if (!Number.isFinite(factor) || factor <= 0) return
    const widthInput = document.getElementById('imageWidthInput')
    const heightInput = document.getElementById('imageHeightInput')
    if (!widthInput || !heightInput) return

    const fallbackWidth = imageEditor?.image?.width
    const fallbackHeight = imageEditor?.image?.height

    const currentWidth = parseFloat(widthInput.value)
    const currentHeight = parseFloat(heightInput.value)

    const baseWidth = Number.isFinite(currentWidth) && currentWidth > 0 ? currentWidth : fallbackWidth
    const baseHeight = Number.isFinite(currentHeight) && currentHeight > 0 ? currentHeight : fallbackHeight

    if (!Number.isFinite(baseWidth) || !Number.isFinite(baseHeight)) return

    widthInput.value = Math.max(1, Math.round(baseWidth * factor))
    heightInput.value = Math.max(1, Math.round(baseHeight * factor))
}

function syncConstrainedDimensions(changedField) {
    const constraintCheckbox = document.getElementById('constrainedCheckbox')
    if (!constraintCheckbox || !constraintCheckbox.checked) return
    if (!imageEditor || !imageEditor.image) return

    const widthInput = document.getElementById('imageWidthInput')
    const heightInput = document.getElementById('imageHeightInput')
    if (!widthInput || !heightInput) return

    const ratio = imageEditor.image.width / imageEditor.image.height
    if (!Number.isFinite(ratio) || ratio <= 0) return

    if (changedField === 'width') {
        const newWidth = parseFloat(widthInput.value)
        if (!Number.isFinite(newWidth) || newWidth <= 0) return
        heightInput.value = Math.max(1, Math.round(newWidth / ratio))
    } else if (changedField === 'height') {
        const newHeight = parseFloat(heightInput.value)
        if (!Number.isFinite(newHeight) || newHeight <= 0) return
        widthInput.value = Math.max(1, Math.round(newHeight * ratio))
    }
}

function focusElementById(id) {
    const element = document.getElementById(id)
    if (!element) return
    element.focus()
    if (typeof element.select === 'function') {
        element.select()
    }
}

function setMenuItemDisabled(element, disabled) {
    if (!element) return
    if (disabled) {
        element.disabled = true
        element.setAttribute('aria-disabled', 'true')
    } else {
        element.disabled = false
        element.setAttribute('aria-disabled', 'false')
    }
}

function updateHistoryMenuState(detail = { undoAvailable: false, redoAvailable: false }) {
    setMenuItemDisabled(undoMenuItem, !detail.undoAvailable)
    setMenuItemDisabled(redoMenuItem, !detail.redoAvailable)
}

function handleKeyboardShortcuts(event) {
    if (!(event.ctrlKey || event.metaKey)) return
    const key = event.key?.toLowerCase()
    if (!key) return

    if (key === 'z') {
        event.preventDefault()
        if (imageEditor && !undoMenuItem?.disabled) {
            imageEditor.undo()
        }
    } else if (key === 'y') {
        event.preventDefault()
        if (imageEditor && !redoMenuItem?.disabled) {
            imageEditor.redo()
        }
    }
}

function handleImageEditorStateChange(event) {
    const { instance, undoAvailable, redoAvailable, isRendering, renderFailed } = event.detail
    updateHistoryMenuState({ undoAvailable, redoAvailable })
    initializeModifiedImageDataModule(instance)

    // Update render status based on actual state
    updateRenderStatus(isRendering, renderFailed)
    
    // Start polling if rendering started
    if (isRendering && !renderStatusPollInterval) {
        startRenderStatusPolling()
    }
    
    // Update analysis panels when render completes
    if (!isRendering && !renderFailed) {
        if (isHistogramOpen()) {
            queueHistogramUpdate()
        }
        if (isImageStatsOpen()) {
            refreshImageStats()
        }
    }
}

function updateRenderStatus(isRendering, renderFailed = false) {
    const renderStatus = document.getElementById('renderStatus')
    if (!renderStatus) return
    const statusLabel = renderStatus.querySelector('span')

    const setStatus = (stateClass, label) => {
        renderStatus.classList.remove('isRendering', 'isError', 'isReady')
        if (stateClass) {
            renderStatus.classList.add(stateClass)
        }
        if (statusLabel) {
            statusLabel.textContent = label
        }
    }

    if (renderFailed) {
        setStatus('isError', 'Render failed')
        setTimeout(() => setStatus('isReady', 'Ready'), 2000)
        return
    }

    if (isRendering) {
        setStatus('isRendering', 'Rendering…')
    } else {
        setStatus('isReady', 'Ready')
    }
}

// Fade out render status when mouse is in top-left corner
function initRenderStatusHover() {
    const renderStatus = document.getElementById('renderStatus')
    if (!renderStatus) return
    
    document.addEventListener('mousemove', (e) => {
        // Check if mouse is in the top-left corner area (within 150px of left edge, 60px of top)
        const isInCorner = e.clientX < 150 && e.clientY < 60
        renderStatus.classList.toggle('faded', isInCorner)
    })
}

function startRenderStatusPolling() {
    if (renderStatusPollInterval) return
    
    renderStatusPollInterval = setInterval(() => {
        if (!imageEditor) {
            stopRenderStatusPolling()
            return
        }
        
        const isBusy = imageEditor.isBusy
        updateRenderStatus(isBusy)
        
        // Stop polling when render is complete
        if (!isBusy) {
            stopRenderStatusPolling()
        }
    }, 50) // Poll every 50ms for responsive feedback
}

function stopRenderStatusPolling() {
    if (renderStatusPollInterval) {
        clearInterval(renderStatusPollInterval)
        renderStatusPollInterval = null
    }
}

function enableSelection(callback) {
    const canvas = document.getElementById('imageCanvas')
    let isSelecting = false
    let startX, startY, endX, endY
    let overlayCanvas = null
    let overlayContext = null
    let displayScaleX = 1
    let displayScaleY = 1

    function updateDisplayScale() {
        const rect = canvas.getBoundingClientRect()
        displayScaleX = rect.width / canvas.width
        displayScaleY = rect.height / canvas.height
        return rect
    }

    function getCanvasCoordinates(clientX, clientY) {
        const rect = canvas.getBoundingClientRect()
        const scaleX = canvas.width / rect.width
        const scaleY = canvas.height / rect.height

        return {
            x: (clientX - rect.left) * scaleX,
            y: (clientY - rect.top) * scaleY
        }
    }

    // Store event listener functions in named variables
    const handleMouseDown = (e) => {
        const { x, y } = getCanvasCoordinates(e.clientX, e.clientY)
        startX = x
        startY = y
        endX = x  // Initialize end to start position
        endY = y
        isSelecting = true
        const rect = updateDisplayScale()
        overlayCanvas = getSelectionOverlay(canvas, rect)
        overlayContext = overlayCanvas ? overlayCanvas.getContext('2d') : null
        if (overlayContext) {
            positionSelectionOverlay(canvas, overlayCanvas)
            overlayContext.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height)
        }
    }

    const handleMouseMove = (e) => {
        if (!isSelecting) return

        const { x, y } = getCanvasCoordinates(e.clientX, e.clientY)
        endX = x
        endY = y

        if (!overlayContext) return
        overlayContext.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height)
        overlayContext.strokeStyle = 'rgba(255, 255, 255, 0.95)'
        overlayContext.lineWidth = 2
        overlayContext.setLineDash([12, 8])
        const drawStartX = startX * displayScaleX
        const drawStartY = startY * displayScaleY
        const drawWidth = (endX - startX) * displayScaleX
        const drawHeight = (endY - startY) * displayScaleY
        overlayContext.strokeRect(drawStartX, drawStartY, drawWidth, drawHeight)
    }

    const handleMouseUp = () => {
        isSelecting = false
        if (overlayContext) {
            overlayContext.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height)
        }

        // Ensure we have valid coordinates
        if (startX === undefined || startY === undefined || endX === undefined || endY === undefined) {
            return
        }

        // Return selection coordinates via callback
        const selection = {
            startHeight: Math.round(startY),
            startWidth: Math.round(startX),
            endHeight: Math.round(endY),
            endWidth: Math.round(endX)
        };

        if (typeof callback === 'function') {
            callback(selection);
        }
    };

    // Add event listeners
    canvas.addEventListener('mousedown', handleMouseDown)
    canvas.addEventListener('mousemove', handleMouseMove)
    canvas.addEventListener('mouseup', handleMouseUp)

    // Return a cleanup function
    return function disableSelection() {
        canvas.removeEventListener('mousedown', handleMouseDown)
        canvas.removeEventListener('mousemove', handleMouseMove)
        canvas.removeEventListener('mouseup', handleMouseUp)
        if (overlayContext && overlayCanvas) {
            overlayContext.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height)
        }
        removeSelectionOverlay(canvas)
    };
}

function resetEditor() {
    if (imageEditor) {
        imageEditor = null
    }
    if (window.imageEditor) {
        window.imageEditor = null
    }

    ['titleNameModified', 'titleDimensionsModified', 'titleExtensionModified'].forEach(id => {
        safeSetTextContent(id, '')
    })

    const imageNameInput = document.getElementById('imageNameInput')
    if (imageNameInput) {
        imageNameInput.value = ''
    }

    safeSetInputValue('imageWidthInput')
    safeSetInputValue('imageHeightInput')
    resetCropInputs()

    const extensionSelector = document.getElementById('imageExtensionSelector')
    if (extensionSelector) {
        extensionSelector.selectedIndex = 0
    }
    const constraintCheckbox = document.getElementById('constrainedCheckbox')
    if (constraintCheckbox) {
        constraintCheckbox.checked = false
    }
    closeCropPanel()

    const currentLayerSelector = document.getElementById('currentLayerSelector')
    if (currentLayerSelector) {
        currentLayerSelector.innerHTML = ''
    }

    const layersList = document.getElementById('layersList')
    if (layersList) {
        layersList.innerHTML = ''
    }

    updateHistoryMenuState()
}

async function uploadImages() {
    const files = Array.from(document.querySelector("input[type=file]").files)
    if (!files.length) return

    // If multiple files selected, compose into GIF
    if (files.length > 1) {
        await uploadMultipleAsGif(files)
        return
    }

    // Single file - use original logic
    const file = files[0]
    resetEditor()

    // Check if the file is a RAW image
    const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'))
    const isRaw = RAW_EXTENSIONS.includes(fileExtension)
    
    if (isRaw) {
        await uploadRawImage(file)
        return
    }

    // Check if the file is a GIF
    const isGif = file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif')
    
    if (isGif) {
        // Load GIF with frame stack
        try {
            await loadGifFrames(file)
            
            // Show the Edit GIF Frames button
            const editGifBtn = document.getElementById('editGifBtn')
            if (editGifBtn) {
                editGifBtn.style.display = ''
            }
            
            // Show the play/stop button
            const gifPlayStopBtn = document.getElementById('gifPlayStopBtn')
            if (gifPlayStopBtn) {
                gifPlayStopBtn.classList.remove('hidden')
            }
            
            // Load first frame into editor
            if (gifFrameStack.length > 0) {
                const frame = gifFrameStack.getFrame(0)
                const canvas = document.createElement('canvas')
                canvas.width = frame.imageData.width
                canvas.height = frame.imageData.height
                const ctx = canvas.getContext('2d')
                ctx.putImageData(frame.imageData, 0, 0)
                
                const image = new Image()
                const name = file.name.substring(0, file.name.lastIndexOf('.'))
                const type = file.type || 'image/gif'
                const extension = 'gif'
                const mainCanvas = document.getElementById('imageCanvas')
                
                image.onload = () => {
                    imageEditor = new ImageEditor(image, name, type, extension, mainCanvas)
                    window.imageEditor = imageEditor
                    
                    const imageEditorInstantiationEvent = new CustomEvent('imageEditorReady', { detail: { instance: imageEditor } })
                    window.dispatchEvent(imageEditorInstantiationEvent)
                }
                image.src = canvas.toDataURL()
            }
        } catch (err) {
            console.error('Failed to load GIF:', err)
            alert('Failed to load GIF: ' + err.message)
        }
    } else {
        // Hide GIF-specific UI for non-GIF files
        const editGifBtn = document.getElementById('editGifBtn')
        if (editGifBtn) {
            editGifBtn.style.display = 'none'
        }
        
        const gifPlayStopBtn = document.getElementById('gifPlayStopBtn')
        if (gifPlayStopBtn) {
            gifPlayStopBtn.classList.add('hidden')
        }
        
        // Clear frame stack and thumbnail cache
        gifFrameStack.clear()
        clearThumbnailCache()
        
        // Standard image loading
        const reader = new FileReader()
        const image = new Image()

        // File Metadata
        const name = file.name.substring(0, file.name.lastIndexOf('.'))
        const type = file.type
        const extension = type.slice(6)
        const canvas = document.getElementById('imageCanvas')

        // Writes image data (Base64) to image.src
        reader.onload = () => {
            image.src = reader.result
        };

        image.onload = () => {
            imageEditor = new ImageEditor(image, name, type, extension, canvas)
            window.imageEditor = imageEditor

            const imageEditorInstantiationEvent = new CustomEvent('imageEditorReady', { detail: { instance: imageEditor } })
            window.dispatchEvent(imageEditorInstantiationEvent)
        };

        reader.readAsDataURL(file)
    }
}

/**
 * Check if a file is a supported image (standard format or RAW)
 */
function isImageFile(file) {
    if (file.type.startsWith('image/')) return true
    const ext = file.name.toLowerCase().substring(file.name.lastIndexOf('.'))
    return RAW_EXTENSIONS.includes(ext)
}

/**
 * Handle drag and drop image loading
 * Supports dropping single or multiple images onto the page
 */
function initializeDragAndDrop() {
    const body = document.body
    let dropOverlay = null
    let dragCounter = 0

    // Create drop overlay element
    function createDropOverlay() {
        if (dropOverlay) return dropOverlay
        dropOverlay = document.createElement('div')
        dropOverlay.className = 'dropOverlay'
        dropOverlay.innerHTML = `
            <div class="dropOverlayContent">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="17 8 12 3 7 8"></polyline>
                    <line x1="12" y1="3" x2="12" y2="15"></line>
                </svg>
                <p>Drop image(s) here to load</p>
                <span>Multiple images will be combined into a GIF</span>
            </div>
        `
        body.appendChild(dropOverlay)
        return dropOverlay
    }

    function showDropOverlay() {
        const overlay = createDropOverlay()
        overlay.classList.add('active')
    }

    function hideDropOverlay() {
        if (dropOverlay) {
            dropOverlay.classList.remove('active')
        }
    }

    // Prevent default drag behaviors on the whole document
    ;['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        body.addEventListener(eventName, (e) => {
            e.preventDefault()
            e.stopPropagation()
        }, false)
    })

    // Handle drag enter - show overlay
    body.addEventListener('dragenter', (e) => {
        dragCounter++
        if (e.dataTransfer?.types?.includes('Files')) {
            showDropOverlay()
        }
    }, false)

    // Handle drag over - keep overlay visible
    body.addEventListener('dragover', (e) => {
        if (e.dataTransfer?.types?.includes('Files')) {
            e.dataTransfer.dropEffect = 'copy'
        }
    }, false)

    // Handle drag leave - hide overlay when leaving the window
    body.addEventListener('dragleave', (e) => {
        dragCounter--
        if (dragCounter === 0) {
            hideDropOverlay()
        }
    }, false)

    // Handle drop - process files
    body.addEventListener('drop', async (e) => {
        dragCounter = 0
        hideDropOverlay()

        const files = Array.from(e.dataTransfer?.files || [])
        const imageFiles = files.filter(f => isImageFile(f))

        if (imageFiles.length === 0) {
            return
        }

        // Process the dropped files
        await processDroppedImages(imageFiles)
    }, false)
}

/**
 * Process images dropped onto the page
 * Single image: load normally
 * Multiple images: compose into GIF
 */
async function processDroppedImages(files) {
    if (files.length === 0) return

    if (files.length === 1) {
        // Single file - load directly
        const file = files[0]
        resetEditor()

        const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'))
        const isRaw = RAW_EXTENSIONS.includes(fileExtension)

        if (isRaw) {
            await uploadRawImage(file)
            return
        }

        const isGif = file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif')

        if (isGif) {
            // Load GIF with frame stack
            try {
                await loadGifFrames(file)

                const editGifBtn = document.getElementById('editGifBtn')
                if (editGifBtn) {
                    editGifBtn.style.display = ''
                }

                const gifPlayStopBtn = document.getElementById('gifPlayStopBtn')
                if (gifPlayStopBtn) {
                    gifPlayStopBtn.classList.remove('hidden')
                }

                if (gifFrameStack.length > 0) {
                    const frame = gifFrameStack.getFrame(0)
                    const canvas = document.createElement('canvas')
                    canvas.width = frame.imageData.width
                    canvas.height = frame.imageData.height
                    const ctx = canvas.getContext('2d')
                    ctx.putImageData(frame.imageData, 0, 0)

                    const image = new Image()
                    const name = file.name.substring(0, file.name.lastIndexOf('.'))
                    const type = file.type || 'image/gif'
                    const extension = 'gif'
                    const mainCanvas = document.getElementById('imageCanvas')

                    image.onload = () => {
                        imageEditor = new ImageEditor(image, name, type, extension, mainCanvas)
                        window.imageEditor = imageEditor

                        const imageEditorInstantiationEvent = new CustomEvent('imageEditorReady', { detail: { instance: imageEditor } })
                        window.dispatchEvent(imageEditorInstantiationEvent)
                    }
                    image.src = canvas.toDataURL()
                }
            } catch (err) {
                console.error('Failed to load GIF:', err)
                alert('Failed to load GIF: ' + err.message)
            }
        } else {
            // Hide GIF-specific UI for non-GIF files
            const editGifBtn = document.getElementById('editGifBtn')
            if (editGifBtn) {
                editGifBtn.style.display = 'none'
            }

            const gifPlayStopBtn = document.getElementById('gifPlayStopBtn')
            if (gifPlayStopBtn) {
                gifPlayStopBtn.classList.add('hidden')
            }

            gifFrameStack.clear()
            clearThumbnailCache()

            // Standard image loading
            const reader = new FileReader()
            const image = new Image()

            const name = file.name.substring(0, file.name.lastIndexOf('.'))
            const type = file.type
            const extension = type.slice(6)
            const canvas = document.getElementById('imageCanvas')

            reader.onload = () => {
                image.src = reader.result
            }

            image.onload = () => {
                imageEditor = new ImageEditor(image, name, type, extension, canvas)
                window.imageEditor = imageEditor

                const imageEditorInstantiationEvent = new CustomEvent('imageEditorReady', { detail: { instance: imageEditor } })
                window.dispatchEvent(imageEditorInstantiationEvent)
            }

            reader.readAsDataURL(file)
        }
    } else {
        // Multiple files - compose into GIF
        await uploadMultipleAsGif(files)
    }
}

/**
 * Upload multiple images and compose them into a GIF
 * Images are sorted by filename and resized to match the first image's dimensions
 * Supports both standard image formats and RAW files
 */
async function uploadMultipleAsGif(files) {
    resetEditor()
    
    // Sort files by name for consistent ordering
    const sortedFiles = files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
    
    // Filter to only image files (including RAW formats)
    const imageFiles = sortedFiles.filter(f => isImageFile(f))
    
    if (imageFiles.length < 2) {
        alert('Please select at least 2 images to create a GIF')
        return
    }
    
    // Show loading indicator
    const renderStatus = document.getElementById('renderStatus')
    const statusLabel = renderStatus?.querySelector('span')
    if (renderStatus) {
        renderStatus.classList.remove('isReady', 'isError')
        renderStatus.classList.add('isRendering')
    }
    if (statusLabel) {
        statusLabel.textContent = `Loading images (0/${imageFiles.length})...`
    }
    
    try {
        // Load all images
        const loadedImages = []
        for (let i = 0; i < imageFiles.length; i++) {
            if (statusLabel) {
                statusLabel.textContent = `Loading images (${i + 1}/${imageFiles.length})...`
            }
            const img = await loadImageFromFile(imageFiles[i])
            loadedImages.push(img)
        }
        
        // Use first image dimensions as the target size
        const targetWidth = loadedImages[0].width
        const targetHeight = loadedImages[0].height
        
        // Clear existing frame stack and thumbnail cache
        gifFrameStack.clear()
        clearThumbnailCache()
        
        // Default frame delay (100ms = 10 fps)
        const defaultDelay = 100
        
        if (statusLabel) {
            statusLabel.textContent = 'Creating GIF frames...'
        }
        
        // Create frames from each image
        for (const img of loadedImages) {
            // Create canvas to normalize image size
            const canvas = document.createElement('canvas')
            canvas.width = targetWidth
            canvas.height = targetHeight
            const ctx = canvas.getContext('2d')
            
            // Fill with transparent/black background
            ctx.fillStyle = '#000000'
            ctx.fillRect(0, 0, targetWidth, targetHeight)
            
            // Calculate scaling to fit image while maintaining aspect ratio
            const scale = Math.min(targetWidth / img.width, targetHeight / img.height)
            const scaledWidth = img.width * scale
            const scaledHeight = img.height * scale
            const offsetX = (targetWidth - scaledWidth) / 2
            const offsetY = (targetHeight - scaledHeight) / 2
            
            // Draw image centered
            ctx.drawImage(img, offsetX, offsetY, scaledWidth, scaledHeight)
            
            // Get image data and add to frame stack
            const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight)
            gifFrameStack.addFrame(imageData, defaultDelay)
        }
        
        // Show the Edit GIF Frames button
        const editGifBtn = document.getElementById('editGifBtn')
        if (editGifBtn) {
            editGifBtn.style.display = ''
        }
        
        // Show the play/stop button
        const gifPlayStopBtn = document.getElementById('gifPlayStopBtn')
        if (gifPlayStopBtn) {
            gifPlayStopBtn.classList.remove('hidden')
        }
        
        // Load first frame into editor
        if (gifFrameStack.length > 0) {
            const frame = gifFrameStack.getFrame(0)
            const canvas = document.createElement('canvas')
            canvas.width = frame.imageData.width
            canvas.height = frame.imageData.height
            const ctx = canvas.getContext('2d')
            ctx.putImageData(frame.imageData, 0, 0)
            
            const image = new Image()
            const name = 'composed-gif'
            const type = 'image/gif'
            const extension = 'gif'
            const mainCanvas = document.getElementById('imageCanvas')
            
            image.onload = () => {
                imageEditor = new ImageEditor(image, name, type, extension, mainCanvas)
                window.imageEditor = imageEditor
                
                const imageEditorInstantiationEvent = new CustomEvent('imageEditorReady', { detail: { instance: imageEditor } })
                window.dispatchEvent(imageEditorInstantiationEvent)
                
                // Update status
                if (renderStatus) {
                    renderStatus.classList.remove('isRendering', 'isError')
                    renderStatus.classList.add('isReady')
                }
                if (statusLabel) {
                    statusLabel.textContent = 'Ready'
                }
                
                // Show success message
                alert(`Created GIF with ${gifFrameStack.length} frames from ${imageFiles.length} images.\n\nUse "Edit GIF Frames" to adjust timing, or export directly.`)
            }
            image.src = canvas.toDataURL()
        }
    } catch (err) {
        console.error('Failed to create GIF from images:', err)
        alert('Failed to create GIF: ' + err.message)
        
        if (renderStatus) {
            renderStatus.classList.remove('isRendering')
            renderStatus.classList.add('isError')
        }
        if (statusLabel) {
            statusLabel.textContent = 'Error'
        }
    }
}

/**
 * Load an image from a file and return a promise that resolves to the Image element
 * Supports both standard image formats and RAW files (via embedded preview extraction)
 */
async function loadImageFromFile(file) {
    const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'))
    const isRaw = RAW_EXTENSIONS.includes(fileExtension)
    
    if (isRaw) {
        return await extractRawPreview(file)
    }
    
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        const image = new Image()
        
        reader.onload = () => {
            image.src = reader.result
        }
        
        reader.onerror = () => {
            reject(new Error(`Failed to read file: ${file.name}`))
        }
        
        image.onload = () => {
            resolve(image)
        }
        
        image.onerror = () => {
            reject(new Error(`Failed to load image: ${file.name}`))
        }
        
        reader.readAsDataURL(file)
    })
}

/**
 * Extract embedded JPEG preview from a RAW file
 * Supports traditional RAW formats via exifr, and CR3 via manual parsing
 */
async function extractRawPreview(file) {
    const fileName = file.name.toLowerCase()
    
    // CR3 files need special handling - they use ISO BMF container (like MP4)
    if (fileName.endsWith('.cr3')) {
        return await extractCR3Preview(file)
    }
    
    // For other RAW formats, try exifr
    try {
        const thumbnailData = await exifr.thumbnail(file)
        
        if (thumbnailData) {
            const blob = new Blob([thumbnailData], { type: 'image/jpeg' })
            const dataUrl = await blobToDataURL(blob)
            
            return new Promise((resolve, reject) => {
                const image = new Image()
                image.onload = () => resolve(image)
                image.onerror = () => reject(new Error(`Failed to load RAW preview: ${file.name}`))
                image.src = dataUrl
            })
        }
    } catch (err) {
        console.warn('exifr thumbnail extraction failed, trying manual extraction:', err.message)
    }
    
    // Fallback: try to find JPEG data manually in the file
    return await extractJpegFromRaw(file)
}

/**
 * Extract preview from Canon CR3 files
 * CR3 uses ISO Base Media File Format (like MP4/HEIF)
 * The preview JPEG is stored in a 'PRVW' box or as a track
 */
async function extractCR3Preview(file) {
    const buffer = await file.arrayBuffer()
    const data = new Uint8Array(buffer)
    
    // Search for JPEG markers in the file
    // CR3 embeds full JPEG previews that start with FFD8 and end with FFD9
    const jpegStart = findJpegStart(data)
    
    if (jpegStart === -1) {
        throw new Error('No JPEG preview found in CR3 file')
    }
    
    // Find the largest JPEG in the file (usually the full preview)
    const jpegs = findAllJpegs(data)
    
    if (jpegs.length === 0) {
        throw new Error('No JPEG preview found in CR3 file')
    }
    
    // Sort by size and use the largest one (usually the high-res preview)
    jpegs.sort((a, b) => b.size - a.size)
    const bestJpeg = jpegs[0]
    
    const jpegData = data.slice(bestJpeg.start, bestJpeg.end)
    const blob = new Blob([jpegData], { type: 'image/jpeg' })
    const dataUrl = await blobToDataURL(blob)
    
    return new Promise((resolve, reject) => {
        const image = new Image()
        image.onload = () => resolve(image)
        image.onerror = () => reject(new Error(`Failed to load CR3 preview: ${file.name}`))
        image.src = dataUrl
    })
}

/**
 * Find all JPEG images embedded in a binary file
 */
function findAllJpegs(data) {
    const jpegs = []
    let i = 0
    
    while (i < data.length - 1) {
        // Look for JPEG start marker (FFD8)
        if (data[i] === 0xFF && data[i + 1] === 0xD8) {
            const start = i
            // Find corresponding end marker (FFD9)
            let j = i + 2
            while (j < data.length - 1) {
                if (data[j] === 0xFF && data[j + 1] === 0xD9) {
                    const end = j + 2
                    const size = end - start
                    // Only consider JPEGs larger than 10KB (skip tiny thumbnails)
                    if (size > 10240) {
                        jpegs.push({ start, end, size })
                    }
                    i = end
                    break
                }
                j++
            }
            if (j >= data.length - 1) break
        } else {
            i++
        }
    }
    
    return jpegs
}

/**
 * Find the start of a JPEG in binary data
 */
function findJpegStart(data) {
    for (let i = 0; i < data.length - 1; i++) {
        if (data[i] === 0xFF && data[i + 1] === 0xD8) {
            return i
        }
    }
    return -1
}

/**
 * Fallback: Extract JPEG from any RAW file by searching for JPEG markers
 */
async function extractJpegFromRaw(file) {
    const buffer = await file.arrayBuffer()
    const data = new Uint8Array(buffer)
    
    const jpegs = findAllJpegs(data)
    
    if (jpegs.length === 0) {
        throw new Error(`No embedded preview found in RAW file: ${file.name}`)
    }
    
    // Use the largest JPEG found
    jpegs.sort((a, b) => b.size - a.size)
    const bestJpeg = jpegs[0]
    
    const jpegData = data.slice(bestJpeg.start, bestJpeg.end)
    const blob = new Blob([jpegData], { type: 'image/jpeg' })
    const dataUrl = await blobToDataURL(blob)
    
    return new Promise((resolve, reject) => {
        const image = new Image()
        image.onload = () => resolve(image)
        image.onerror = () => reject(new Error(`Failed to load RAW preview: ${file.name}`))
        image.src = dataUrl
    })
}

/**
 * Convert a Blob to a data URL
 */
function blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.onerror = () => reject(new Error('Failed to convert blob to data URL'))
        reader.readAsDataURL(blob)
    })
}

/**
 * Upload a RAW image file by extracting its embedded preview
 */
async function uploadRawImage(file) {
    // Show loading indicator
    const renderStatus = document.getElementById('renderStatus')
    const statusLabel = renderStatus?.querySelector('span')
    if (renderStatus) {
        renderStatus.classList.remove('isReady', 'isError')
        renderStatus.classList.add('isRendering')
    }
    if (statusLabel) {
        statusLabel.textContent = 'Extracting RAW preview...'
    }
    
    try {
        // Hide GIF-specific UI
        const editGifBtn = document.getElementById('editGifBtn')
        if (editGifBtn) {
            editGifBtn.style.display = 'none'
        }
        
        const gifPlayStopBtn = document.getElementById('gifPlayStopBtn')
        if (gifPlayStopBtn) {
            gifPlayStopBtn.classList.add('hidden')
        }
        
        // Clear frame stack and thumbnail cache
        gifFrameStack.clear()
        clearThumbnailCache()
        
        // Extract preview from RAW file
        const image = await extractRawPreview(file)
        
        // File Metadata
        const name = file.name.substring(0, file.name.lastIndexOf('.'))
        const type = 'image/jpeg' // Preview is always JPEG
        const extension = 'jpg'
        const canvas = document.getElementById('imageCanvas')
        
        imageEditor = new ImageEditor(image, name, type, extension, canvas)
        window.imageEditor = imageEditor
        
        const imageEditorInstantiationEvent = new CustomEvent('imageEditorReady', { detail: { instance: imageEditor } })
        window.dispatchEvent(imageEditorInstantiationEvent)
        
        // Update status
        if (renderStatus) {
            renderStatus.classList.remove('isRendering', 'isError')
            renderStatus.classList.add('isReady')
        }
        if (statusLabel) {
            statusLabel.textContent = 'Ready'
        }
        
        // Get EXIF data for info display
        try {
            const exif = await exifr.parse(file, { pick: ['Make', 'Model', 'ISO', 'ExposureTime', 'FNumber', 'FocalLength'] })
            if (exif) {
                const info = []
                if (exif.Make) info.push(exif.Make)
                if (exif.Model) info.push(exif.Model)
                if (exif.ISO) info.push(`ISO ${exif.ISO}`)
                if (exif.FNumber) info.push(`f/${exif.FNumber}`)
                if (exif.ExposureTime) info.push(`${exif.ExposureTime}s`)
                if (exif.FocalLength) info.push(`${exif.FocalLength}mm`)
                
                if (info.length > 0) {
                    console.log(`RAW file loaded: ${info.join(' | ')}`)
                }
            }
        } catch (exifErr) {
            // EXIF extraction is optional, don't fail if it doesn't work
            console.log('Could not extract EXIF data')
        }
        
    } catch (err) {
        console.error('Failed to load RAW image:', err)
        alert('Failed to load RAW image: ' + err.message + '\n\nTip: Some older or less common RAW formats may not have embedded previews.')
        
        if (renderStatus) {
            renderStatus.classList.remove('isRendering')
            renderStatus.classList.add('isError')
        }
        if (statusLabel) {
            statusLabel.textContent = 'Error'
        }
    }
}

// GIF Animator Dialog Functions
let gifAnimatorDialog = null
let currentPreviewStop = null

function createGifAnimatorDialog() {
    if (gifAnimatorDialog) return gifAnimatorDialog

    const dialog = document.createElement('div')
    dialog.id = 'gifAnimatorDialog'
    dialog.className = 'gifAnimatorDialog hidden'
    dialog.innerHTML = `
        <div class="gifAnimatorContent">
            <div class="gifAnimatorHeader">
                <h3>Create GIF Animation</h3>
                <button id="closeGifAnimator" class="closeBtn">&times;</button>
            </div>
            <div class="gifAnimatorBody">
                <div class="gifAnimatorField">
                    <label for="gifParameterSelect">Parameter to Animate:</label>
                    <select id="gifParameterSelect"></select>
                </div>
                <div class="gifAnimatorField">
                    <label for="gifStartValue">Start Value:</label>
                    <input type="number" id="gifStartValue" step="any">
                </div>
                <div class="gifAnimatorField">
                    <label for="gifEndValue">End Value:</label>
                    <input type="number" id="gifEndValue" step="any">
                </div>
                <div class="gifAnimatorField">
                    <label for="gifFrameCount">Frame Count:</label>
                    <input type="number" id="gifFrameCount" value="15" min="2" max="10000">
                </div>
                <div class="gifAnimatorField">
                    <label for="gifFrameDelay">Frame Delay (ms):</label>
                    <input type="number" id="gifFrameDelay" value="100" min="10" max="2000">
                </div>
                <div class="gifAnimatorField">
                    <label for="gifEasing">Easing:</label>
                    <select id="gifEasing">
                        <option value="linear">Linear</option>
                        <option value="easeIn">Ease In</option>
                        <option value="easeOut">Ease Out</option>
                        <option value="easeInOut">Ease In-Out</option>
                        <option value="easeInCubic">Ease In Cubic</option>
                        <option value="easeOutCubic">Ease Out Cubic</option>
                        <option value="easeInOutCubic">Ease In-Out Cubic</option>
                        <option value="bounce">Bounce</option>
                    </select>
                </div>
                <div class="gifAnimatorField">
                    <label for="gifScale">Output Scale:</label>
                    <select id="gifScale">
                        <option value="1">100% (Full Size)</option>
                        <option value="0.75">75%</option>
                        <option value="0.5" selected>50%</option>
                        <option value="0.25">25%</option>
                        <option value="0.1">10%</option>
                    </select>
                </div>
                <div class="gifAnimatorField checkbox">
                    <input type="checkbox" id="gifPingPong">
                    <label for="gifPingPong">Ping-Pong (reverse animation)</label>
                </div>
                <div class="gifSizeEstimate" id="gifSizeEstimate">
                    <div class="sizeEstimateRow">
                        <span class="sizeLabel">Estimated Size:</span>
                        <span class="sizeValue" id="gifEstimatedSize">--</span>
                    </div>
                    <div class="sizeEstimateRow">
                        <span class="sizeLabel">Output Dimensions:</span>
                        <span class="sizeValue" id="gifOutputDimensions">--</span>
                    </div>
                    <div class="sizeEstimateRow">
                        <span class="sizeLabel">Total Frames:</span>
                        <span class="sizeValue" id="gifTotalFrames">--</span>
                    </div>
                    <div class="sizeEstimateRow">
                        <span class="sizeLabel">Duration:</span>
                        <span class="sizeValue" id="gifDuration">--</span>
                    </div>
                </div>
                <div class="gifAnimatorProgress hidden">
                    <div class="progressBar">
                        <div class="progressFill" id="gifProgressFill"></div>
                    </div>
                    <span id="gifProgressText">0%</span>
                </div>
            </div>
            <div class="gifAnimatorFooter">
                <button id="previewGifAnimation" class="btn btnSecondary">Preview</button>
                <button id="stopGifPreview" class="btn btnSecondary hidden">Stop Preview</button>
                <button id="createGifAnimation" class="btn btnPrimary">Create GIF</button>
            </div>
        </div>
    `

    // Add styles
    const style = document.createElement('style')
    style.textContent = `
        .gifAnimatorDialog {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.6);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
        }
        .gifAnimatorDialog.hidden {
            display: none;
        }
        .gifAnimatorContent {
            background: var(--bg-secondary, #1e293b);
            border-radius: 8px;
            width: 400px;
            max-width: 90vw;
            max-height: 90vh;
            overflow-y: auto;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
            color: var(--text-primary, #f1f5f9);
        }
        .gifAnimatorHeader {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 16px;
            border-bottom: 1px solid var(--border, rgba(255, 255, 255, 0.1));
        }
        .gifAnimatorHeader h3 {
            margin: 0;
            color: var(--text-primary, #f1f5f9);
        }
        .gifAnimatorHeader .closeBtn {
            background: none;
            border: none;
            color: var(--text-primary, #f1f5f9);
            font-size: 24px;
            cursor: pointer;
            padding: 0;
            line-height: 1;
        }
        .gifAnimatorBody {
            padding: 16px;
        }
        .gifAnimatorField {
            margin-bottom: 12px;
        }
        .gifAnimatorField label {
            display: block;
            margin-bottom: 4px;
            color: var(--text-secondary, #94a3b8);
            font-size: 14px;
        }
        .gifAnimatorField.checkbox {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .gifAnimatorField.checkbox label {
            margin-bottom: 0;
        }
        .gifAnimatorField input[type="number"],
        .gifAnimatorField select {
            width: 100%;
            padding: 8px;
            border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
            border-radius: 4px;
            background: var(--bg-tertiary, #334155);
            color: var(--text-primary, #f1f5f9);
            font-size: 14px;
        }
        .gifAnimatorProgress {
            margin-top: 16px;
            display: flex;
            align-items: center;
            gap: 12px;
        }
        .gifAnimatorProgress.hidden {
            display: none;
        }
        .progressBar {
            flex: 1;
            height: 8px;
            background: var(--bg-tertiary, #334155);
            border-radius: 4px;
            overflow: hidden;
        }
        .progressFill {
            height: 100%;
            background: var(--accent, #6366f1);
            width: 0%;
            transition: width 0.1s ease;
        }
        .gifSizeEstimate {
            background: var(--bg-tertiary, #334155);
            border-radius: 4px;
            padding: 12px;
            margin-top: 12px;
        }
        .sizeEstimateRow {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 4px 0;
        }
        .sizeEstimateRow .sizeLabel {
            color: var(--text-secondary, #94a3b8);
            font-size: 13px;
        }
        .sizeEstimateRow .sizeValue {
            color: var(--text-primary, #f1f5f9);
            font-weight: 600;
            font-size: 13px;
        }
        .sizeEstimateRow .sizeValue.warning {
            color: #f59e0b;
        }
        .sizeEstimateRow .sizeValue.danger {
            color: #ef4444;
        }
        .gifAnimatorFooter {
            display: flex;
            justify-content: flex-end;
            gap: 8px;
            padding: 16px;
            border-top: 1px solid var(--border, rgba(255, 255, 255, 0.1));
        }
        .gifAnimatorFooter .btn {
            padding: 8px 16px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
        }
        .gifAnimatorFooter .btnPrimary {
            background: var(--accent, #6366f1);
            color: white;
        }
        .gifAnimatorFooter .btnSecondary {
            background: var(--bg-tertiary, #334155);
            color: var(--text-primary, #f1f5f9);
        }
        .gifAnimatorFooter .btn:hover {
            opacity: 0.9;
        }
        .gifAnimatorFooter .btn.hidden {
            display: none;
        }
    `
    document.head.appendChild(style)
    document.body.appendChild(dialog)

    gifAnimatorDialog = dialog
    return dialog
}

function populateGifAnimatorParameters() {
    if (!imageEditor) return

    const select = document.getElementById('gifParameterSelect')
    if (!select) return

    select.innerHTML = ''

    const selectedIndex = imageEditor.getSelectedIndex()
    if (selectedIndex === null || selectedIndex === undefined) {
        const option = document.createElement('option')
        option.textContent = 'No layer selected'
        option.disabled = true
        select.appendChild(option)
        return
    }

    const params = getAnimatableParameters(imageEditor, selectedIndex)
    if (params.length === 0) {
        const option = document.createElement('option')
        option.textContent = 'No animatable parameters'
        option.disabled = true
        select.appendChild(option)
        return
    }

    params.forEach(param => {
        const option = document.createElement('option')
        option.value = param.name
        option.textContent = `${param.name} (${param.min} - ${param.max})`
        option.dataset.min = param.min
        option.dataset.max = param.max
        option.dataset.current = param.currentValue
        option.dataset.step = param.step
        select.appendChild(option)
    })

    // Set default values
    updateGifAnimatorDefaults()

    select.addEventListener('change', updateGifAnimatorDefaults)
}

function updateGifAnimatorDefaults() {
    const select = document.getElementById('gifParameterSelect')
    const startInput = document.getElementById('gifStartValue')
    const endInput = document.getElementById('gifEndValue')

    if (!select || !startInput || !endInput) return

    const selectedOption = select.selectedOptions[0]
    if (!selectedOption || !selectedOption.dataset.min) return

    startInput.value = selectedOption.dataset.min
    endInput.value = selectedOption.dataset.max
    startInput.step = selectedOption.dataset.step
    endInput.step = selectedOption.dataset.step
    
    updateGifSizeEstimate()
}

function updateGifSizeEstimate() {
    if (!imageEditor) return
    
    const frameCount = parseInt(document.getElementById('gifFrameCount')?.value, 10) || 15
    const frameDelay = parseInt(document.getElementById('gifFrameDelay')?.value, 10) || 100
    const scale = parseFloat(document.getElementById('gifScale')?.value) || 0.5
    const pingPong = document.getElementById('gifPingPong')?.checked || false
    
    const outputWidth = Math.round(imageEditor.canvas.width * scale)
    const outputHeight = Math.round(imageEditor.canvas.height * scale)
    
    const estimate = estimateGifFileSize(outputWidth, outputHeight, frameCount, pingPong)
    const totalFrames = estimate.totalFrames
    const durationMs = totalFrames * frameDelay
    const durationSec = durationMs / 1000
    
    // Update UI
    const sizeEl = document.getElementById('gifEstimatedSize')
    const dimsEl = document.getElementById('gifOutputDimensions')
    const framesEl = document.getElementById('gifTotalFrames')
    const durationEl = document.getElementById('gifDuration')
    
    if (sizeEl) {
        const sizeStr = formatFileSize(estimate.bytes)
        sizeEl.textContent = sizeStr
        
        // Add warning classes based on size
        sizeEl.classList.remove('warning', 'danger')
        if (estimate.bytes > 500 * 1024 * 1024) { // > 500MB
            sizeEl.classList.add('danger')
        } else if (estimate.bytes > 50 * 1024 * 1024) { // > 50MB
            sizeEl.classList.add('warning')
        }
    }
    
    if (dimsEl) {
        dimsEl.textContent = `${outputWidth} × ${outputHeight}`
    }
    
    if (framesEl) {
        framesEl.textContent = totalFrames.toLocaleString()
    }
    
    if (durationEl) {
        if (durationSec >= 60) {
            const mins = Math.floor(durationSec / 60)
            const secs = (durationSec % 60).toFixed(1)
            durationEl.textContent = `${mins}m ${secs}s`
        } else {
            durationEl.textContent = `${durationSec.toFixed(1)}s`
        }
    }
}

function openGifAnimatorDialog() {
    if (!imageEditor) {
        alert('Please load an image first')
        return
    }

    const selectedIndex = imageEditor.getSelectedIndex()
    if (selectedIndex === null || selectedIndex === undefined) {
        alert('Please select a layer with effects first')
        return
    }

    createGifAnimatorDialog()
    populateGifAnimatorParameters()

    gifAnimatorDialog.classList.remove('hidden')
}

function closeGifAnimatorDialog() {
    if (currentPreviewStop) {
        currentPreviewStop()
        currentPreviewStop = null
    }
    if (gifAnimatorDialog) {
        gifAnimatorDialog.classList.add('hidden')
    }
}

async function handleCreateGifAnimation() {
    if (!imageEditor) return

    const selectedIndex = imageEditor.getSelectedIndex()
    if (selectedIndex === null) return

    const parameterName = document.getElementById('gifParameterSelect')?.value
    const startValue = parseFloat(document.getElementById('gifStartValue')?.value)
    const endValue = parseFloat(document.getElementById('gifEndValue')?.value)
    const frameCount = parseInt(document.getElementById('gifFrameCount')?.value, 10)
    const frameDelay = parseInt(document.getElementById('gifFrameDelay')?.value, 10)
    const easing = document.getElementById('gifEasing')?.value || 'linear'
    const scale = parseFloat(document.getElementById('gifScale')?.value) || 0.5
    const pingPong = document.getElementById('gifPingPong')?.checked || false

    if (!parameterName || isNaN(startValue) || isNaN(endValue)) {
        alert('Please fill in all required fields')
        return
    }

    const progressDiv = document.querySelector('.gifAnimatorProgress')
    const progressFill = document.getElementById('gifProgressFill')
    const progressText = document.getElementById('gifProgressText')
    const createBtn = document.getElementById('createGifAnimation')

    if (progressDiv) progressDiv.classList.remove('hidden')
    if (createBtn) createBtn.disabled = true

    try {
        const config = {
            parameterName,
            startValue,
            endValue,
            frameCount,
            frameDelay,
            pingPong,
            easing,
            scale
        }

        const filename = `${imageEditor.name || 'animation'}_${parameterName}.gif`

        await exportSliderAnimationAsGif(
            imageEditor,
            selectedIndex,
            config,
            filename,
            (progress) => {
                if (progressFill) progressFill.style.width = `${progress}%`
                if (progressText) progressText.textContent = `${progress}%`
            }
        )

        closeGifAnimatorDialog()
    } catch (error) {
        console.error('GIF creation failed:', error)
        alert(`Failed to create GIF: ${error.message}`)
    } finally {
        if (progressDiv) progressDiv.classList.add('hidden')
        if (progressFill) progressFill.style.width = '0%'
        if (createBtn) createBtn.disabled = false
    }
}

function handlePreviewAnimation() {
    if (!imageEditor) return

    const selectedIndex = imageEditor.getSelectedIndex()
    if (selectedIndex === null) return

    if (currentPreviewStop) {
        currentPreviewStop()
        currentPreviewStop = null
    }

    const parameterName = document.getElementById('gifParameterSelect')?.value
    const startValue = parseFloat(document.getElementById('gifStartValue')?.value)
    const endValue = parseFloat(document.getElementById('gifEndValue')?.value)
    const frameCount = parseInt(document.getElementById('gifFrameCount')?.value, 10)
    const frameDelay = parseInt(document.getElementById('gifFrameDelay')?.value, 10)
    const easing = document.getElementById('gifEasing')?.value || 'linear'
    const pingPong = document.getElementById('gifPingPong')?.checked || false

    if (!parameterName || isNaN(startValue) || isNaN(endValue)) {
        alert('Please fill in all required fields')
        return
    }

    const previewBtn = document.getElementById('previewGifAnimation')
    const stopBtn = document.getElementById('stopGifPreview')

    if (previewBtn) previewBtn.classList.add('hidden')
    if (stopBtn) stopBtn.classList.remove('hidden')

    currentPreviewStop = previewAnimation(
        imageEditor,
        selectedIndex,
        {
            parameterName,
            startValue,
            endValue,
            frameCount,
            frameDelay,
            pingPong,
            easing
        },
        (value, frame, total) => {
            // Could show current value in UI if desired
        }
    )
}

function handleStopPreview() {
    if (currentPreviewStop) {
        currentPreviewStop()
        currentPreviewStop = null
    }

    const previewBtn = document.getElementById('previewGifAnimation')
    const stopBtn = document.getElementById('stopGifPreview')

    if (previewBtn) previewBtn.classList.remove('hidden')
    if (stopBtn) stopBtn.classList.add('hidden')
}

// GIF Frame Editor Dialog
let gifFrameEditorDialog = null

function createGifFrameEditorDialog() {
    if (gifFrameEditorDialog) return gifFrameEditorDialog

    const dialog = document.createElement('div')
    dialog.id = 'gifFrameEditorDialog'
    dialog.className = 'gifFrameEditorDialog hidden'
    dialog.innerHTML = `
        <div class="gifFrameEditorContent">
            <div class="gifFrameEditorHeader">
                <h3>GIF Frame Editor</h3>
                <button id="closeGifFrameEditor" class="closeBtn">&times;</button>
            </div>
            <div class="gifFrameEditorBody">
                <div class="gifFrameList" id="gifFrameList">
                    <p class="noFrames">No GIF loaded. Click "Load GIF" to import a GIF file.</p>
                </div>
                <div class="gifFrameControls">
                    <div class="frameNavigation">
                        <button id="gifPrevFrame" class="btn btnSecondary" disabled>← Prev</button>
                        <span id="gifFrameCounter">0 / 0</span>
                        <button id="gifNextFrame" class="btn btnSecondary" disabled>Next →</button>
                    </div>
                    <div class="frameActions">
                        <button id="gifLoadFrame" class="btn btnSecondary" disabled>Edit Frame</button>
                        <button id="gifSaveFrame" class="btn btnSecondary" disabled>Save Changes</button>
                        <button id="gifDuplicateFrame" class="btn btnSecondary" disabled>Duplicate</button>
                        <button id="gifDeleteFrame" class="btn btnSecondary" disabled>Delete</button>
                    </div>
                    <div class="frameDelayControl">
                        <label for="gifFrameDelay">Frame Delay (ms):</label>
                        <input type="number" id="gifFrameDelayInput" value="100" min="20" max="5000" disabled>
                        <button id="gifApplyDelay" class="btn btnSecondary" disabled>Apply</button>
                    </div>
                    <hr class="gifFrameDivider">
                    <div class="bulkSettingsSection">
                        <h4>Bulk Settings</h4>
                        <div class="bulkSettingsRow">
                            <label>Set All Delays (ms):</label>
                            <input type="number" id="gifBulkDelayInput" value="100" min="20" max="5000">
                            <button id="gifApplyBulkDelay" class="btn btnSecondary">Apply to All</button>
                        </div>
                        <div class="bulkSettingsRow">
                            <label>Resize GIF:</label>
                            <input type="number" id="gifResizeWidth" placeholder="Width" min="1">
                            <span>×</span>
                            <input type="number" id="gifResizeHeight" placeholder="Height" min="1">
                            <label class="checkboxLabel"><input type="checkbox" id="gifResizeConstrain" checked> Lock</label>
                            <button id="gifApplyResize" class="btn btnSecondary">Resize All</button>
                        </div>
                    </div>
                </div>
                <div class="gifFrameProgress hidden" id="gifFrameProgress">
                    <div class="progressBar">
                        <div class="progressFill" id="gifFrameProgressFill"></div>
                    </div>
                    <span id="gifFrameProgressText">0%</span>
                </div>
            </div>
            <div class="gifFrameEditorFooter">
                <button id="gifLoadFile" class="btn btnSecondary">Load GIF</button>
                <input type="file" id="gifFileInput" accept=".gif,image/gif" style="display:none">
                <button id="gifExportFrames" class="btn btnPrimary" disabled>Export GIF</button>
            </div>
        </div>
    `

    // Add styles
    const style = document.createElement('style')
    style.textContent = `
        .gifFrameEditorDialog {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.6);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
        }
        .gifFrameEditorDialog.hidden {
            display: none;
        }
        .gifFrameEditorContent {
            background: var(--bg-secondary, #1e293b);
            border-radius: 8px;
            width: 600px;
            max-width: 95vw;
            max-height: 90vh;
            overflow-y: auto;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
            color: var(--text-primary, #f1f5f9);
        }
        .gifFrameEditorHeader {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 16px;
            border-bottom: 1px solid var(--border, rgba(255, 255, 255, 0.1));
        }
        .gifFrameEditorHeader h3 {
            margin: 0;
            color: var(--text-primary, #f1f5f9);
        }
        .gifFrameEditorBody {
            padding: 16px;
        }
        .gifFrameList {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            max-height: 200px;
            overflow-y: auto;
            padding: 8px;
            background: var(--bg-tertiary, #334155);
            border-radius: 4px;
            margin-bottom: 16px;
        }
        .gifFrameList .noFrames {
            color: var(--text-secondary, #94a3b8);
            font-size: 14px;
            text-align: center;
            width: 100%;
            padding: 20px;
        }
        .gifFrameThumb {
            width: 60px;
            height: 60px;
            border: 2px solid transparent;
            border-radius: 4px;
            cursor: pointer;
            object-fit: cover;
            background: var(--bg-primary, #0f172a);
        }
        .gifFrameThumb.selected {
            border-color: var(--accent, #6366f1);
        }
        .gifFrameControls {
            display: flex;
            flex-direction: column;
            gap: 12px;
        }
        .frameNavigation {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 16px;
        }
        .frameNavigation span {
            color: var(--text-primary, #f1f5f9);
            min-width: 60px;
            text-align: center;
        }
        .frameActions {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            justify-content: center;
        }
        .frameDelayControl {
            display: flex;
            align-items: center;
            gap: 8px;
            justify-content: center;
        }
        .frameDelayControl label {
            color: var(--text-primary, #f1f5f9);
            font-size: 14px;
        }
        .frameDelayControl input {
            width: 80px;
            padding: 6px;
            border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
            border-radius: 4px;
            background: var(--bg-tertiary, #334155);
            color: var(--text-primary, #f1f5f9);
        }
        .gifFrameEditorFooter {
            display: flex;
            justify-content: space-between;
            padding: 16px;
            border-top: 1px solid var(--border, rgba(255, 255, 255, 0.1));
        }
        .gifFrameProgress {
            margin-top: 16px;
            display: flex;
            align-items: center;
            gap: 12px;
        }
        .gifFrameProgress.hidden {
            display: none;
        }
        .gifFrameEditorContent .btn {
            padding: 8px 16px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
        }
        .gifFrameEditorContent .btnSecondary {
            background: var(--bg-tertiary, #334155);
            color: var(--text-primary, #f1f5f9);
        }
        .gifFrameEditorContent .btnPrimary {
            background: var(--accent, #6366f1);
            color: white;
        }
        .gifFrameEditorContent .btn:hover:not(:disabled) {
            opacity: 0.9;
        }
        .gifFrameEditorContent .btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
        .gifFrameEditorHeader .closeBtn {
            background: none;
            border: none;
            color: var(--text-primary, #f1f5f9);
            font-size: 24px;
            cursor: pointer;
            padding: 0;
            line-height: 1;
        }
        .gifFrameDivider {
            border: none;
            border-top: 1px solid var(--border, rgba(255, 255, 255, 0.1));
            margin: 16px 0;
        }
        .bulkSettingsSection {
            background: var(--bg-tertiary, #334155);
            border-radius: 6px;
            padding: 12px;
        }
        .bulkSettingsSection h4 {
            margin: 0 0 12px 0;
            font-size: 14px;
            color: var(--text-secondary, #94a3b8);
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .bulkSettingsRow {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 10px;
            flex-wrap: wrap;
        }
        .bulkSettingsRow:last-child {
            margin-bottom: 0;
        }
        .bulkSettingsRow label {
            color: var(--text-primary, #f1f5f9);
            font-size: 13px;
            min-width: 110px;
        }
        .bulkSettingsRow input[type="number"] {
            width: 70px;
            padding: 6px;
            border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
            border-radius: 4px;
            background: var(--bg-primary, #0f172a);
            color: var(--text-primary, #f1f5f9);
        }
        .bulkSettingsRow span {
            color: var(--text-secondary, #94a3b8);
        }
        .bulkSettingsRow .checkboxLabel {
            display: flex;
            align-items: center;
            gap: 4px;
            font-size: 12px;
            color: var(--text-secondary, #94a3b8);
        }
    `
    document.head.appendChild(style)
    document.body.appendChild(dialog)

    gifFrameEditorDialog = dialog
    setupGifFrameEditorEvents()
    return dialog
}

function setupGifFrameEditorEvents() {
    // Close button
    document.getElementById('closeGifFrameEditor')?.addEventListener('click', closeGifFrameEditorDialog)

    // Load GIF file
    document.getElementById('gifLoadFile')?.addEventListener('click', () => {
        document.getElementById('gifFileInput')?.click()
    })

    document.getElementById('gifFileInput')?.addEventListener('change', async (e) => {
        const file = e.target.files?.[0]
        if (!file) return
        
        try {
            await loadGifFrames(file)
            clearThumbnailCache() // Clear cache when loading new GIF
            renderGifFrameList()
            updateGifFrameControls()
            
            // Show the Edit GIF Frames button
            const editGifBtn = document.getElementById('editGifBtn')
            if (editGifBtn) {
                editGifBtn.style.display = ''
            }
            
            // Show the play/stop button when GIF is loaded
            const gifPlayStopBtn = document.getElementById('gifPlayStopBtn')
            if (gifPlayStopBtn) {
                gifPlayStopBtn.classList.remove('hidden')
            }
        } catch (err) {
            alert('Failed to load GIF: ' + err.message)
        }
    })

    // Frame navigation
    document.getElementById('gifPrevFrame')?.addEventListener('click', () => {
        if (gifFrameStack.currentFrameIndex > 0) {
            gifFrameStack.currentFrameIndex--
            renderGifFrameList()
            updateGifFrameControls()
        }
    })

    document.getElementById('gifNextFrame')?.addEventListener('click', () => {
        if (gifFrameStack.currentFrameIndex < gifFrameStack.length - 1) {
            gifFrameStack.currentFrameIndex++
            renderGifFrameList()
            updateGifFrameControls()
        }
    })

    // Frame actions
    document.getElementById('gifLoadFrame')?.addEventListener('click', () => {
        if (imageEditor && gifFrameStack.length > 0) {
            loadFrameToEditor(imageEditor, gifFrameStack.currentFrameIndex)
        }
    })

    document.getElementById('gifSaveFrame')?.addEventListener('click', () => {
        if (imageEditor && gifFrameStack.length > 0) {
            saveEditorToFrame(imageEditor, gifFrameStack.currentFrameIndex)
            // Clear thumbnail cache for updated frame
            const frame = gifFrameStack.getFrame(gifFrameStack.currentFrameIndex)
            if (frame) {
                const cacheKey = `${gifFrameStack.currentFrameIndex}_${frame.imageData.width}_${frame.imageData.height}`
                gifThumbnailCache.delete(cacheKey)
            }
            renderGifFrameList()
        }
    })

    document.getElementById('gifDuplicateFrame')?.addEventListener('click', () => {
        if (gifFrameStack.length > 0) {
            gifFrameStack.duplicateFrame(gifFrameStack.currentFrameIndex)
            clearThumbnailCache() // Indices shift after duplication
            renderGifFrameList()
            updateGifFrameControls()
        }
    })

    document.getElementById('gifDeleteFrame')?.addEventListener('click', () => {
        if (gifFrameStack.length > 1) {
            gifFrameStack.deleteFrame(gifFrameStack.currentFrameIndex)
            clearThumbnailCache() // Indices shift after deletion
            renderGifFrameList()
            updateGifFrameControls()
        }
    })

    // Frame delay
    document.getElementById('gifApplyDelay')?.addEventListener('click', () => {
        const delayInput = document.getElementById('gifFrameDelayInput')
        const delay = parseInt(delayInput?.value, 10)
        if (!isNaN(delay) && delay >= 20) {
            gifFrameStack.setDelay(gifFrameStack.currentFrameIndex, delay)
        }
    })

    // Bulk delay - apply to all frames
    document.getElementById('gifApplyBulkDelay')?.addEventListener('click', () => {
        const delayInput = document.getElementById('gifBulkDelayInput')
        const delay = parseInt(delayInput?.value, 10)
        if (!isNaN(delay) && delay >= 20 && gifFrameStack.length > 0) {
            for (let i = 0; i < gifFrameStack.length; i++) {
                gifFrameStack.setDelay(i, delay)
            }
            // Update current frame delay input to match
            document.getElementById('gifFrameDelayInput').value = delay
        }
    })

    // Resize constraint checkbox
    const resizeWidthInput = document.getElementById('gifResizeWidth')
    const resizeHeightInput = document.getElementById('gifResizeHeight')
    const resizeConstrainCheckbox = document.getElementById('gifResizeConstrain')

    resizeWidthInput?.addEventListener('input', () => {
        if (resizeConstrainCheckbox?.checked && gifFrameStack.length > 0) {
            const ratio = gifFrameStack.height / gifFrameStack.width
            const newWidth = parseInt(resizeWidthInput.value, 10)
            if (!isNaN(newWidth) && newWidth > 0) {
                resizeHeightInput.value = Math.round(newWidth * ratio)
            }
        }
    })

    resizeHeightInput?.addEventListener('input', () => {
        if (resizeConstrainCheckbox?.checked && gifFrameStack.length > 0) {
            const ratio = gifFrameStack.width / gifFrameStack.height
            const newHeight = parseInt(resizeHeightInput.value, 10)
            if (!isNaN(newHeight) && newHeight > 0) {
                resizeWidthInput.value = Math.round(newHeight * ratio)
            }
        }
    })

    // Bulk resize - apply to all frames
    document.getElementById('gifApplyResize')?.addEventListener('click', async () => {
        const newWidth = parseInt(resizeWidthInput?.value, 10)
        const newHeight = parseInt(resizeHeightInput?.value, 10)
        
        if (isNaN(newWidth) || isNaN(newHeight) || newWidth < 1 || newHeight < 1) {
            alert('Please enter valid width and height values')
            return
        }
        
        if (gifFrameStack.length === 0) return

        // Resize all frames
        for (let i = 0; i < gifFrameStack.frames.length; i++) {
            const frame = gifFrameStack.frames[i]
            
            // Create a temp canvas for resizing
            const tempCanvas = document.createElement('canvas')
            tempCanvas.width = newWidth
            tempCanvas.height = newHeight
            const tempCtx = tempCanvas.getContext('2d')
            
            // Use high quality scaling
            tempCtx.imageSmoothingEnabled = true
            tempCtx.imageSmoothingQuality = 'high'
            
            // Draw the original frame scaled to new size
            tempCtx.drawImage(frame.canvas, 0, 0, newWidth, newHeight)
            
            // Get the resized image data
            const newImageData = tempCtx.getImageData(0, 0, newWidth, newHeight)
            
            // Update the frame
            frame.imageData = newImageData
            frame.canvas.width = newWidth
            frame.canvas.height = newHeight
            const frameCtx = frame.canvas.getContext('2d')
            frameCtx.putImageData(newImageData, 0, 0)
        }
        
        // Update frame stack dimensions
        gifFrameStack.width = newWidth
        gifFrameStack.height = newHeight
        
        // Clear thumbnail cache and re-render
        clearThumbnailCache()
        renderGifFrameList()
        
        // Also update the main editor if it's displaying a frame
        if (imageEditor && gifFrameStack.length > 0) {
            loadFrameToEditor(imageEditor, gifFrameStack.currentFrameIndex)
        }
    })

    // Export
    document.getElementById('gifExportFrames')?.addEventListener('click', async () => {
        if (gifFrameStack.length === 0) return

        const progressDiv = document.getElementById('gifFrameProgress')
        const progressFill = document.getElementById('gifFrameProgressFill')
        const progressText = document.getElementById('gifFrameProgressText')
        const exportBtn = document.getElementById('gifExportFrames')

        if (progressDiv) progressDiv.classList.remove('hidden')
        if (exportBtn) exportBtn.disabled = true

        try {
            const blob = await exportFrameStackAsGif(gifFrameStack, {
                quality: 10,
                onProgress: (p) => {
                    if (progressFill) progressFill.style.width = `${p}%`
                    if (progressText) progressText.textContent = `${p}%`
                }
            })
            downloadBlob(blob, 'edited_animation.gif')
        } catch (err) {
            alert('Failed to export GIF: ' + err.message)
        } finally {
            if (progressDiv) progressDiv.classList.add('hidden')
            if (progressFill) progressFill.style.width = '0%'
            if (exportBtn) exportBtn.disabled = false
        }
    })
}

// Thumbnail cache for GIF frame editor performance
const gifThumbnailCache = new Map()
const THUMBNAIL_MAX_SIZE = 80 // Max width/height for thumbnails

function generateThumbnail(frame, index) {
    // Check cache first
    const cacheKey = `${index}_${frame.imageData.width}_${frame.imageData.height}`
    if (gifThumbnailCache.has(cacheKey)) {
        return gifThumbnailCache.get(cacheKey)
    }
    
    // Calculate thumbnail dimensions maintaining aspect ratio
    const srcWidth = frame.canvas.width
    const srcHeight = frame.canvas.height
    const scale = Math.min(THUMBNAIL_MAX_SIZE / srcWidth, THUMBNAIL_MAX_SIZE / srcHeight, 1)
    const thumbWidth = Math.round(srcWidth * scale)
    const thumbHeight = Math.round(srcHeight * scale)
    
    // Create thumbnail canvas
    const thumbCanvas = document.createElement('canvas')
    thumbCanvas.width = thumbWidth
    thumbCanvas.height = thumbHeight
    const thumbCtx = thumbCanvas.getContext('2d')
    
    // Use faster image smoothing for thumbnails
    thumbCtx.imageSmoothingEnabled = true
    thumbCtx.imageSmoothingQuality = 'medium'
    
    // Draw scaled down version
    thumbCtx.drawImage(frame.canvas, 0, 0, thumbWidth, thumbHeight)
    
    // Cache the data URL
    const dataUrl = thumbCanvas.toDataURL('image/jpeg', 0.7)
    gifThumbnailCache.set(cacheKey, dataUrl)
    
    return dataUrl
}

function clearThumbnailCache() {
    gifThumbnailCache.clear()
}

function renderGifFrameList() {
    const frameList = document.getElementById('gifFrameList')
    if (!frameList) return

    if (gifFrameStack.length === 0) {
        frameList.innerHTML = '<p class="noFrames">No GIF loaded. Click "Load GIF" to import a GIF file.</p>'
        clearThumbnailCache()
        return
    }

    frameList.innerHTML = ''
    
    gifFrameStack.frames.forEach((frame, index) => {
        const img = document.createElement('img')
        img.className = 'gifFrameThumb' + (index === gifFrameStack.currentFrameIndex ? ' selected' : '')
        img.src = generateThumbnail(frame, index)
        img.title = `Frame ${index + 1} (${frame.delay}ms)`
        img.addEventListener('click', () => {
            gifFrameStack.currentFrameIndex = index
            renderGifFrameList()
            updateGifFrameControls()
        })
        frameList.appendChild(img)
    })
}

function updateGifFrameControls() {
    const hasFrames = gifFrameStack.length > 0
    const currentIndex = gifFrameStack.currentFrameIndex
    const currentFrame = gifFrameStack.currentFrame

    document.getElementById('gifFrameCounter').textContent = 
        hasFrames ? `${currentIndex + 1} / ${gifFrameStack.length}` : '0 / 0'

    document.getElementById('gifPrevFrame').disabled = !hasFrames || currentIndex === 0
    document.getElementById('gifNextFrame').disabled = !hasFrames || currentIndex >= gifFrameStack.length - 1
    document.getElementById('gifLoadFrame').disabled = !hasFrames || !imageEditor
    document.getElementById('gifSaveFrame').disabled = !hasFrames || !imageEditor
    document.getElementById('gifDuplicateFrame').disabled = !hasFrames
    document.getElementById('gifDeleteFrame').disabled = gifFrameStack.length <= 1
    document.getElementById('gifFrameDelayInput').disabled = !hasFrames
    document.getElementById('gifApplyDelay').disabled = !hasFrames
    document.getElementById('gifExportFrames').disabled = !hasFrames

    if (currentFrame) {
        document.getElementById('gifFrameDelayInput').value = currentFrame.delay
    }
    
    // Update bulk settings inputs
    const resizeWidthInput = document.getElementById('gifResizeWidth')
    const resizeHeightInput = document.getElementById('gifResizeHeight')
    const bulkDelayInput = document.getElementById('gifBulkDelayInput')
    
    if (hasFrames) {
        if (resizeWidthInput) resizeWidthInput.value = gifFrameStack.width
        if (resizeHeightInput) resizeHeightInput.value = gifFrameStack.height
        if (bulkDelayInput && currentFrame) bulkDelayInput.value = currentFrame.delay
    }
}

function openGifFrameEditorDialog() {
    createGifFrameEditorDialog()
    renderGifFrameList()
    updateGifFrameControls()
    gifFrameEditorDialog.classList.remove('hidden')
}

function closeGifFrameEditorDialog() {
    if (gifFrameEditorDialog) {
        gifFrameEditorDialog.classList.add('hidden')
    }
}

// Expose for global access
window.openGifAnimatorDialog = openGifAnimatorDialog
window.openGifFrameEditorDialog = openGifFrameEditorDialog
window.createSliderAnimation = createSliderAnimation
window.exportSliderAnimationAsGif = exportSliderAnimationAsGif
window.getAnimatableParameters = getAnimatableParameters
window.previewAnimation = previewAnimation
window.gifFrameStack = gifFrameStack
window.loadGifFrames = loadGifFrames
window.loadFrameToEditor = loadFrameToEditor
window.saveEditorToFrame = saveEditorToFrame
window.exportFrameStackAsGif = exportFrameStackAsGif
window.isGifPlaying = isGifPlaying
window.startGifPlayback = startGifPlayback
window.stopGifPlayback = stopGifPlayback
window.toggleGifPlayback = toggleGifPlayback

window.addEventListener('load', () => {

    /*
    * Initialize Drag and Drop Image Loading
    */
    initializeDragAndDrop()
    
    /*
    * Initialize render status hover behavior
    */
    initRenderStatusHover()

    /*
    * Mobile Menu Navigation Setup
    */
    
    const menuOverlay = document.getElementById('menuOverlay')
    const menuPanels = {
        navFile: document.getElementById('fileMenu'),
        navImage: document.getElementById('imageMenu'),
        navFilter: document.getElementById('filterMenu'),
        navVisual: document.getElementById('visualMenu'),
        navWindows: document.getElementById('windowsMenu')
    }
    const navButtons = document.querySelectorAll('.navBtn')
    
    function closeAllMenus() {
        Object.values(menuPanels).forEach(panel => {
            if (panel) {
                panel.classList.remove('active')
                panel.setAttribute('aria-hidden', 'true')
            }
        })
        navButtons.forEach(btn => {
            btn.classList.remove('active')
            btn.setAttribute('aria-expanded', 'false')
        })
        if (menuOverlay) {
            menuOverlay.classList.remove('active')
        }
    }
    
    function openMenu(menuId) {
        closeAllMenus()
        const panel = menuPanels[menuId]
        const btn = document.getElementById(menuId)
        if (panel && btn) {
            panel.classList.add('active')
            panel.setAttribute('aria-hidden', 'false')
            btn.classList.add('active')
            btn.setAttribute('aria-expanded', 'true')
            if (menuOverlay) {
                menuOverlay.classList.add('active')
            }
        }
    }
    
    // Nav button click handlers
    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const menuId = btn.id
            if (btn.classList.contains('active')) {
                closeAllMenus()
            } else {
                openMenu(menuId)
            }
        })
    })
    
    // Close menu when overlay is clicked
    if (menuOverlay) {
        menuOverlay.addEventListener('click', closeAllMenus)
    }
    
    // Close menu when a menu item is clicked
    document.querySelectorAll('.menuItem').forEach(item => {
        item.addEventListener('click', () => {
            // Delay close slightly so action registers
            setTimeout(closeAllMenus, 100)
        })
    })
    
    // Close buttons in menu panels
    document.querySelectorAll('.menuClose').forEach(btn => {
        btn.addEventListener('click', closeAllMenus)
    })

    /*
    * Taskbar Event Listeners
    */

    undoMenuItem = document.getElementById('undoAction')
    redoMenuItem = document.getElementById('redoAction')
    setMenuItemDisabled(undoMenuItem, true)
    setMenuItemDisabled(redoMenuItem, true)
    window.addEventListener('imageEditorStateChanged', handleImageEditorStateChange)

    undoMenuItem?.addEventListener('click', async () => {
        if (!imageEditor || undoMenuItem.disabled) return
        await imageEditor.undo()
    })

    redoMenuItem?.addEventListener('click', async () => {
        if (!imageEditor || redoMenuItem.disabled) return
        await imageEditor.redo()
    })

    // Opens file browser and loads the selected image to the canvas.
    const openFileButton = document.getElementById('openFile')
    if (openFileButton) {
        openFileButton.addEventListener('click', triggerOpenFileDialog)
    }

    const saveActionButton = document.getElementById('saveAction')
    if (saveActionButton) {
        saveActionButton.addEventListener('click', async () => {
            console.log('Save button clicked, imageEditor:', imageEditor)
            if (!imageEditor) {
                console.log('No imageEditor, returning early')
                return
            }
            
            console.log('Extension:', imageEditor.extension, 'Frame count:', gifFrameStack.length)
            
            // Check if we should export as animated GIF (extension is gif AND we have multiple frames)
            if (imageEditor.extension === 'gif' && gifFrameStack.length > 1) {
                console.log('Exporting as animated GIF')
                // Save current frame edits before exporting
                saveEditorToFrame(imageEditor, gifFrameStack.currentFrameIndex)
                
                try {
                    const blob = await exportFrameStackAsGif(gifFrameStack, {
                        quality: 10
                    })
                    downloadBlob(blob, `${imageEditor.name}_PhotoEditsExport.gif`)
                } catch (err) {
                    console.error('Failed to export GIF:', err)
                    alert('Failed to export GIF: ' + err.message)
                }
            } else {
                console.log('Exporting as single image')
                // Single image export (or user changed extension to extract single frame)
                try {
                    imageEditor.quickExport()
                } catch (err) {
                    console.error('Failed to export image:', err)
                    alert('Failed to export image: ' + err.message)
                }
            }
        })
    } else {
        console.error('Save button not found!')
    }

    // Core image modifications
    const resizeMenuItem = document.getElementById('resize')
    if (resizeMenuItem) {
        resizeMenuItem.addEventListener('click', () => {
            focusElementById('imageWidthInput')
        })
    }

    const widthInput = document.getElementById('imageWidthInput')
    if (widthInput) {
        widthInput.addEventListener('input', () => syncConstrainedDimensions('width'))
    }

    const heightInput = document.getElementById('imageHeightInput')
    if (heightInput) {
        heightInput.addEventListener('input', () => syncConstrainedDimensions('height'))
    }

    const constraintCheckbox = document.getElementById('constrainedCheckbox')
    if (constraintCheckbox) {
        constraintCheckbox.addEventListener('change', () => {
            if (constraintCheckbox.checked) {
                syncConstrainedDimensions('width')
            }
        })
    }

    const doubleDimensionsButton = document.getElementById('doubleDimensions')
    if (doubleDimensionsButton) {
        doubleDimensionsButton.addEventListener('click', () => adjustDimensionsByFactor(2))
    }

    const halveDimensionsButton = document.getElementById('halveDimensions')
    if (halveDimensionsButton) {
        halveDimensionsButton.addEventListener('click', () => adjustDimensionsByFactor(0.5))
    }

    const cursorCropButton = document.getElementById('cursorCrop')
    if (cursorCropButton) {
        cursorCropButton.addEventListener('click', triggerCursorCropSelection)
    }

    const menuCursorCrop = document.getElementById('menuCursorCrop')
    if (menuCursorCrop) {
        menuCursorCrop.addEventListener('click', triggerCursorCropSelection)
    }

    const manualCropMenu = document.getElementById('menuManualCrop')
    if (manualCropMenu) {
        manualCropMenu.addEventListener('click', () => {
            openCropPanel(true)
        })
    }

    const closeCropPanelButton = document.getElementById('closeCropPanel')
    if (closeCropPanelButton) {
        closeCropPanelButton.addEventListener('click', () => closeCropPanel())
    }

    const applyCropButton = document.getElementById('applyCrop')
    if (applyCropButton) {
        applyCropButton.addEventListener('click', async () => {
            if (!imageEditor) return

            const startHeightInput = document.getElementById('cropStartHeight')
            const startWidthInput = document.getElementById('cropStartWidth')
            const endHeightInput = document.getElementById('cropEndHeight')
            const endWidthInput = document.getElementById('cropEndWidth')

            if (!startHeightInput || !startWidthInput || !endHeightInput || !endWidthInput) return

            let startHeight = parseInt(startHeightInput.value, 10)
            let startWidth = parseInt(startWidthInput.value, 10)
            let endHeight = parseInt(endHeightInput.value, 10)
            let endWidth = parseInt(endWidthInput.value, 10)

            if ([startHeight, startWidth, endHeight, endWidth].some(value => Number.isNaN(value))) {
                return
            }

            if (startHeight > endHeight) {
                ;[startHeight, endHeight] = [endHeight, startHeight]
            }

            if (startWidth > endWidth) {
                ;[startWidth, endWidth] = [endWidth, startWidth]
            }

            await imageEditor.crop(startHeight, startWidth, endHeight, endWidth)

            setTimeout(() => {
                updateCropInputsFromEditor(imageEditor)
                updateDimensionControlsFromEditor(imageEditor)
                initializeModifiedImageDataModule(imageEditor)
            }, 50)
        })
    }

    const resetImageButton = document.getElementById('resetImage')
    if (resetImageButton) {
        resetImageButton.addEventListener('click', async () => {
            if (!imageEditor) return
            await imageEditor.resetImage()
            setTimeout(() => {
                updateCropInputsFromEditor(imageEditor)
                updateDimensionControlsFromEditor(imageEditor)
                initializeModifiedImageDataModule(imageEditor)
            }, 50)
        })
    }

    const rotateCWButton = document.getElementById('rotateCW90')
    if (rotateCWButton) {
        rotateCWButton.addEventListener('click', async () => {
            if (!imageEditor) return
            await imageEditor.rotate(90)

            setTimeout(() => {
                updateCropInputsFromEditor(imageEditor)
                updateDimensionControlsFromEditor(imageEditor)
                initializeModifiedImageDataModule(imageEditor);
            }, 50)
        })
    }

    const rotateCCWButton = document.getElementById('rotateCCW90')
    if (rotateCCWButton) {
        rotateCCWButton.addEventListener('click', async () => {
            if (!imageEditor) return
            await imageEditor.rotate(-90)

            setTimeout(() => {
                updateCropInputsFromEditor(imageEditor)
                updateDimensionControlsFromEditor(imageEditor)
                initializeModifiedImageDataModule(imageEditor);
            }, 50)
        })
    }


    
    // Filter applications
    document.getElementById('greyscale').addEventListener('click', () => {
        if (!imageEditor) return
        imageEditor.addEffectLayer('Greyscale', greyscale)
        renderLayerProperties(imageEditor)
    })

    document.getElementById('sepia').addEventListener('click', () => {
        if (!imageEditor) return
        imageEditor.addEffectLayer(
            'Sepia',
            sepia,
            {
                intensity: { value: 1, range: [0, 1], valueStep: 0.01 }
            }
        )
        renderLayerProperties(imageEditor)
    })

    document.getElementById('filmEffects').addEventListener('click', () => {
        if (!imageEditor) return
        imageEditor.addEffectLayer(
            'Film Effects',
            filmEffects,
            {
                contrast: { value: 0, range: [0, 255], valueStep: 1 },
                colourPalette: { value: 0, range: [-100, 100], valueStep: 1 }
            }
        )
        renderLayerProperties(imageEditor)
    })

    document.getElementById('hsvAdjust').addEventListener('click', () => {
        if (!imageEditor) return
        const index = imageEditor.changeCanvasHSV(0, 100, 100)
        imageEditor.setSelectedIndex(index)
        renderLayerProperties(imageEditor)
    })
    document.getElementById('paintedStylization').addEventListener('click', () => {
        if (!imageEditor) return
        imageEditor.addEffectLayer(
            'Painted Stylization',
            paintedStylization,
            {
                width: { value: 5, range: [1, 150], valueStep: 1 },
                length: { value: 5, range: [1, 250], valueStep: 1 },
                angle: { value: 145, range: [0, 360], valueStep: 1 },
                sampling: { value: 10, range: [5, 10000], valueStep: 1 },
                edgeThreshold: { value: 100, range: [1, 255], valueStep: 1 },
                overwritePixels: { value: false },
                overwriteEdges: { value: false }
            }
        )
        renderLayerProperties(imageEditor)
    })


    // Visualization filters (for concepts from labs and other cool things that I couldn't fit neatly into a catagory.)
    document.getElementById('pointsInSpace').addEventListener('click', () => {
        if (!imageEditor) return
        imageEditor.addEffectLayer(
            'Points In Space',
            pointsInSpace,
            {
                sampling: {value: 10, range: [2, 100], valueStep: 1}
            }
        )
        renderLayerProperties(imageEditor)
    })

    document.getElementById('vectorsInSpace').addEventListener('click', () => {
        if (!imageEditor) return
        imageEditor.addEffectLayer(
            'Vectors In Space',
            vectorsInSpace,
            {
                width: { value: 1, range: [1, 500], valueStep: 1 },
                length: { value: 3, range: [1, 1000], valueStep: 1 },
                angle: {value: 0, range: [0, 360], valueStep: 1 },
                sampling: {value: 10, range: [2, 1000000], valueStep: 1},
                R: {value: 255, range: [0, 255], valueStep: 1},
                G: {value: 255, range: [0, 255], valueStep: 1},
                B: {value: 255, range: [0, 255], valueStep: 1},
                A: {value: 255, range: [0, 255], valueStep: 1}
            }
        )
        renderLayerProperties(imageEditor)
    })

    document.getElementById('sobelEdges').addEventListener('click', () => {
        if (!imageEditor) return
        imageEditor.addEffectLayer(
            'Sobel Edges',
            sobelEdges,
            {
                edgeThreshold: {value: 50, range: [0, 255], valueStep: 1},
                edgeColor: { value: '#ffffff' },
                blackoutBackground: { value: true },
                transparentBackground: { value: false }
            }
        )
        renderLayerProperties(imageEditor)
    })
    
    document.getElementById('sobelEdgesColouredDirections').addEventListener('click', () => {
        if (!imageEditor) return
        imageEditor.addEffectLayer(
            'Sobel Edges (Colour)',
            sobelEdgesColouredDirections,
            {
                edgeThreshold: {value: 50, range: [0, 255], valueStep: 1},
                colorX: { value: '#ff0000' },
                colorY: { value: '#00ff00' },
                blackoutBackground: { value: true },
                transparentBackground: { value: false }
            }
        )
        renderLayerProperties(imageEditor)
    })

    document.getElementById('prewireEdges').addEventListener('click', () => {
        if (!imageEditor) return
        imageEditor.addEffectLayer(
            'Prewire Edges',
            prewireEdges,
            {
                edgeThreshold: {value: 50, range: [0, 255], valueStep: 1},
                edgeColor: { value: '#ffffff' },
                blackoutBackground: { value: true },
                transparentBackground: { value: false }
            }
        )
        renderLayerProperties(imageEditor)
    })

    document.getElementById('prewireEdgesColouredDirections').addEventListener('click', () => {
        if (!imageEditor) return
        imageEditor.addEffectLayer(
            'Prewire Edges (Colour)',
            prewireEdgesColouredDirections,
            {
                edgeThreshold: {value: 50, range: [0, 255], valueStep: 1},
                colorX: { value: '#ff0000' },
                colorY: { value: '#00ff00' },
                blackoutBackground: { value: true },
                transparentBackground: { value: false }
            }
        )
        renderLayerProperties(imageEditor)
    })

    // GIF Animator button (add this to your HTML with id="createGifBtn")
    const createGifBtn = document.getElementById('createGifBtn')
    if (createGifBtn) {
        createGifBtn.addEventListener('click', openGifAnimatorDialog)
    }

    // GIF Frame Editor button
    const editGifBtn = document.getElementById('editGifBtn')
    if (editGifBtn) {
        editGifBtn.addEventListener('click', openGifFrameEditorDialog)
    }

    // GIF Play/Stop button on canvas
    const gifPlayStopBtn = document.getElementById('gifPlayStopBtn')
    if (gifPlayStopBtn) {
        gifPlayStopBtn.addEventListener('click', () => {
            const isPlaying = toggleGifPlayback(window.imageEditor, (frameIndex) => {
                // Update frame counter in dialog if open
                const frameCounter = document.getElementById('gifFrameCounter')
                if (frameCounter) {
                    frameCounter.textContent = `${frameIndex + 1} / ${gifFrameStack.length}`
                }
            })
            
            if (isPlaying) {
                gifPlayStopBtn.classList.add('playing')
            } else {
                gifPlayStopBtn.classList.remove('playing')
            }
        })
    }

    // Setup GIF animator dialog event listeners
    document.addEventListener('click', (event) => {
        if (event.target.id === 'closeGifAnimator') {
            closeGifAnimatorDialog()
        }
        if (event.target.id === 'createGifAnimation') {
            handleCreateGifAnimation()
        }
        if (event.target.id === 'previewGifAnimation') {
            handlePreviewAnimation()
        }
        if (event.target.id === 'stopGifPreview') {
            handleStopPreview()
        }
    })
    
    // Update size estimate when GIF parameters change
    document.addEventListener('input', (event) => {
        const updateIds = ['gifFrameCount', 'gifFrameDelay', 'gifScale', 'gifPingPong']
        if (updateIds.includes(event.target.id)) {
            updateGifSizeEstimate()
        }
    })
    
    document.addEventListener('change', (event) => {
        const updateIds = ['gifScale', 'gifPingPong']
        if (updateIds.includes(event.target.id)) {
            updateGifSizeEstimate()
        }
    })

    // Close GIF dialog when clicking outside
    document.addEventListener('click', (event) => {
        if (event.target.id === 'gifAnimatorDialog') {
            closeGifAnimatorDialog()
        }
    })

    // Close GIF dialog with Escape key
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && gifAnimatorDialog && !gifAnimatorDialog.classList.contains('hidden')) {
            closeGifAnimatorDialog()
        }
    })

    // Histogram Panel
    const openHistogramBtn = document.getElementById('openHistogram')
    if (openHistogramBtn) {
        openHistogramBtn.addEventListener('click', () => {
            if (!imageEditor) {
                alert('Please load an image first')
                return
            }
            openHistogramWindow(imageEditor)
        })
    }

    // Color Info Panel
    const openColorInfoBtn = document.getElementById('openColorInfo')
    if (openColorInfoBtn) {
        openColorInfoBtn.addEventListener('click', () => {
            if (!imageEditor) {
                alert('Please load an image first')
                return
            }
            openColorInfoWindow(imageEditor)
        })
    }

    // Image Statistics Panel
    const openImageStatsBtn = document.getElementById('openImageStats')
    if (openImageStatsBtn) {
        openImageStatsBtn.addEventListener('click', () => {
            if (!imageEditor) {
                alert('Please load an image first')
                return
            }
            openImageStatsWindow(imageEditor)
        })
    }

    // ═══════════════════════════════════════════════════════════════════════
    // WINDOWS MENU HANDLERS
    // ═══════════════════════════════════════════════════════════════════════
    
    // Toggle Layers Window
    document.getElementById('toggleLayersWindow')?.addEventListener('click', () => {
        toggleLayersWindow()
    })
    
    // Toggle Properties Window
    document.getElementById('togglePropsWindow')?.addEventListener('click', () => {
        toggleImagePropertiesWindow()
    })
    
    // Windows menu analysis panel buttons
    document.getElementById('windowOpenHistogram')?.addEventListener('click', () => {
        if (!imageEditor) {
            alert('Please load an image first')
            return
        }
        openHistogramWindow(imageEditor)
    })
    
    document.getElementById('windowOpenColorInfo')?.addEventListener('click', () => {
        if (!imageEditor) {
            alert('Please load an image first')
            return
        }
        openColorInfoWindow(imageEditor)
    })
    
    document.getElementById('windowOpenStats')?.addEventListener('click', () => {
        if (!imageEditor) {
            alert('Please load an image first')
            return
        }
        openImageStatsWindow(imageEditor)
    })
    
    // Reset Window Layout
    document.getElementById('resetWindowLayout')?.addEventListener('click', () => {
        // Clear saved window states
        localStorage.removeItem('wm-window-states')
        
        // Reload the page to reset everything
        if (confirm('This will reset all window positions and reload the page. Continue?')) {
            location.reload()
        }
    })
})

window.addEventListener('keydown', handleKeyboardShortcuts)