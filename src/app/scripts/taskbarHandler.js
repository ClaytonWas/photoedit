import { ImageEditor } from './core/imageEditor.js'
import { initializeModifiedImageDataModule } from './canvasHandler.js'
import { renderLayerProperties } from './layersHandler.js'
import { paintedStylization, pointsInSpace, vectorsInSpace, sobelEdges, sobelEdgesColouredDirections, prewireEdges, prewireEdgesColouredDirections } from './plugins/paintedStylization.js'
import { filmEffects } from './plugins/filmEffects.js'
import { greyscale } from './plugins/greyscale.js'
import { sepia } from './plugins/sepia.js'


let imageEditor = null

function enableSelection(callback) {
    const canvas = document.getElementById('imageCanvas')
    let isSelecting = false
    let startX, startY, endX, endY

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
    }

    const handleMouseMove = (e) => {
        if (!isSelecting) return

        const context = canvas.getContext("2d")
        const originalImageData = imageEditor.context.getImageData(0, 0, canvas.width, canvas.height)
        context.putImageData(originalImageData, 0, 0)

        const { x, y } = getCanvasCoordinates(e.clientX, e.clientY)
        endX = x
        endY = y

        context.strokeStyle = 'white'
        context.lineWidth = 10
        context.setLineDash([5, 5])
        context.strokeRect(startX, startY, endX - startX, endY - startY)
    }

    const handleMouseUp = () => {
        isSelecting = false

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
    };
}

function resetEditor() {
    if (imageEditor) {
        imageEditor = null
    }

    // Reset UI elements related to the image data
    document.getElementById('titleName').textContent = ''
    document.getElementById('imageName').textContent = ''
    document.getElementById('titleDimensions').textContent = ''
    document.getElementById('imageDimensions').textContent = ''
    document.getElementById('titleExtension').textContent = ''
    document.getElementById('imageExtension').textContent = ''
    document.getElementById("currentLayerSelector").innerHTML = ''


    // Clear layers list
    document.getElementById('layersList').innerHTML = ''
    document.title = 'PhotoEdits'

    // Hide or reset any other UI modules
    closeResizeModule();
    closeHSVModule();
    document.getElementById('hsvReset').click()
    closeCropModule()
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

function openCropModule() {
    document.getElementById('cropModule').style.display = 'block'
}

function closeCropModule() {
    document.getElementById('cropModule').style.display = 'none'
}

function openResizeModule() {
    document.getElementById('resizeModule').style.display = 'block'
}

function closeResizeModule() {
    document.getElementById('resizeModule').style.display = 'none'
}

function openHSVModule() {
    document.getElementById('hsvModule').style.display = 'block'
}

function closeHSVModule() {
    document.getElementById('hsvModule').style.display = 'none'
}

window.addEventListener('load', () => {

    /*
    * Taskbar Event Listeners
    */

    // Opens file browser and loads the selected image to the canvas.
    document.getElementById('openFile').addEventListener('click', () => {
        const fileInput = document.getElementById("uploadFile");
        fileInput.addEventListener("change", uploadImage)
        fileInput.click()
    })
    
    document.getElementById('quickExport').addEventListener('click', () => {
        imageEditor.quickExport()
    })


    // Core image modifications
    document.getElementById('resize').addEventListener('click', () => {
        openResizeModule()
    })

    document.getElementById('cancelResize').addEventListener('click', () => {
        closeResizeModule()
    })

    let maintainAspectRatio = document.getElementById('constrainedCheckbox')
    maintainAspectRatio.addEventListener('change', () => {
        let resizeHeight = document.getElementById('resizeHeight')
        let resizeWidth = document.getElementById('resizeWidth')
        let DIV = document.getElementById('resizeScaleDIV')
        let scaleFactor = document.getElementById('resizeScale')

        if (maintainAspectRatio.checked) {
            DIV.style.display = 'flex'
            document.getElementById('resizeScaleDiv')

            resizeHeight.disabled = true
            resizeWidth.disabled = true

            resizeHeight.value = imageEditor.image.height
            resizeWidth.value = imageEditor.image.width

            scaleFactor.addEventListener('change', () => {
                if (scaleFactor.value < 0.1) {
                    scaleFactor.value = 0.1
                } else if (scaleFactor.value > 10) {
                    scaleFactor.value = 10
                }

                resizeHeight.value = Math.round(imageEditor.image.height * scaleFactor.value)
                resizeWidth.value = Math.round(imageEditor.image.width * scaleFactor.value)
                
            })
        } else {
            DIV.style.display = 'none'

            resizeHeight.disabled = false
            resizeWidth.disabled = false

            scaleFactor.value = '1'
        }
    })

    document.getElementById('resizeSubmit').addEventListener('click', () => {
        // Gather the data from the form.
        let newHeight = document.getElementById('resizeHeight').value
        let newWidth = document.getElementById('resizeWidth').value
        let isConstrained = document.getElementById('constrainedCheckbox').checked
        let interpolationType = document.getElementById('interpolationType').value

        imageEditor.resizeCanvas(newHeight, newWidth, isConstrained, interpolationType)
        document.getElementById('hsvReset').click()

        setTimeout(() => {
            initializeModifiedImageDataModule(imageEditor)
        }, 50)
    })

    document.getElementById('cursorCrop').addEventListener('click', () => {
        window.isCropping = true    // Disable dragging in canvasHandler.js if cropping

        const imageCanvasDiv = document.getElementById('imageCanvasDiv')
        imageCanvasDiv.style.cursor = 'default'
        
        const disableSelection = enableSelection((selection) => {
            // Re-enable the draggable cursor once the selection is done
            imageCanvasDiv.style.cursor = 'grab'
            window.isCropping = false

            let startHeight = selection.startHeight
            let startWidth = selection.startWidth
            let endHeight = selection.endHeight
            let endWidth = selection.endWidth

            if(startHeight > endHeight) {
                let temp = startHeight
                startHeight = endHeight
                endHeight = temp
            }
            if(startWidth > endWidth) {
                let temp = startWidth
                startWidth = endWidth
                endWidth = temp
            }
            
            document.getElementById('cropStartHeight').value = startHeight
            document.getElementById('cropStartWidth').value = startWidth
            document.getElementById('cropEndHeight').value = endHeight
            document.getElementById('cropEndWidth').value = endWidth
    
            openCropModule()
            disableSelection()
        })
    })

    document.getElementById('crop').addEventListener('click', () => {
        openCropModule()
    })

    document.getElementById('cancelCrop').addEventListener('click', () => {
        closeCropModule()
    })

    document.getElementById('cropSubmit').addEventListener('click', () => {
        let startHeight = parseInt(document.getElementById('cropStartHeight').value);
        let startWidth = parseInt(document.getElementById('cropStartWidth').value);
        let endHeight = parseInt(document.getElementById('cropEndHeight').value);
        let endWidth = parseInt(document.getElementById('cropEndWidth').value);

        imageEditor.crop(startHeight, startWidth, endHeight, endWidth)
        imageEditor.renderImage()

        setTimeout(() => {
            // Reset UI Windows
            document.getElementById('cropStartHeight').value = 0
            document.getElementById('cropStartWidth').value = 0
            document.getElementById('cropEndHeight').value = imageEditor.image.height
            document.getElementById('cropEndWidth').value = imageEditor.image.width
            document.getElementById('resizeHeight').value = imageEditor.image.height
            document.getElementById('resizeWidth').value = imageEditor.image.width
            document.getElementById('hsvReset').click();
            initializeModifiedImageDataModule(imageEditor)
        }, 50)
    })

    document.getElementById('resetImage').addEventListener('click', () => {
        imageEditor.resetImage()
        setTimeout(() => {
            // Reset UI Windows
            document.getElementById('cropStartHeight').value = 0
            document.getElementById('cropStartWidth').value = 0
            document.getElementById('cropEndHeight').value = imageEditor.image.height
            document.getElementById('cropEndWidth').value = imageEditor.image.width
            document.getElementById('resizeHeight').value = imageEditor.image.height
            document.getElementById('resizeWidth').value = imageEditor.image.width
            document.getElementById('hsvReset').click();
            initializeModifiedImageDataModule(imageEditor);
        }, 50);
        imageEditor.renderImage()
    })

    document.getElementById('hsv').addEventListener('click', () => {
        openHSVModule()
    })

    document.getElementById('hsvCancel').addEventListener('click', () => {
        closeHSVModule()
    })

    let hueSlider = document.getElementById('hueSlider')
    let saturationSlider = document.getElementById('saturationSlider')
    let brightnessSlider = document.getElementById('brightnessSlider')
    hueSlider.addEventListener('change', () => {
        if(!imageEditor) return
        imageEditor.changeCanvasHSV(hueSlider.value, saturationSlider.value, brightnessSlider.value)
        imageEditor.renderImage()
    })
    saturationSlider.addEventListener('change', () => {
        if(!imageEditor) return
        imageEditor.changeCanvasHSV(hueSlider.value, saturationSlider.value, brightnessSlider.value)
        imageEditor.renderImage()
    })
    brightnessSlider.addEventListener('change', () => {
        if(!imageEditor) return
        imageEditor.changeCanvasHSV(hueSlider.value, saturationSlider.value, brightnessSlider.value)
        imageEditor.renderImage()
    })
    document.getElementById('hsvReset').addEventListener('click', () => {
        hueSlider.value = 0
        saturationSlider.value = 100
        brightnessSlider.value = 100
        if(!imageEditor) return
        imageEditor.changeCanvasHSV(hueSlider.value, saturationSlider.value, brightnessSlider.value)
    })

    document.getElementById('rotateCW90').addEventListener('click', () => {
        imageEditor.rotate(90)
        document.getElementById('hsvReset').click();

        setTimeout(() => {
            initializeModifiedImageDataModule(imageEditor);
        }, 50)
    })

    document.getElementById('rotateCCW90').addEventListener('click', () => {
        imageEditor.rotate(-90)
        document.getElementById('hsvReset').click();

        setTimeout(() => {
            initializeModifiedImageDataModule(imageEditor);
        }, 50)
    })


    
    // Filter applications
    document.getElementById('greyscale').addEventListener('click', () => {
        let index = imageEditor.getSelectedIndex()
        imageEditor.layerManager.addLayerEffect(index, greyscale)
        renderLayerProperties(imageEditor)
        imageEditor.renderImage()
    })

    document.getElementById('sepia').addEventListener('click', () => {
        imageEditor.layerManager.addLayerEffect(
            imageEditor.getSelectedIndex(), 
            sepia,
            {
                intensity: { value: 1, range: [0, 1], valueStep: 0.01 }
            }
        )
        renderLayerProperties(imageEditor)
        imageEditor.renderImage()
    })

    document.getElementById('filmEffects').addEventListener('click', () => {
        imageEditor.layerManager.addLayerEffect(
            imageEditor.getSelectedIndex(),
            filmEffects,
            {
                contrast: { value: 0, range: [0, 255], valueStep: 1 },
                colourPalette: { value: 0, range: [-100, 100], valueStep: 1 }
            }
        )
        renderLayerProperties(imageEditor)
        imageEditor.renderImage()
    })
    document.getElementById('paintedStylization').addEventListener('click', () => {
        imageEditor.layerManager.addLayerEffect(
            imageEditor.getSelectedIndex(),
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
        imageEditor.renderImage()
    })


    // Visualization filters (for concepts from labs and other cool things that I couldn't fit neatly into a catagory.)
    document.getElementById('pointsInSpace').addEventListener('click', () => {
        imageEditor.layerManager.addLayerEffect(
            imageEditor.getSelectedIndex(),
            pointsInSpace,
            {
                sampling: {value: 10, range: [2, 100], valueStep: 1}
            }
        )
        renderLayerProperties(imageEditor)
        imageEditor.renderImage()
    })

    document.getElementById('vectorsInSpace').addEventListener('click', () => {
        imageEditor.layerManager.addLayerEffect(
            imageEditor.getSelectedIndex(),
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
        imageEditor.renderImage()
    })

    document.getElementById('sobelEdges').addEventListener('click', () => {
        imageEditor.layerManager.addLayerEffect(
            imageEditor.getSelectedIndex(),
            sobelEdges,
            {
                edgeThreshold: {value: 50, range: [0, 255], valueStep: 1},
                blackoutBackground: { value: true },
                transparentBackground: { value: false }
            }
        )
        renderLayerProperties(imageEditor)
        imageEditor.renderImage()
    })
    
    document.getElementById('sobelEdgesColouredDirections').addEventListener('click', () => {
        imageEditor.layerManager.addLayerEffect(
            imageEditor.getSelectedIndex(),
            sobelEdgesColouredDirections,
            {
                edgeThreshold: {value: 50, range: [0, 255], valueStep: 1},
                blackoutBackground: { value: true },
                transparentBackground: { value: false }
            }
        )
        renderLayerProperties(imageEditor)
        imageEditor.renderImage()
    })

    document.getElementById('prewireEdges').addEventListener('click', () => {
        imageEditor.layerManager.addLayerEffect(
            imageEditor.getSelectedIndex(),
            prewireEdges,
            {
                edgeThreshold: {value: 50, range: [0, 255], valueStep: 1},
                blackoutBackground: { value: true },
                transparentBackground: { value: false }
            }
        )
        renderLayerProperties(imageEditor)
        imageEditor.renderImage()
    })

    document.getElementById('prewireEdgesColouredDirections').addEventListener('click', () => {
        imageEditor.layerManager.addLayerEffect(
            imageEditor.getSelectedIndex(),
            prewireEdgesColouredDirections,
            {
                edgeThreshold: {value: 50, range: [0, 255], valueStep: 1},
                blackoutBackground: { value: true },
                transparentBackground: { value: false }
            }
        )
        renderLayerProperties(imageEditor)
        imageEditor.renderImage()
    })
})