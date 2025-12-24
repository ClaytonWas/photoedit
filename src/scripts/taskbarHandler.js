import { ImageEditor } from './core/imageEditor.js'
import { initializeModifiedImageDataModule } from './canvasHandler.js'
import { renderLayerProperties } from './layersHandler.js'
import { paintedStylization, pointsInSpace, vectorsInSpace, sobelEdges, sobelEdgesColouredDirections, prewireEdges, prewireEdgesColouredDirections } from './plugins/paintedStylization.js'
import { filmEffects } from './plugins/filmEffects.js'
import { greyscale } from './plugins/greyscale.js'
import { sepia } from './plugins/sepia.js'


let imageEditor = null
let undoMenuItem = null
let redoMenuItem = null

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
    fileInput.onchange = uploadImage
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

    if (isRendering) {
        setStatus('isRendering', 'Rendering…')
        return
    }

    if (renderFailed) {
        setStatus('isError', 'Render failed')
        setTimeout(() => setStatus('isReady', 'Ready'), 2000)
        return
    }

    setStatus('isReady', 'Ready')
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

    document.title = 'PhotoEdits'

    updateHistoryMenuState()
}

async function uploadImage() {
    const file = document.querySelector("input[type=file]").files[0]
    if (!file) return

    resetEditor()

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

window.addEventListener('load', () => {

    /*
    * Mobile Menu Navigation Setup
    */
    
    const menuOverlay = document.getElementById('menuOverlay')
    const menuPanels = {
        navFile: document.getElementById('fileMenu'),
        navImage: document.getElementById('imageMenu'),
        navFilter: document.getElementById('filterMenu'),
        navVisual: document.getElementById('visualMenu'),
        navLayers: document.getElementById('layersMenu')
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
        saveActionButton.addEventListener('click', () => {
            if (!imageEditor) return
            imageEditor.quickExport()
        })
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
                blackoutBackground: { value: true },
                transparentBackground: { value: false }
            }
        )
        renderLayerProperties(imageEditor)
    })
})

window.addEventListener('keydown', handleKeyboardShortcuts)