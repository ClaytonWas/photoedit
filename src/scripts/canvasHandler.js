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

    function updateTransform() {
        canvasDiv.style.transform = `translate(${currentTranslate.x}px, ${currentTranslate.y}px) scale(${scale})`;
    }

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
  
    // Zoom functionality
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

})

window.addEventListener('imageEditorStateChanged', (event) => {
    const imageEditor = event.detail.instance
    initializeModifiedImageDataModule(imageEditor)
})