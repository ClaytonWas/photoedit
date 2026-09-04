import { viewport } from './core/viewport.js'

let metadataControlsInitialised = false

// Default values for image properties when no image is loaded
const DEFAULT_IMAGE_PROPERTIES = {
    name: 'Untitled',
    width: 800,
    height: 600,
    extension: 'png'
}

/**
 * Write a value into an input unless the user is currently editing it.
 * Renders fire constantly while sliders move, and each one refreshes these fields;
 * without this guard a half-typed width or name is wiped out mid-edit.
 */
function setInputValuePreservingEdits(element, value) {
    if (!element) return
    if (document.activeElement === element) return
    if (element.value !== String(value)) {
        element.value = value
    }
}

function updateDimensionInputs(imageEditor) {
    const width = Math.round(imageEditor.image.width)
    const height = Math.round(imageEditor.image.height)

    setInputValuePreservingEdits(document.getElementById('imageWidthInput'), width)
    setInputValuePreservingEdits(document.getElementById('imageHeightInput'), height)
    setInputValuePreservingEdits(document.getElementById('windowImageWidthInput'), width)
    setInputValuePreservingEdits(document.getElementById('windowImageHeightInput'), height)
}

/**
 * Populate image properties with default values when no image is loaded
 */
export function populateDefaultImageProperties() {
    const titleName = document.getElementById('titleNameModified')
    if (titleName) titleName.textContent = 'Name:'
    
    // Populate both original and window inputs
    const imageNameInput = document.getElementById('imageNameInput')
    const windowImageNameInput = document.getElementById('windowImageNameInput')
    if (imageNameInput) {
        imageNameInput.value = DEFAULT_IMAGE_PROPERTIES.name
    }
    if (windowImageNameInput) {
        windowImageNameInput.value = DEFAULT_IMAGE_PROPERTIES.name
    }

    const titleDimensions = document.getElementById('titleDimensionsModified')
    if (titleDimensions) titleDimensions.textContent = 'Dimensions:'
    
    const widthInput = document.getElementById('imageWidthInput')
    const heightInput = document.getElementById('imageHeightInput')
    const windowWidthInput = document.getElementById('windowImageWidthInput')
    const windowHeightInput = document.getElementById('windowImageHeightInput')
    if (widthInput) {
        widthInput.value = DEFAULT_IMAGE_PROPERTIES.width
    }
    if (heightInput) {
        heightInput.value = DEFAULT_IMAGE_PROPERTIES.height
    }
    if (windowWidthInput) {
        windowWidthInput.value = DEFAULT_IMAGE_PROPERTIES.width
    }
    if (windowHeightInput) {
        windowHeightInput.value = DEFAULT_IMAGE_PROPERTIES.height
    }

    const titleExtension = document.getElementById('titleExtensionModified')
    if (titleExtension) titleExtension.textContent = 'Extension:'
    
    const selector = document.getElementById('imageExtensionSelector')
    const windowSelector = document.getElementById('windowImageExtensionSelector')
    if (selector) {
        selector.value = DEFAULT_IMAGE_PROPERTIES.extension
    }
    if (windowSelector) {
        windowSelector.value = DEFAULT_IMAGE_PROPERTIES.extension
    }
}

function updateExtensionSelector(imageEditor) {
    const selector = document.getElementById('imageExtensionSelector')
    const windowSelector = document.getElementById('windowImageExtensionSelector')
    const currentValue = (imageEditor.extension || imageEditor.EXTENSION || 'png').toLowerCase()
    
    if (selector) {
        const optionExists = Array.from(selector.options).some(option => option.value === currentValue)
        if (!optionExists) {
            const option = document.createElement('option')
            option.value = currentValue
            option.textContent = currentValue.toUpperCase()
            selector.appendChild(option)
        }
        selector.value = currentValue
    }
    
    if (windowSelector) {
        const optionExists = Array.from(windowSelector.options).some(option => option.value === currentValue)
        if (!optionExists) {
            const option = document.createElement('option')
            option.value = currentValue
            option.textContent = currentValue.toUpperCase()
            windowSelector.appendChild(option)
        }
        windowSelector.value = currentValue
    }
}

function setupMetadataControls(imageEditor) {
    if (metadataControlsInitialised) return
    metadataControlsInitialised = true

    const getEditor = () => window.imageEditor || imageEditor

    const selector = document.getElementById('imageExtensionSelector')
    if (selector) {
        selector.addEventListener('change', () => {
            const newExtension = selector.value
            if (!newExtension) return
            const editor = getEditor()
            if (!editor) return
            editor.changeFileType(editor.name, newExtension)
            initializeModifiedImageDataModule(editor)
        })
    }

    const nameInput = document.getElementById('imageNameInput')
    if (nameInput) {
        const commitNameChange = () => {
            const editor = getEditor()
            if (!editor) return
            const trimmedName = nameInput.value.trim()
            if (!trimmedName) {
                nameInput.value = editor.name
                return
            }
            if (trimmedName === editor.name) return
            editor.setName(trimmedName)
            initializeModifiedImageDataModule(editor)
        }

        nameInput.addEventListener('blur', commitNameChange)
        nameInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault()
                commitNameChange()
            } else if (event.key === 'Escape') {
                const editor = getEditor()
                if (!editor) return
                nameInput.value = editor.name
                nameInput.blur()
            }
        })
    }

    const applyDimensionsButton = document.getElementById('applyDimensions')
    if (applyDimensionsButton) {
        applyDimensionsButton.addEventListener('click', async () => {
            const widthInput = document.getElementById('imageWidthInput')
            const heightInput = document.getElementById('imageHeightInput')
            const newWidth = parseInt(widthInput.value, 10)
            const newHeight = parseInt(heightInput.value, 10)
            if (!Number.isFinite(newWidth) || !Number.isFinite(newHeight) || newWidth < 1 || newHeight < 1) {
                return
            }
            const constraintCheckbox = document.getElementById('constrainedCheckbox')
            const isConstrained = constraintCheckbox ? constraintCheckbox.checked : false
            const editor = getEditor()
            if (!editor) return
            await editor.resizeCanvas(newHeight, newWidth, isConstrained, 'Default')
            initializeModifiedImageDataModule(editor)
        })
    }
}

export function initializeModifiedImageDataModule(imageEditor) {
    if (!imageEditor) return

    const titleName = document.getElementById('titleNameModified')
    if (titleName) titleName.textContent = 'Name:'

    setInputValuePreservingEdits(document.getElementById('imageNameInput'), imageEditor.name)
    setInputValuePreservingEdits(document.getElementById('windowImageNameInput'), imageEditor.name)

    const titleDimensions = document.getElementById('titleDimensionsModified')
    if (titleDimensions) titleDimensions.textContent = 'Dimensions:'
    updateDimensionInputs(imageEditor)

    const titleExtension = document.getElementById('titleExtensionModified')
    if (titleExtension) titleExtension.textContent = 'Extension:'
    updateExtensionSelector(imageEditor)

    setupMetadataControls(imageEditor)
}

// The pan/zoom listeners bind to static DOM, so they are wired up once for the whole
// session. Re-binding them on every `imageEditorReady` piled up a duplicate set of
// handlers (and a reference to the superseded editor) each time an image was opened.
let canvasNavigationInitialised = false

window.addEventListener('imageEditorReady', (event) => {
    const imageEditor = event.detail.instance
    imageEditor.loadImage()
    initializeModifiedImageDataModule(imageEditor)

    if (canvasNavigationInitialised) {
        // A new image should start from a neutral view rather than inheriting the
        // pan and zoom left over from the previous one.
        viewport.reset()
        return
    }
    canvasNavigationInitialised = true

    const viewingModule = document.querySelector('.imageViewingModule')
    const canvasDiv = document.querySelector('#imageCanvasDiv')
    const canvas = document.getElementById('imageCanvas')
    if (!viewingModule || !canvasDiv || !canvas) return

    viewport.attach({ host: viewingModule, content: canvasDiv, canvas })

    // One Pointer Event path covers mouse, pen and touch. The previous code ran
    // separate mouse and touch listeners, which both fire on touch devices and
    // fought each other, and gave tools no way to opt out of panning.
    const pointers = new Map()
    let panning = false
    let panStart = { x: 0, y: 0, translateX: 0, translateY: 0 }
    let pinchStart = null

    const isPanPointer = (event) =>
        event.pointerType !== 'mouse' || event.button === 1 || event.button === 0

    viewingModule.addEventListener('pointerdown', (event) => {
        // Tools layered over the canvas (crop) stop propagation when they claim the
        // gesture, so anything arriving here is genuinely a navigation gesture.
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })

        if (pointers.size === 2) {
            panning = false
            const [a, b] = [...pointers.values()]
            pinchStart = {
                distance: Math.hypot(a.x - b.x, a.y - b.y),
                centre: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
                scale: viewport.scale
            }
            return
        }
        if (pointers.size !== 1 || !isPanPointer(event)) return

        panning = true
        panStart = {
            x: event.clientX,
            y: event.clientY,
            translateX: viewport.translateX,
            translateY: viewport.translateY
        }
        viewingModule.setPointerCapture(event.pointerId)
        viewingModule.style.cursor = 'grabbing'
    })

    viewingModule.addEventListener('pointermove', (event) => {
        if (!pointers.has(event.pointerId)) return
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })

        if (pointers.size === 2 && pinchStart) {
            const [a, b] = [...pointers.values()]
            const distance = Math.hypot(a.x - b.x, a.y - b.y)
            if (pinchStart.distance > 0) {
                const centre = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
                const target = pinchStart.scale * (distance / pinchStart.distance)
                viewport.zoomAt(centre.x, centre.y, target / viewport.scale)
                // Follow the midpoint so the pinch also pans.
                viewport.panBy(centre.x - pinchStart.centre.x, centre.y - pinchStart.centre.y)
                pinchStart.centre = centre
            }
            event.preventDefault()
            return
        }

        if (!panning) return
        viewport.setTransform(
            viewport.scale,
            panStart.translateX + (event.clientX - panStart.x),
            panStart.translateY + (event.clientY - panStart.y)
        )
        event.preventDefault()
    })

    const endPointer = (event) => {
        pointers.delete(event.pointerId)
        if (pointers.size < 2) pinchStart = null
        if (pointers.size === 0) {
            panning = false
            viewingModule.style.cursor = 'grab'
        }
        try { viewingModule.releasePointerCapture(event.pointerId) } catch { /* not captured */ }
    }
    viewingModule.addEventListener('pointerup', endPointer)
    viewingModule.addEventListener('pointercancel', endPointer)
    viewingModule.addEventListener('pointerleave', (event) => {
        if (!panning) endPointer(event)
    })

    viewingModule.addEventListener('wheel', (event) => {
        event.preventDefault()
        // Zoom stays anchored under the cursor. Wheel keeps working while a tool is
        // active, which is what makes precise cropping on a large image possible.
        viewport.zoomAt(event.clientX, event.clientY, event.deltaY < 0 ? 1.1 : 1 / 1.1)
    }, { passive: false })

    // Double-click resets the view - previously there was no way back to 1:1.
    viewingModule.addEventListener('dblclick', (event) => {
        if (event.target.closest('.cropOverlay, .gifPlayStopBtn')) return
        viewport.reset()
    })
})

window.addEventListener('imageEditorStateChanged', (event) => {
    const imageEditor = event.detail.instance
    initializeModifiedImageDataModule(imageEditor)
})