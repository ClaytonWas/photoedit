function updateLayerControlStates(imageEditor) {
    const moveUpButton = document.getElementById('moveLayerUp')
    const moveDownButton = document.getElementById('moveLayerDown')
    const totalLayers = imageEditor?.layerManager?.layers.length ?? 0
    const selectedIndex = imageEditor?.getSelectedIndex()
    const hasSelection = typeof selectedIndex === 'number' && selectedIndex >= 0

    if (moveUpButton) {
        moveUpButton.disabled = !hasSelection || selectedIndex === 0
    }

    if (moveDownButton) {
        moveDownButton.disabled = !hasSelection || selectedIndex === totalLayers - 1
    }
}

export function renderLayersList(imageEditor) {
    if (!imageEditor) return

    const layersList = document.getElementById('layersList')
    if (!layersList) return

    layersList.innerHTML = ''
    const selectedLayerIndex = imageEditor.getSelectedIndex()

    imageEditor.layerManager.layers.forEach((layer, index) => {
        const layerDiv = document.createElement('div')
        layerDiv.className = 'layerDiv'
        layerDiv.dataset.index = index

        if (selectedLayerIndex === index) {
            layerDiv.classList.add('selectedLayerDiv')
        }

        const layerName = document.createElement('p')
        layerName.classList.add('layerDivName')
        layerName.textContent = layer.name

        const visibilityCheckbox = document.createElement('input')
        visibilityCheckbox.classList.add('layerDivToggleVisability')
        visibilityCheckbox.type = 'checkbox'
        visibilityCheckbox.checked = layer.visible
        visibilityCheckbox.dataset.index = index
        visibilityCheckbox.addEventListener('click', (event) => {
            event.stopPropagation()
            imageEditor.toggleVisibility(index)
        })

        layerDiv.appendChild(layerName)
        layerDiv.appendChild(visibilityCheckbox)
        layersList.appendChild(layerDiv)
    })

    updateLayerControlStates(imageEditor)
}

export function renderLayerProperties(imageEditor) {
    if (!imageEditor) return

    const propertiesDiv = document.getElementById("currentLayerSelector")
    const selectedLayerIndex = imageEditor.getSelectedIndex()
    propertiesDiv.innerHTML = ''

    const layer = imageEditor.layerManager.layers[selectedLayerIndex]
    if (!layer) return

    propertiesDiv.classList.add('layerPropertiesOpacity')
    const opacityDiv = document.createElement("div")
    const opacityP = document.createElement("p")
    opacityP.textContent = 'Opacity'

    const opacitySlider = document.createElement("input")
    opacitySlider.type = 'range'
    opacitySlider.min = '0'
    opacitySlider.max = '1'
    opacitySlider.step = '0.01'
    opacitySlider.value = layer.opacity

    const opacityInput = document.createElement("input")
    opacityInput.type = 'number'
    opacityInput.min = '0'
    opacityInput.max = '1'
    opacityInput.step = '0.01'
    opacityInput.value = layer.opacity

    opacityDiv.appendChild(opacityP)
    opacityDiv.appendChild(opacitySlider)
    opacityDiv.appendChild(opacityInput)
    propertiesDiv.appendChild(opacityDiv)

    const updateOpacity = (value, { snapshot = false } = {}) => {
        imageEditor.setLayerOpacity(
            selectedLayerIndex,
            parseFloat(value),
            { snapshot, deferRender: !snapshot }
        )
        opacitySlider.value = value
        opacityInput.value = parseFloat(value).toFixed(2)
    }

    opacitySlider.addEventListener('input', () => {
        updateOpacity(opacitySlider.value)
    })

    opacitySlider.addEventListener('change', () => {
        updateOpacity(opacitySlider.value, { snapshot: true })
    })

    opacityInput.addEventListener('input', () => {
        const clampedValue = Math.min(Math.max(parseFloat(opacityInput.value), 0), 1).toFixed(2)
        updateOpacity(clampedValue)
    })

    opacityInput.addEventListener('change', () => {
        updateOpacity(opacityInput.value, { snapshot: true })
    })

    if (layer.effect && layer.effectParameters) {
        Object.entries(layer.effectParameters).forEach(([parameterName, parameterConfig]) => {
            const parameterDiv = document.createElement("div")
            parameterDiv.classList.add('effectParameter')
            const parameterP = document.createElement("p")
            parameterP.textContent = parameterName.charAt(0).toUpperCase() + parameterName.slice(1)

            const { value: parameterValue, range = [0, 1], valueStep: stepValue = 0.01 } = parameterConfig

            const parameterSlider = document.createElement("input")
            const parameterInput = document.createElement("input")

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

                const updateParameter = (value, { snapshot = false } = {}) => {
                    parameterSlider.value = value
                    parameterInput.value = value
                    imageEditor.updateLayerEffectParameters(
                        selectedLayerIndex,
                        { [parameterName]: { value: parseFloat(value) } },
                        { snapshot, deferRender: !snapshot }
                    )
                }

                parameterSlider.addEventListener('input', () => {
                    updateParameter(parameterSlider.value)
                })

                parameterSlider.addEventListener('change', () => {
                    updateParameter(parameterSlider.value, { snapshot: true })
                })

                parameterInput.addEventListener('input', () => {
                    updateParameter(parameterInput.value)
                })

                parameterInput.addEventListener('change', () => {
                    updateParameter(parameterInput.value, { snapshot: true })
                })
                parameterDiv.appendChild(parameterP)
                parameterDiv.appendChild(parameterSlider)
                parameterDiv.appendChild(parameterInput)
            } else if (typeof parameterValue === 'boolean') {
                parameterInput.type = 'checkbox'
                parameterInput.checked = parameterValue

                parameterInput.addEventListener('change', () => {
                    imageEditor.updateLayerEffectParameters(selectedLayerIndex, {
                        [parameterName]: { value: parameterInput.checked }
                    })
                })

                parameterDiv.appendChild(parameterP)
                parameterDiv.appendChild(parameterInput)
            } else {
                parameterInput.type = 'text'
                parameterInput.value = parameterValue

                parameterInput.addEventListener('change', () => {
                    imageEditor.updateLayerEffectParameters(selectedLayerIndex, {
                        [parameterName]: { value: parameterInput.value }
                    })
                })

                parameterDiv.appendChild(parameterP)
                parameterDiv.appendChild(parameterInput)
            }

            propertiesDiv.appendChild(parameterDiv)
        })
    }
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
            imageEditor.setSelectedIndex(selectedLayer_HTMLDiv.dataset.index)
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
        const selectedIndex = Number(selectedDiv?.dataset.index)
        if (Number.isNaN(selectedIndex) || selectedIndex === undefined) return
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
            imageEditor.renameLayer(selectedIndex, newLayerName)
            imageEditor.setSelectedIndex(selectedIndex)
        }, { once: true }) // Add once: true to prevent multiple listeners

        nameInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                nameInput.blur()
            }
        })

        nameInput.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                nameInput.value = currentName
                nameInput.blur()
            }
        })
    })

    const deleteButton = document.getElementById('deleteLayer')
    deleteButton?.addEventListener('click', () => {
        const selectedLayerIndex = imageEditor.getSelectedIndex()
        if (selectedLayerIndex !== null) {
            imageEditor.deleteLayer(selectedLayerIndex)
        }

        renderLayersList(imageEditor)
        renderLayerProperties(imageEditor, selectedLayerIndex)

    })

    const handleLayerMove = (direction) => {
        const selectedLayerIndex = imageEditor.getSelectedIndex()
        if (selectedLayerIndex === null || selectedLayerIndex === undefined) return
        const newIndex = direction === 'up'
            ? imageEditor.moveLayerUp(selectedLayerIndex)
            : imageEditor.moveLayerDown(selectedLayerIndex)
        if (newIndex === null) return
        renderLayersList(imageEditor)
        renderLayerProperties(imageEditor)
    }

    document.getElementById('moveLayerUp')?.addEventListener('click', () => handleLayerMove('up'))
    document.getElementById('moveLayerDown')?.addEventListener('click', () => handleLayerMove('down'))
})

const RENDER_ONLY_REASONS = new Set(['Render started', 'Render complete'])

window.addEventListener('imageEditorStateChanged', (event) => {
    const { instance, reason } = event.detail
    if (RENDER_ONLY_REASONS.has(reason)) {
        return
    }
    renderLayersList(instance)
    renderLayerProperties(instance)
})