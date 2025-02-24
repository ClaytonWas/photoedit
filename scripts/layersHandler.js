// Function that takes the current imageEditor and recreates layerDiv's dynamically based on updates to the imageEditor.layerManager.
// This removes the selectedLayerIndex reference.
function renderLayersList(imageEditor) {
    let layersList = document.getElementById('layersList')
    let index = 0
    layersList.innerHTML = ''

    imageEditor.layerManager.layers.forEach(layer => {
        const layer_HTMLDiv = document.createElement('div')
        layer_HTMLDiv.className = 'layerDiv'
        layer_HTMLDiv.id = index

        const layerName = document.createElement('p')
        layerName.classList.add('layerDivName')
        layerName.textContent = layer.name

        const visabilityCheckbox = document.createElement('input')
        visabilityCheckbox.classList.add('layerDivToggleVisability')
        visabilityCheckbox.type = 'checkbox'
        visabilityCheckbox.checked = layer.visible
        visabilityCheckbox.id = index
        visabilityCheckbox.addEventListener('click', () => {
            imageEditor.toggleVisibility(visabilityCheckbox.id)
        })

        layer_HTMLDiv.appendChild(layerName)
        layer_HTMLDiv.appendChild(visabilityCheckbox)
        layersList.appendChild(layer_HTMLDiv)

        index += 1
    })

    imageEditor.layerManager.selectedLayerIndex = null
}

export function renderLayerProperties(imageEditor) {
    let propertiesDiv = document.getElementById("currentLayerSelector")
    let selectedLayerIndex = imageEditor.getSelectedIndex()

    propertiesDiv.innerHTML = ''

    if (!imageEditor.layerManager.layers[selectedLayerIndex]) {
        return
    } 
    
    let layer = imageEditor.layerManager.layers[selectedLayerIndex]

    propertiesDiv.classList.add('layerPropertiesOpacity')
    let opacityDiv = document.createElement("div")
    let opacityP = document.createElement("p")
    opacityP.textContent = 'Opacity'
    
    let opacitySlider = document.createElement("input")
    opacitySlider.type = 'range'
    opacitySlider.min = '0'
    opacitySlider.max = '1'
    opacitySlider.step = '0.01'
    opacitySlider.value = layer.opacity

    let opacityInput = document.createElement("input")
    opacityInput.value = layer.opacity

    opacityDiv.appendChild(opacityP)
    opacityDiv.appendChild(opacitySlider)
    opacityDiv.appendChild(opacityInput)
    propertiesDiv.appendChild(opacityDiv)

    // Layer displays parameters that are needed.
    if (layer.effect && layer.effectParameters) {
        Object.entries(layer.effectParameters).forEach(([parameterName, parameterConfig]) => {
            let parameterDiv = document.createElement("div")
            parameterDiv.classList.add('effectParameter')
            let parameterP = document.createElement("p")
            parameterP.textContent = parameterName.charAt(0).toUpperCase() + parameterName.slice(1)

            const { value: parameterValue, range = [0, 1], valueStep: stepValue} = parameterConfig
            
            let parameterSlider = document.createElement("input")
            let parameterInput = document.createElement("input")

            if (typeof parameterValue === 'number') {
                parameterSlider.type = 'range'
                parameterSlider.min = range[0]
                parameterSlider.max = range[1]
                parameterSlider.step = stepValue
                parameterSlider.value = parameterValue

                parameterInput.type = 'number'
                parameterInput.min = range[0]
                parameterInput.max = range[1]
                parameterInput.step = stepValue
                parameterInput.value = parameterValue

                parameterSlider.addEventListener('mouseup', () => {
                    parameterInput.value = parameterSlider.value
                    layer.effectParameters[parameterName].value = parseFloat(parameterSlider.value)
                    layer.setEffectParams(layer.effectParameters)
                    imageEditor.renderImage()
                })

                parameterInput.addEventListener('change', () => {
                    parameterSlider.value = parameterInput.value
                    layer.effectParameters[parameterName].value = parseFloat(parameterInput.value)
                    layer.setEffectParams(layer.effectParameters)
                    imageEditor.renderImage()
                })

                parameterDiv.appendChild(parameterP)
                parameterDiv.appendChild(parameterSlider)
                parameterDiv.appendChild(parameterInput)
            } else if (typeof parameterValue === 'boolean') {
                parameterInput.type = 'checkbox'
                parameterInput.checked = parameterValue

                parameterInput.addEventListener('change', () => {
                    layer.effectParameters[parameterName].value = parameterInput.checked
                    layer.setEffectParams(layer.effectParameters)
                    imageEditor.renderImage()
                })

                parameterDiv.appendChild(parameterP)
                parameterDiv.appendChild(parameterInput)
            } else {
                parameterInput.type = 'text'
                parameterInput.value = parameterValue

                parameterInput.addEventListener('change', () => {
                    layer.effectParameters[parameterName].value = parameterInput.value
                    layer.setEffectParams(layer.effectParameters)
                    imageEditor.renderImage()
                })

                parameterDiv.appendChild(parameterP)
                parameterDiv.appendChild(parameterInput)
            }

            propertiesDiv.appendChild(parameterDiv)
        })
    }

    opacitySlider.addEventListener('change', () => {
        opacityInput.value = opacitySlider.value
        layer.opacity = opacitySlider.value
        imageEditor.renderImage()
    })

    opacityInput.addEventListener('change', () => {
        opacityInput.value = Math.min(Math.max(parseFloat(opacityInput.value), 0), 1).toFixed(2)
        opacitySlider.value = opacityInput.value
        layer.opacity = opacitySlider.value
        imageEditor.renderImage()
    })
}

window.addEventListener('imageEditorReady', (event) => {
    const imageEditor = event.detail.instance
    const layersList_HTMLElement = document.getElementById('layersList')

    // Clicks on layerDiv's to select layer.
    layersList_HTMLElement.addEventListener('click', (event) => {
        // Stop event from bubbling up
        event.stopPropagation()
        
        const selectedLayer_HTMLDiv = event.target.closest('.layerDiv')
        if(selectedLayer_HTMLDiv) {
            const layerDivs = document.querySelectorAll('.layerDiv')
            layerDivs.forEach(layer => {
                layer.classList.remove('selectedLayerDiv')
            })
            selectedLayer_HTMLDiv.classList.add('selectedLayerDiv')
            imageEditor.setSelectedIndex(selectedLayer_HTMLDiv.id)
            renderLayerProperties(imageEditor, selectedLayer_HTMLDiv.id)
        }
    })

    // Double clicks on layerDiv's to rename selected layer.
    layersList_HTMLElement.addEventListener('dblclick', (event) => {
        // Stop event from bubbling up
        event.stopPropagation()
        
        let selectedDivName = event.target.closest('.layerDivName')
        if (!selectedDivName) return

        const selectedDiv = event.target.closest('.layerDiv')
        const selectedIndex = Array.from(selectedDiv.parentNode.children).indexOf(selectedDiv)
        const currentName = selectedDivName.textContent

        const nameInput = document.createElement('input')
        nameInput.type = 'text'
        nameInput.name = 'newInput'
        nameInput.value = imageEditor.layerManager.layers[selectedIndex].name
        selectedDivName.textContent = ''
        selectedDivName.appendChild(nameInput)

        nameInput.focus()
        nameInput.addEventListener('blur', () => {
            const newLayerName = nameInput.value
            imageEditor.layerManager.layers[selectedIndex].name = newLayerName
            renderLayersList(imageEditor)
            imageEditor.setSelectedIndex(selectedIndex)
            const layerDivs = document.querySelectorAll('.layerDiv')
            layerDivs[selectedIndex].classList.add('selectedLayerDiv')
        }, { once: true }) // Add once: true to prevent multiple listeners

        nameInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                nameInput.blur()
            }
        })

        nameInput.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                nameInput.value = currentName
                imageEditor.layerManager.layers[selectedIndex].name = currentName
                nameInput.blur()
            }
        })
    })

    document.getElementById('addLayer').addEventListener('click', () => {
        // Now I neeed to map the data structure of the layer to the list element of the same name.
        imageEditor.layerManager.addLayer()

        // Then call renderLayers
        renderLayersList(imageEditor)
        layersList_HTMLElement.lastElementChild.classList.add('selectedLayerDiv')
        imageEditor.setSelectedIndex(layersList_HTMLElement.lastElementChild.id)
        renderLayerProperties(imageEditor)
    })

    document.getElementById('deleteLayer').addEventListener('click', () => {
        // Check if there is a currently selected layer, remove layer and the layerManager index point if it exists.
        const selectedLayerIndex = imageEditor.getSelectedIndex()
        if (selectedLayerIndex !== null) {
            imageEditor.deleteLayer(selectedLayerIndex)
            imageEditor.setSelectedIndex(null)
        }

        renderLayersList(imageEditor)
        renderLayerProperties(imageEditor, selectedLayerIndex)

    })
})