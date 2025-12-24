let metadataControlsInitialised = false

function updateDimensionInputs(imageEditor) {
    const widthInput = document.getElementById('imageWidthInput')
    const heightInput = document.getElementById('imageHeightInput')
    if (widthInput && heightInput) {
        widthInput.value = Math.round(imageEditor.image.width)
        heightInput.value = Math.round(imageEditor.image.height)
    }
}

function updateExtensionSelector(imageEditor) {
    const selector = document.getElementById('imageExtensionSelector')
    if (selector) {
        const currentValue = (imageEditor.extension || imageEditor.EXTENSION || 'png').toLowerCase()
        const optionExists = Array.from(selector.options).some(option => option.value === currentValue)
        if (!optionExists) {
            const option = document.createElement('option')
            option.value = currentValue
            option.textContent = currentValue.toUpperCase()
            selector.appendChild(option)
        }
        selector.value = currentValue
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
    document.getElementById('titleNameModified').textContent = 'Name:'
    const imageNameInput = document.getElementById('imageNameInput')
    if (imageNameInput) {
        imageNameInput.value = imageEditor.name
    }

    document.getElementById('titleDimensionsModified').textContent = 'Dimensions:'
    updateDimensionInputs(imageEditor)

    document.getElementById('titleExtensionModified').textContent = 'Extension:'
    updateExtensionSelector(imageEditor)

    setupMetadataControls(imageEditor)
}

window.addEventListener('imageEditorReady', (event) => {
    let imageEditor = event.detail.instance;
    imageEditor.loadImage()
    initializeModifiedImageDataModule(imageEditor)


    const viewingModule = document.querySelector('.imageViewingModule')
    const canvasDiv = document.querySelector('#imageCanvasDiv')
    const canvas = imageEditor.canvas
    const context = imageEditor.context

    let isPanning = false
    let startPoint = { x: 0, y: 0 }
    let currentTranslate = { x: 0, y: 0 }
    let scale = 1
    
    // Touch gesture state
    let lastTouchDistance = 0
    let lastTouchCenter = { x: 0, y: 0 }

    function updateTransform() {
        canvasDiv.style.transform = `translate(${currentTranslate.x}px, ${currentTranslate.y}px) scale(${scale})`;
    }
    
    // Get distance between two touch points
    function getTouchDistance(touches) {
        const dx = touches[0].clientX - touches[1].clientX
        const dy = touches[0].clientY - touches[1].clientY
        return Math.sqrt(dx * dx + dy * dy)
    }
    
    // Get center point between two touches
    function getTouchCenter(touches) {
        return {
            x: (touches[0].clientX + touches[1].clientX) / 2,
            y: (touches[0].clientY + touches[1].clientY) / 2
        }
    }

    // Mouse events
    viewingModule.addEventListener('mousedown', (event) => {
        if (window.isCropping) return
        isPanning = true

        startPoint = {
            x: event.clientX - currentTranslate.x,
            y: event.clientY - currentTranslate.y
        }

        viewingModule.style.cursor = 'grabbing'
    })
  
    viewingModule.addEventListener('mousemove', (event) => {
        if (window.isCropping || !isPanning) return
        
        currentTranslate = {
            x: event.clientX - startPoint.x,
            y: event.clientY - startPoint.y
        }
        
        updateTransform()
    })
  
    viewingModule.addEventListener('mouseup', () => {
        if (window.isCropping) return
        isPanning = false
        viewingModule.style.cursor = 'grab'
    })
  
    viewingModule.addEventListener('mouseleave', () => {
        if (window.isCropping) return
        isPanning = false
        viewingModule.style.cursor = 'grab'
    })
  
    // Zoom functionality (mouse wheel)
    viewingModule.addEventListener('wheel', (event) => {
        if (window.isCropping) return
        event.preventDefault()
        
        const rect = viewingModule.getBoundingClientRect()
        const mouseX = event.clientX - rect.left
        const mouseY = event.clientY - rect.top
  
        // Calculate where the mouse is relative to the canvas
        const beforeTransformX = (mouseX - currentTranslate.x) / scale
        const beforeTransformY = (mouseY - currentTranslate.y) / scale
  
        // Zoom adjustment based on scroll direction.
        scale *= event.deltaY < 0 ? 1.1 : 0.9
        /*
        *   This line adjusts the scale factor based on the deltaY property of the scroll event (event.deltaY). 
                
            If event.deltaY is negative (typically when scrolling up), scale is multiplied by 1.1, 
            which increases the amount of space the canvas takes up it by 10%.
            If event.deltaY is positive (scrolling down), scale is multiplied by 0.9, reducing canvas by 10%.
        */
        
        // Limit zoom level to 0.1-10 times original size.
        scale = Math.min(Math.max(0.5, scale), 20)
  
        // Calculate the new position after scale
        const afterTransformX = (mouseX - currentTranslate.x) / scale
        const afterTransformY = (mouseY - currentTranslate.y) / scale
  
        // Adjust translation to keep the mouse point in the same place
        currentTranslate.x += (afterTransformX - beforeTransformX) * scale
        currentTranslate.y += (afterTransformY - beforeTransformY) * scale
  
        updateTransform()
    })
    
    // Touch events for mobile pan and pinch-to-zoom
    viewingModule.addEventListener('touchstart', (event) => {
        if (window.isCropping) return
        
        if (event.touches.length === 1) {
            // Single finger - pan
            isPanning = true
            startPoint = {
                x: event.touches[0].clientX - currentTranslate.x,
                y: event.touches[0].clientY - currentTranslate.y
            }
        } else if (event.touches.length === 2) {
            // Two fingers - prepare for pinch zoom
            isPanning = false
            lastTouchDistance = getTouchDistance(event.touches)
            lastTouchCenter = getTouchCenter(event.touches)
        }
    }, { passive: true })
    
    viewingModule.addEventListener('touchmove', (event) => {
        if (window.isCropping) return
        
        if (event.touches.length === 1 && isPanning) {
            // Single finger pan
            event.preventDefault()
            currentTranslate = {
                x: event.touches[0].clientX - startPoint.x,
                y: event.touches[0].clientY - startPoint.y
            }
            updateTransform()
        } else if (event.touches.length === 2) {
            // Pinch to zoom
            event.preventDefault()
            
            const currentDistance = getTouchDistance(event.touches)
            const currentCenter = getTouchCenter(event.touches)
            const rect = viewingModule.getBoundingClientRect()
            
            // Calculate zoom
            const zoomFactor = currentDistance / lastTouchDistance
            const newScale = Math.min(Math.max(0.5, scale * zoomFactor), 20)
            
            // Calculate center point relative to viewing module
            const centerX = currentCenter.x - rect.left
            const centerY = currentCenter.y - rect.top
            
            // Zoom towards the center of the pinch
            const beforeTransformX = (centerX - currentTranslate.x) / scale
            const beforeTransformY = (centerY - currentTranslate.y) / scale
            
            scale = newScale
            
            const afterTransformX = (centerX - currentTranslate.x) / scale
            const afterTransformY = (centerY - currentTranslate.y) / scale
            
            // Adjust translation
            currentTranslate.x += (afterTransformX - beforeTransformX) * scale
            currentTranslate.y += (afterTransformY - beforeTransformY) * scale
            
            // Also pan with the pinch gesture
            const panDeltaX = currentCenter.x - lastTouchCenter.x
            const panDeltaY = currentCenter.y - lastTouchCenter.y
            currentTranslate.x += panDeltaX
            currentTranslate.y += panDeltaY
            
            lastTouchDistance = currentDistance
            lastTouchCenter = currentCenter
            
            updateTransform()
        }
    }, { passive: false })
    
    viewingModule.addEventListener('touchend', (event) => {
        if (window.isCropping) return
        
        if (event.touches.length === 0) {
            isPanning = false
        } else if (event.touches.length === 1) {
            // Went from 2 fingers to 1 - restart pan
            isPanning = true
            startPoint = {
                x: event.touches[0].clientX - currentTranslate.x,
                y: event.touches[0].clientY - currentTranslate.y
            }
        }
    }, { passive: true })
    
    viewingModule.addEventListener('touchcancel', () => {
        isPanning = false
    }, { passive: true })

})

window.addEventListener('imageEditorStateChanged', (event) => {
    const imageEditor = event.detail.instance
    initializeModifiedImageDataModule(imageEditor)
})