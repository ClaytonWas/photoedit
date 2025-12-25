function updateLayerControlStates(imageEditor) {
    const moveUpButton = document.getElementById('moveLayerUp')
    const moveDownButton = document.getElementById('moveLayerDown')
    const mobileUpButton = document.getElementById('mobileLayerUp')
    const mobileDownButton = document.getElementById('mobileLayerDown')
    
    const totalLayers = imageEditor?.layerManager?.layers.length ?? 0
    const selectedIndex = imageEditor?.getSelectedIndex()
    const hasSelection = typeof selectedIndex === 'number' && selectedIndex >= 0

    const canMoveUp = hasSelection && selectedIndex > 0
    const canMoveDown = hasSelection && selectedIndex < totalLayers - 1

    if (moveUpButton) moveUpButton.disabled = !canMoveUp
    if (moveDownButton) moveDownButton.disabled = !canMoveDown
    if (mobileUpButton) mobileUpButton.disabled = !canMoveUp
    if (mobileDownButton) mobileDownButton.disabled = !canMoveDown
}

export function renderLayersList(imageEditor) {
    if (!imageEditor) return

    const layersList = document.getElementById('layersList')
    const mobileLayersList = document.getElementById('mobileLayersList')
    
    const selectedLayerIndex = imageEditor.getSelectedIndex()

    // Helper to populate a layers list element
    const populateList = (listElement) => {
        if (!listElement) return
        
        listElement.innerHTML = ''
        
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
            listElement.appendChild(layerDiv)
        })
    }
    
    populateList(layersList)
    populateList(mobileLayersList)

    updateLayerControlStates(imageEditor)
}

export function renderLayerProperties(imageEditor) {
    if (!imageEditor) return

    const propertiesDiv = document.getElementById("currentLayerSelector")
    const mobilePropertiesDiv = document.getElementById("mobileCurrentLayerSelector")
    const selectedLayerIndex = imageEditor.getSelectedIndex()
    
    // Helper to populate properties in a container
    const populateProperties = (container) => {
        if (!container) return
        
        container.innerHTML = ''
        
        const layer = imageEditor.layerManager.layers[selectedLayerIndex]
        if (!layer) return

        container.classList.add('layerPropertiesOpacity')
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
        container.appendChild(opacityDiv)

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
                } else if (typeof parameterValue === 'string' && parameterValue.startsWith('#')) {
                    // Color picker for hex color values
                    parameterInput.type = 'color'
                    parameterInput.value = parameterValue

                    parameterInput.addEventListener('input', () => {
                        imageEditor.updateLayerEffectParameters(selectedLayerIndex, {
                            [parameterName]: { value: parameterInput.value }
                        }, { snapshot: false, deferRender: false })
                    })

                    parameterInput.addEventListener('change', () => {
                        imageEditor.updateLayerEffectParameters(selectedLayerIndex, {
                            [parameterName]: { value: parameterInput.value }
                        }, { snapshot: true })
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

                container.appendChild(parameterDiv)
            })
        }
    }
    
    populateProperties(propertiesDiv)
    populateProperties(mobilePropertiesDiv)
}

window.addEventListener('imageEditorReady', (event) => {
    const imageEditor = event.detail.instance
    const layersList_HTMLElement = document.getElementById('layersList')
    const mobileLayersList_HTMLElement = document.getElementById('mobileLayersList')

    // Helper to set up click handlers on a layers list
    const setupLayerListClickHandlers = (listElement) => {
        if (!listElement) return
        
        // Clicks on layerDiv's to select layer.
        listElement.addEventListener('click', (event) => {
            event.stopPropagation()
            
            const selectedLayer_HTMLDiv = event.target.closest('.layerDiv')
            if(selectedLayer_HTMLDiv) {
                // Update selection in all layer lists
                document.querySelectorAll('.layerDiv').forEach(layer => {
                    layer.classList.remove('selectedLayerDiv')
                })
                // Find matching layers in both lists
                const index = selectedLayer_HTMLDiv.dataset.index
                document.querySelectorAll(`.layerDiv[data-index="${index}"]`).forEach(layer => {
                    layer.classList.add('selectedLayerDiv')
                })
                imageEditor.setSelectedIndex(index)
                renderLayerProperties(imageEditor, selectedLayer_HTMLDiv.id)
            }
        })

        // Double clicks on layerDiv's to rename selected layer.
        listElement.addEventListener('dblclick', (event) => {
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
            }, { once: true })

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
    }
    
    setupLayerListClickHandlers(layersList_HTMLElement)
    setupLayerListClickHandlers(mobileLayersList_HTMLElement)

    // Delete button handlers (desktop and mobile)
    const setupDeleteHandler = (buttonId) => {
        const deleteButton = document.getElementById(buttonId)
        deleteButton?.addEventListener('click', () => {
            const selectedLayerIndex = imageEditor.getSelectedIndex()
            if (selectedLayerIndex !== null) {
                imageEditor.deleteLayer(selectedLayerIndex)
            }
            renderLayersList(imageEditor)
            renderLayerProperties(imageEditor, selectedLayerIndex)
        })
    }
    
    setupDeleteHandler('deleteLayer')
    setupDeleteHandler('mobileDeleteLayer')

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

    // Desktop layer move buttons
    document.getElementById('moveLayerUp')?.addEventListener('click', () => handleLayerMove('up'))
    document.getElementById('moveLayerDown')?.addEventListener('click', () => handleLayerMove('down'))
    
    // Mobile layer move buttons
    document.getElementById('mobileLayerUp')?.addEventListener('click', () => handleLayerMove('up'))
    document.getElementById('mobileLayerDown')?.addEventListener('click', () => handleLayerMove('down'))
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