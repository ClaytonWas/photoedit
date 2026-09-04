import { ImageEditor } from './core/imageEditor.js'
import { initializeModifiedImageDataModule } from './canvasHandler.js'
import { renderLayerProperties } from './layersHandler.js'
import { paintedStylization, pointsInSpace, vectorsInSpace, sobelEdges, sobelEdgesColouredDirections, prewireEdges, prewireEdgesColouredDirections } from './plugins/paintedStylization.js'
import { filmEffects } from './plugins/filmEffects.js'
import { greyscale } from './plugins/greyscale.js'
import { sepia } from './plugins/sepia.js'
import { createSliderAnimation, exportSliderAnimationAsGif, previewAnimation, downloadBlob, loadGifFrames, gifFrameStack, loadFrameToEditor, saveEditorToFrame, exportFrameStackAsGif, applyLayerStackToFrames, createMultiParameterAnimation, getAnimatableParameters, isGifPlaying, startGifPlayback, stopGifPlayback, toggleGifPlayback } from './plugins/gifAnimator.js'
import { openHistogramWindow, initHistogram, queueHistogramUpdate, isHistogramOpen } from './plugins/histogram.js'
import { openColorInfoWindow, initColorInfo, isColorInfoOpen } from './plugins/colorInfo.js'
import { openImageStatsWindow, isImageStatsOpen, refreshImageStats } from './plugins/imageStats.js'
import { toggleLayersWindow, toggleImagePropertiesWindow, getLayersWindow, getImagePropertiesWindow } from './core/dockablePanels.js'
import { windowManager } from './core/windowManager.js'
import { viewport } from './core/viewport.js'
import { CropTool, CROP_ASPECT_PRESETS } from './tools/cropTool.js'
import { openGifStudio, notifyFramesChanged } from './gif/gifStudio.js'
import * as exifr from 'exifr'

// RAW file extensions supported via embedded preview extraction (Set for O(1) lookup)
const RAW_EXTENSIONS = new Set([
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
])


let imageEditor = null
let undoMenuItem = null
let redoMenuItem = null
let renderStatusPollInterval = null

/**
 * Get the active image editor instance
 * Provides a consistent way to access the editor with fallback to window.imageEditor
 */
function getActiveEditor() {
    return imageEditor ?? window.imageEditor ?? null
}

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

// ── Crop tool ──────────────────────────────────────────────────────────────────
// The tool owns the selection; the panel is a numeric inspector for it rather than
// the thing that commits the crop.

let cropTool = null

function ensureCropTool() {
    if (cropTool) return cropTool
    const host = document.querySelector('.imageViewingModule')
    if (!host) return null

    cropTool = new CropTool({
        host,
        viewport,
        getEditor: () => getActiveEditor(),
        onChange: (rect) => writeCropInputs(rect),
        onCommit: (rect) => applyCropRect(rect),
        onCancel: () => {
            window.isCropping = false
            closeCropPanel({ keepTool: true })
        }
    })
    return cropTool
}

function writeCropInputs(rect) {
    if (!rect) return
    safeSetInputValue('cropStartWidth', rect.x)
    safeSetInputValue('cropStartHeight', rect.y)
    safeSetInputValue('cropEndWidth', rect.x + rect.width)
    safeSetInputValue('cropEndHeight', rect.y + rect.height)
    const readout = document.getElementById('cropSizeReadout')
    if (readout) readout.textContent = `${rect.width} × ${rect.height}`
}

function readCropInputs() {
    const values = ['cropStartWidth', 'cropStartHeight', 'cropEndWidth', 'cropEndHeight']
        .map(id => parseInt(document.getElementById(id)?.value, 10))
    if (values.some(Number.isNaN)) return null
    const [sx, sy, ex, ey] = values
    return {
        x: Math.min(sx, ex),
        y: Math.min(sy, ey),
        width: Math.abs(ex - sx),
        height: Math.abs(ey - sy)
    }
}

function openCropPanel(focusManualFields = false) {
    const panel = getCropPanel()
    if (!panel) return
    panel.classList.remove('hidden')
    if (focusManualFields) focusElementById('cropStartWidth')
}

function closeCropPanel({ keepTool = false } = {}) {
    if (!keepTool) cancelCursorCropSelection()
    const panel = getCropPanel()
    if (panel) panel.classList.add('hidden')
}

function cancelCursorCropSelection() {
    cropTool?.deactivate()
    // Legacy flag: nothing gates on it any more, but it is still read by older
    // code paths and by tests, so keep it truthful.
    window.isCropping = false
}

function triggerCursorCropSelection() {
    if (!getActiveEditor()) return
    const tool = ensureCropTool()
    if (!tool) return
    openCropPanel()
    window.isCropping = true
    tool.activate()
}

async function applyCropRect(rect) {
    const editor = getActiveEditor()
    if (!editor || !rect) return
    cancelCursorCropSelection()
    closeCropPanel({ keepTool: true })
    await editor.cropRect(rect)
    updateCropInputsFromEditor(editor)
    updateDimensionControlsFromEditor(editor)
    initializeModifiedImageDataModule(editor)
}

function setupCropPanelControls() {
    const aspectSelect = document.getElementById('cropAspect')
    if (aspectSelect && !aspectSelect.options.length) {
        for (const preset of CROP_ASPECT_PRESETS) {
            const option = document.createElement('option')
            option.value = String(preset.ratio)
            option.textContent = preset.label
            aspectSelect.appendChild(option)
        }
        aspectSelect.addEventListener('change', () => {
            const raw = aspectSelect.value
            const ratio = raw === 'null' ? null : raw === 'original' ? 'original' : Number(raw)
            ensureCropTool()?.setAspect(ratio)
        })
    }

    // Typing in the numeric fields drives the on-canvas rectangle.
    for (const id of ['cropStartWidth', 'cropStartHeight', 'cropEndWidth', 'cropEndHeight']) {
        const input = document.getElementById(id)
        input?.addEventListener('input', () => {
            const rect = readCropInputs()
            if (rect && cropTool?.active) cropTool.setRect(rect, { silent: true })
        })
    }

    document.getElementById('cropSelectAll')?.addEventListener('click', () => {
        const editor = getActiveEditor()
        if (!editor) return
        const tool = ensureCropTool()
        if (!tool) return
        if (!tool.active) { window.isCropping = true; tool.activate() }
        tool.setRect({ x: 0, y: 0, width: editor.canvas.width, height: editor.canvas.height })
    })
}

function adjustDimensionsByFactor(factor) {
    if (!Number.isFinite(factor) || factor <= 0) return
    const widthInput = document.getElementById('imageWidthInput')
    const heightInput = document.getElementById('imageHeightInput')
    const windowWidthInput = document.getElementById('windowImageWidthInput')
    const windowHeightInput = document.getElementById('windowImageHeightInput')
    if (!widthInput || !heightInput) return

    const fallbackWidth = imageEditor?.image?.width
    const fallbackHeight = imageEditor?.image?.height

    const currentWidth = parseFloat(widthInput.value)
    const currentHeight = parseFloat(heightInput.value)

    const baseWidth = Number.isFinite(currentWidth) && currentWidth > 0 ? currentWidth : fallbackWidth
    const baseHeight = Number.isFinite(currentHeight) && currentHeight > 0 ? currentHeight : fallbackHeight

    if (!Number.isFinite(baseWidth) || !Number.isFinite(baseHeight)) return

    const newWidth = Math.max(1, Math.round(baseWidth * factor))
    const newHeight = Math.max(1, Math.round(baseHeight * factor))
    
    widthInput.value = newWidth
    heightInput.value = newHeight
    if (windowWidthInput) windowWidthInput.value = newWidth
    if (windowHeightInput) windowHeightInput.value = newHeight
}

function syncConstrainedDimensions(changedField) {
    const constraintCheckbox = document.getElementById('constrainedCheckbox')
    if (!constraintCheckbox || !constraintCheckbox.checked) return
    if (!imageEditor || !imageEditor.image) return

    const widthInput = document.getElementById('imageWidthInput')
    const heightInput = document.getElementById('imageHeightInput')
    const windowWidthInput = document.getElementById('windowImageWidthInput')
    const windowHeightInput = document.getElementById('windowImageHeightInput')
    if (!widthInput || !heightInput) return

    const ratio = imageEditor.image.width / imageEditor.image.height
    if (!Number.isFinite(ratio) || ratio <= 0) return

    if (changedField === 'width') {
        const newWidth = parseFloat(widthInput.value)
        if (!Number.isFinite(newWidth) || newWidth <= 0) return
        const newHeight = Math.max(1, Math.round(newWidth / ratio))
        heightInput.value = newHeight
        if (windowHeightInput) windowHeightInput.value = newHeight
    } else if (changedField === 'height') {
        const newHeight = parseFloat(heightInput.value)
        if (!Number.isFinite(newHeight) || newHeight <= 0) return
        const newWidth = Math.max(1, Math.round(newHeight * ratio))
        widthInput.value = newWidth
        if (windowWidthInput) windowWidthInput.value = newWidth
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
    } else if (key === 'o') {
        event.preventDefault()
        triggerOpenFileDialog()
    } else if (key === 's') {
        event.preventDefault()
        if (imageEditor) {
            imageEditor.quickExport()
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
    const desktopRenderStatus = document.getElementById('desktopRenderStatus')
    const hasImage = !!imageEditor
    
    const setStatus = (element, stateClass, label) => {
        if (!element) return
        const statusLabel = element.querySelector('span')
        element.classList.remove('isRendering', 'isError', 'isReady', 'noImage')
        if (stateClass) {
            element.classList.add(stateClass)
        }
        if (statusLabel) {
            statusLabel.textContent = label
        }
    }

    if (renderFailed) {
        setStatus(renderStatus, 'isError', 'Render failed')
        setStatus(desktopRenderStatus, 'isError', 'Error')
        setTimeout(() => {
            const defaultLabel = hasImage ? 'Ready' : 'No Image'
            setStatus(renderStatus, 'isReady', defaultLabel)
            setStatus(desktopRenderStatus, 'isReady', defaultLabel)
        }, 2000)
        return
    }

    if (isRendering) {
        setStatus(renderStatus, 'isRendering', 'Rendering…')
        setStatus(desktopRenderStatus, 'isRendering', 'Rendering…')
    } else {
        const defaultLabel = hasImage ? 'Ready' : 'No Image'
        setStatus(renderStatus, 'isReady', defaultLabel)
        setStatus(desktopRenderStatus, 'isReady', defaultLabel)
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

function resetEditor() {
    // Playback drives the shared canvas, so it has to stop before a new image takes over.
    stopGifPlayback()
    const gifPlayStopBtn = document.getElementById('gifPlayStopBtn')
    if (gifPlayStopBtn) {
        gifPlayStopBtn.classList.remove('playing')
    }

    // Drop any armed cursor-crop selection so pan/zoom stays usable.
    cancelCursorCropSelection()
    stopRenderStatusPolling()

    if (imageEditor) {
        // Release the render worker and cached frames of the outgoing editor.
        imageEditor.dispose?.()
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
    
    // Use the consolidated image processing function
    const imageFiles = files.filter(f => isImageFile(f))
    await processDroppedImages(imageFiles)
}

/**
 * Split a filename into its base name and lower-cased extension (without the dot).
 * Files with no extension keep their full name instead of collapsing to an empty string.
 */
function splitFileName(fileName) {
    const dotIndex = fileName.lastIndexOf('.')
    if (dotIndex <= 0) return { baseName: fileName, extension: '' }
    return {
        baseName: fileName.substring(0, dotIndex),
        extension: fileName.substring(dotIndex + 1).toLowerCase()
    }
}

/**
 * Check if a file is a supported image (standard format or RAW)
 */
function isImageFile(file) {
    if (file.type.startsWith('image/')) return true
    const { extension } = splitFileName(file.name)
    return extension ? RAW_EXTENSIONS.has(`.${extension}`) : false
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
 * Process image files (from file input or drag-drop)
 * Single image: load normally (supports RAW, GIF, standard formats)
 * Multiple images: compose into GIF
 */
async function processDroppedImages(files) {
    if (files.length === 0) return

    if (files.length === 1) {
        // Single file - load directly
        const file = files[0]
        resetEditor()

        const { baseName, extension: fileExtension } = splitFileName(file.name)
        const isRaw = RAW_EXTENSIONS.has(`.${fileExtension}`)

        if (isRaw) {
            await uploadRawImage(file)
            return
        }

        const isGif = file.type === 'image/gif' || fileExtension === 'gif'

        if (isGif) {
            // Load GIF with frame stack
            try {
                await loadGifFrames(file)


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
                    const name = baseName
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

            const gifPlayStopBtn = document.getElementById('gifPlayStopBtn')
            if (gifPlayStopBtn) {
                gifPlayStopBtn.classList.add('hidden')
            }

            gifFrameStack.clear()
            notifyFramesChanged()

            // Standard image loading
            const reader = new FileReader()
            const image = new Image()

            const name = baseName
            // Prefer the browser-reported MIME type, but fall back to the filename so a
            // file with a missing type still gets a usable type/extension pair.
            const type = file.type || (fileExtension ? `image/${fileExtension}` : 'image/png')
            const extension = type.slice(6) || fileExtension || 'png'
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
        notifyFramesChanged()
        
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
    const isRaw = RAW_EXTENSIONS.has(`.${splitFileName(file.name).extension}`)
    
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
        
        const gifPlayStopBtn = document.getElementById('gifPlayStopBtn')
        if (gifPlayStopBtn) {
            gifPlayStopBtn.classList.add('hidden')
        }
        
        // Clear frame stack and thumbnail cache
        gifFrameStack.clear()
        notifyFramesChanged()
        
        // Extract preview from RAW file
        const image = await extractRawPreview(file)
        
        // File Metadata
        const { baseName: name } = splitFileName(file.name)
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

// Expose for global access
window.openGifStudio = openGifStudio
window.createSliderAnimation = createSliderAnimation
window.exportSliderAnimationAsGif = exportSliderAnimationAsGif
window.getAnimatableParameters = getAnimatableParameters
window.previewAnimation = previewAnimation
window.gifFrameStack = gifFrameStack
window.loadGifFrames = loadGifFrames
window.loadFrameToEditor = loadFrameToEditor
window.saveEditorToFrame = saveEditorToFrame
window.exportFrameStackAsGif = exportFrameStackAsGif
window.applyLayerStackToFrames = applyLayerStackToFrames
window.createMultiParameterAnimation = createMultiParameterAnimation
window.isGifPlaying = isGifPlaying
window.startGifPlayback = startGifPlayback
window.stopGifPlayback = stopGifPlayback
window.toggleGifPlayback = toggleGifPlayback
window.getActiveEditor = getActiveEditor

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
    
    // Update status when image editor is ready
    window.addEventListener('imageEditorReady', () => {
        updateRenderStatus(false, false)
    })

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

    const exportActionButton = document.getElementById('exportAction')
    if (exportActionButton) {
        exportActionButton.addEventListener('click', async () => {
            console.log('Export button clicked, imageEditor:', imageEditor)
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
            // Prefer the tool's live rectangle; fall back to the numeric fields when
            // the panel is being used on its own.
            const rect = (cropTool?.active && cropTool.getRect()) || readCropInputs()
            if (!rect || rect.width < 1 || rect.height < 1) return
            await applyCropRect(rect)
        })
    }

    setupCropPanelControls()

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
        createGifBtn.addEventListener('click', openGifStudio)
    }

    // GIF Frame Editor button

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
    
    document.getElementById('windowOpenGifStudio')?.addEventListener('click', () => openGifStudio())

    document.getElementById('windowOpenStats')?.addEventListener('click', () => {
        if (!imageEditor) {
            alert('Please load an image first')
            return
        }
        openImageStatsWindow(imageEditor)
    })
    
    // Reset Window Layout
    document.getElementById('resetWindowLayout')?.addEventListener('click', () => {
        // Ask before discarding the layout, then clear and reload.
        if (!confirm('This will reset all window positions and reload the page. Continue?')) return
        windowManager.clearAllSavedStates()
        location.reload()
    })

    // ═══════════════════════════════════════════════════════════════════════
    // DESKTOP MENU BAR (1024px+ only)
    // ═══════════════════════════════════════════════════════════════════════
    
    const desktopMenuBar = document.getElementById('desktopMenuBar')
    if (desktopMenuBar) {
        const menuBarItems = desktopMenuBar.querySelectorAll('.menuBarItem')
        let activeMenu = null
        let menuBarActive = false
        
        function closeDesktopMenus() {
            menuBarItems.forEach(item => item.classList.remove('active'))
            activeMenu = null
            menuBarActive = false
        }
        
        function openDesktopMenu(menuItem) {
            closeDesktopMenus()
            menuItem.classList.add('active')
            activeMenu = menuItem
            menuBarActive = true
        }
        
        // Click to open menu
        menuBarItems.forEach(item => {
            const label = item.querySelector(':scope > span')
            if (label) {
                label.addEventListener('click', (e) => {
                    e.stopPropagation()
                    if (item.classList.contains('active')) {
                        closeDesktopMenus()
                    } else {
                        openDesktopMenu(item)
                    }
                })
            }
            
            // Hover to switch menus when one is already open
            item.addEventListener('mouseenter', () => {
                if (menuBarActive && activeMenu !== item) {
                    openDesktopMenu(item)
                }
            })
        })
        
        // Close menus when clicking outside
        document.addEventListener('click', (e) => {
            if (!desktopMenuBar.contains(e.target)) {
                closeDesktopMenus()
            }
        })
        
        // Close menus on Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && menuBarActive) {
                closeDesktopMenus()
            }
        })
        
        // Desktop menu item handlers - close menu after action
        const closeAndRun = (fn) => {
            closeDesktopMenus()
            fn()
        }
        
        // Desktop Undo/Redo references
        const desktopUndoBtn = document.getElementById('desktopUndoAction')
        const desktopRedoBtn = document.getElementById('desktopRedoAction')
        
        // Sync desktop undo/redo state with mobile
        const originalUpdateHistoryMenuState = updateHistoryMenuState
        updateHistoryMenuState = (detail = { undoAvailable: false, redoAvailable: false }) => {
            originalUpdateHistoryMenuState(detail)
            setMenuItemDisabled(desktopUndoBtn, !detail.undoAvailable)
            setMenuItemDisabled(desktopRedoBtn, !detail.redoAvailable)
        }
        
        // FILE MENU
        document.getElementById('desktopOpenFile')?.addEventListener('click', () => closeAndRun(triggerOpenFileDialog))
        document.getElementById('desktopExportAction')?.addEventListener('click', () => closeAndRun(async () => {
            if (!imageEditor) return
            await imageEditor.quickExport()
        }))
        document.getElementById('desktopCreateGifBtn')?.addEventListener('click', () => closeAndRun(openGifStudio))
        document.getElementById('desktopEditGifBtn')?.addEventListener('click', () => closeAndRun(openGifStudio))
        desktopUndoBtn?.addEventListener('click', () => closeAndRun(async () => {
            if (!imageEditor || desktopUndoBtn.disabled) return
            await imageEditor.undo()
        }))
        desktopRedoBtn?.addEventListener('click', () => closeAndRun(async () => {
            if (!imageEditor || desktopRedoBtn.disabled) return
            await imageEditor.redo()
        }))
        
        // IMAGE MENU
        document.getElementById('desktopRotateCW90')?.addEventListener('click', () => closeAndRun(async () => {
            if (!imageEditor) return
            await imageEditor.rotate(90)
            setTimeout(() => {
                updateCropInputsFromEditor(imageEditor)
                updateDimensionControlsFromEditor(imageEditor)
                initializeModifiedImageDataModule(imageEditor)
            }, 50)
        }))
        document.getElementById('desktopRotateCCW90')?.addEventListener('click', () => closeAndRun(async () => {
            if (!imageEditor) return
            await imageEditor.rotate(-90)
            setTimeout(() => {
                updateCropInputsFromEditor(imageEditor)
                updateDimensionControlsFromEditor(imageEditor)
                initializeModifiedImageDataModule(imageEditor)
            }, 50)
        }))
        document.getElementById('desktopCursorCrop')?.addEventListener('click', () => closeAndRun(triggerCursorCropSelection))
        document.getElementById('desktopManualCrop')?.addEventListener('click', () => closeAndRun(() => openCropPanel(true)))
        document.getElementById('desktopResetImage')?.addEventListener('click', () => closeAndRun(async () => {
            if (!imageEditor) return
            await imageEditor.resetImage()
            setTimeout(() => {
                updateCropInputsFromEditor(imageEditor)
                updateDimensionControlsFromEditor(imageEditor)
                initializeModifiedImageDataModule(imageEditor)
            }, 50)
        }))
        
        // FILTER MENU
        document.getElementById('desktopGreyscale')?.addEventListener('click', () => closeAndRun(() => {
            if (!imageEditor) return
            imageEditor.addEffectLayer('Greyscale', greyscale)
            renderLayerProperties(imageEditor)
        }))
        document.getElementById('desktopSepia')?.addEventListener('click', () => closeAndRun(() => {
            if (!imageEditor) return
            imageEditor.addEffectLayer('Sepia', sepia, { intensity: { value: 1, range: [0, 1], valueStep: 0.01 } })
            renderLayerProperties(imageEditor)
        }))
        document.getElementById('desktopFilmEffects')?.addEventListener('click', () => closeAndRun(() => {
            if (!imageEditor) return
            imageEditor.addEffectLayer('Film Effects', filmEffects, {
                contrast: { value: 0, range: [0, 255], valueStep: 1 },
                colourPalette: { value: 0, range: [-100, 100], valueStep: 1 }
            })
            renderLayerProperties(imageEditor)
        }))
        document.getElementById('desktopPaintedStylization')?.addEventListener('click', () => closeAndRun(() => {
            if (!imageEditor) return
            imageEditor.addEffectLayer('Painted Stylization', paintedStylization, {
                width: { value: 5, range: [1, 150], valueStep: 1 },
                length: { value: 5, range: [1, 250], valueStep: 1 },
                angle: { value: 145, range: [0, 360], valueStep: 1 },
                sampling: { value: 10, range: [5, 10000], valueStep: 1 },
                edgeThreshold: { value: 100, range: [1, 255], valueStep: 1 },
                overwritePixels: { value: false },
                overwriteEdges: { value: false }
            })
            renderLayerProperties(imageEditor)
        }))
        document.getElementById('desktopHsvAdjust')?.addEventListener('click', () => closeAndRun(() => {
            if (!imageEditor) return
            const index = imageEditor.changeCanvasHSV(0, 100, 100)
            imageEditor.setSelectedIndex(index)
            renderLayerProperties(imageEditor)
        }))
        
        // VISUALIZATIONS (in Filter menu)
        document.getElementById('desktopPointsInSpace')?.addEventListener('click', () => closeAndRun(() => {
            if (!imageEditor) return
            imageEditor.addEffectLayer('Points In Space', pointsInSpace, {
                sampling: { value: 10, range: [2, 100], valueStep: 1 }
            })
            renderLayerProperties(imageEditor)
        }))
        document.getElementById('desktopVectorsInSpace')?.addEventListener('click', () => closeAndRun(() => {
            if (!imageEditor) return
            imageEditor.addEffectLayer('Vectors In Space', vectorsInSpace, {
                width: { value: 1, range: [1, 500], valueStep: 1 },
                length: { value: 3, range: [1, 1000], valueStep: 1 },
                angle: { value: 0, range: [0, 360], valueStep: 1 },
                sampling: { value: 10, range: [2, 1000000], valueStep: 1 },
                R: { value: 255, range: [0, 255], valueStep: 1 },
                G: { value: 255, range: [0, 255], valueStep: 1 },
                B: { value: 255, range: [0, 255], valueStep: 1 },
                A: { value: 255, range: [0, 255], valueStep: 1 }
            })
            renderLayerProperties(imageEditor)
        }))
        document.getElementById('desktopSobelEdges')?.addEventListener('click', () => closeAndRun(() => {
            if (!imageEditor) return
            imageEditor.addEffectLayer('Sobel Edges', sobelEdges, {
                edgeThreshold: { value: 50, range: [0, 255], valueStep: 1 },
                edgeColor: { value: '#ffffff' },
                blackoutBackground: { value: true },
                transparentBackground: { value: false }
            })
            renderLayerProperties(imageEditor)
        }))
        document.getElementById('desktopSobelEdgesColoured')?.addEventListener('click', () => closeAndRun(() => {
            if (!imageEditor) return
            imageEditor.addEffectLayer('Sobel Edges (Colour)', sobelEdgesColouredDirections, {
                edgeThreshold: { value: 50, range: [0, 255], valueStep: 1 },
                colorX: { value: '#ff0000' },
                colorY: { value: '#00ff00' },
                blackoutBackground: { value: true },
                transparentBackground: { value: false }
            })
            renderLayerProperties(imageEditor)
        }))
        document.getElementById('desktopPrewireEdges')?.addEventListener('click', () => closeAndRun(() => {
            if (!imageEditor) return
            imageEditor.addEffectLayer('Prewire Edges', prewireEdges, {
                edgeThreshold: { value: 50, range: [0, 255], valueStep: 1 },
                edgeColor: { value: '#ffffff' },
                blackoutBackground: { value: true },
                transparentBackground: { value: false }
            })
            renderLayerProperties(imageEditor)
        }))
        document.getElementById('desktopPrewireEdgesColoured')?.addEventListener('click', () => closeAndRun(() => {
            if (!imageEditor) return
            imageEditor.addEffectLayer('Prewire Edges (Colour)', prewireEdgesColouredDirections, {
                edgeThreshold: { value: 50, range: [0, 255], valueStep: 1 },
                colorX: { value: '#ff0000' },
                colorY: { value: '#00ff00' },
                blackoutBackground: { value: true },
                transparentBackground: { value: false }
            })
            renderLayerProperties(imageEditor)
        }))
        
        // WINDOW MENU
        document.getElementById('desktopToggleLayers')?.addEventListener('click', () => closeAndRun(toggleLayersWindow))
        document.getElementById('desktopToggleProps')?.addEventListener('click', () => closeAndRun(toggleImagePropertiesWindow))
        document.getElementById('desktopOpenHistogram')?.addEventListener('click', () => closeAndRun(() => {
            if (!imageEditor) { alert('Please load an image first'); return }
            openHistogramWindow(imageEditor)
        }))
        document.getElementById('desktopOpenColorInfo')?.addEventListener('click', () => closeAndRun(() => {
            if (!imageEditor) { alert('Please load an image first'); return }
            openColorInfoWindow(imageEditor)
        }))
        document.getElementById('desktopOpenGifStudio')?.addEventListener('click', () => closeAndRun(openGifStudio))
        document.getElementById('desktopOpenStats')?.addEventListener('click', () => closeAndRun(() => {
            if (!imageEditor) { alert('Please load an image first'); return }
            openImageStatsWindow(imageEditor)
        }))
        document.getElementById('desktopResetLayout')?.addEventListener('click', () => closeAndRun(() => {
            if (!confirm('This will reset all window positions and reload the page. Continue?')) return
            windowManager.clearAllSavedStates()
            location.reload()
        }))
        
    }
})

window.addEventListener('keydown', handleKeyboardShortcuts)