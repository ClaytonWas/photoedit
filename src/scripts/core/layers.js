let layerIdCounter = 0

function generateLayerId() {
    layerIdCounter += 1
    return `layer-${layerIdCounter}`
}

/**
 * Reset the layer ID counter (useful when starting fresh)
 */
export function resetLayerIdCounter() {
    layerIdCounter = 0
}

function cloneEffectParameters(effectParameters = {}) {
    const clone = {}
    Object.entries(effectParameters).forEach(([key, config]) => {
        clone[key] = {
            ...config,
            value: typeof config.value === 'object'
                ? JSON.parse(JSON.stringify(config.value))
                : config.value
        }
    })
    return clone
}

export class Layer {
    constructor({
        id = generateLayerId(),
        name = 'New Layer',
        visible = true,
        opacity = 1,
        blendMode = 'normal',
        effect = null,
        effectId = null,
        effectParameters = {},
        valueStep = 0.01
    } = {}) {
        this.id = id
        this.name = name
        this.visible = visible
        this.opacity = opacity
        this.blendMode = blendMode
        this.effect = effect
        this.effectId = effectId
        this.effectParameters = effectParameters
        this.valueStep = valueStep
    }

    applyEffect(image) {
        if (!this.effect) return

        const params = {}
        for (const [key, config] of Object.entries(this.effectParameters)) {
            params[key] = config.value
        }

        this.effect(image, params)
    }

    setEffect(selectedEffect, parameters = {}, valueStep = 0.01) {
        this.effect = selectedEffect
        this.effectId = Layer.extractEffectId(selectedEffect)
        this.effectParameters = cloneEffectParameters(parameters)
        this.valueStep = valueStep
    }

    setEffectParams(parameters = {}) {
        Object.entries(parameters).forEach(([key, config]) => {
            if (!this.effectParameters[key]) return
            this.effectParameters[key].value = config.value
        })
    }

    clone() {
        return new Layer({
            id: this.id,
            name: this.name,
            visible: this.visible,
            opacity: this.opacity,
            blendMode: this.blendMode,
            effect: this.effect,
            effectId: this.effectId,
            effectParameters: cloneEffectParameters(this.effectParameters),
            valueStep: this.valueStep
        })
    }

    static extractEffectId(effect) {
        if (!effect) return null
        if (effect.effectId) return effect.effectId
        if (effect.name) return effect.name
        return null
    }
}

export class LayerManager {
    constructor(layers = []) {
        this.layers = layers
        this.selectedLayerIndex = layers.length ? layers.length - 1 : null
    }

    static toIndex(index) {
        if (index === null || index === undefined) return null
        const parsed = Number(index)
        return Number.isNaN(parsed) ? null : parsed
    }

    addLayer(name) {
        const layerName = name ?? `Layer ${this.layers.length + 1}`
        const layer = new Layer({ name: layerName })
        this.layers = [...this.layers, layer]
        this.selectedLayerIndex = this.layers.length - 1
        return layer
    }

    deleteLayer(index) {
        const targetIndex = LayerManager.toIndex(index)
        if (targetIndex === null || !this.layers[targetIndex]) return null

        const [removedLayer] = this.layers.splice(targetIndex, 1)

        if (!this.layers.length) {
            this.selectedLayerIndex = null
        } else if (targetIndex >= this.layers.length) {
            this.selectedLayerIndex = this.layers.length - 1
        } else {
            this.selectedLayerIndex = targetIndex
        }

        return removedLayer
    }

    toggleVisibility(index) {
        const targetIndex = LayerManager.toIndex(index)
        const layer = this.layers[targetIndex]
        if (!layer) return null
        layer.visible = !layer.visible
        return layer.visible
    }

    setOpacity(index, opacity) {
        const targetIndex = LayerManager.toIndex(index)
        const layer = this.layers[targetIndex]
        if (!layer) return null
        const safeOpacity = Math.min(Math.max(parseFloat(opacity), 0), 1)
        layer.opacity = Number.isNaN(safeOpacity) ? layer.opacity : safeOpacity
        return layer.opacity
    }

    setBlendMode(index, blendMode) {
        const targetIndex = LayerManager.toIndex(index)
        const layer = this.layers[targetIndex]
        if (!layer) return null
        layer.blendMode = blendMode
        return layer.blendMode
    }

    addLayerEffect(index, effect, parameters = {}, valueStep = 0.01) {
        const targetIndex = LayerManager.toIndex(index)
        const layer = this.layers[targetIndex]
        if (!layer) return null
        layer.setEffect(effect, parameters, valueStep)
        return layer
    }

    updateLayerParameters(index, parameters = {}) {
        const targetIndex = LayerManager.toIndex(index)
        const layer = this.layers[targetIndex]
        if (!layer) return null
        layer.setEffectParams(parameters)
        return layer
    }

    renameLayer(index, name) {
        const targetIndex = LayerManager.toIndex(index)
        const layer = this.layers[targetIndex]
        if (!layer) return null
        layer.name = name
        return layer.name
    }

    moveLayer(index, direction) {
        const targetIndex = LayerManager.toIndex(index)
        if (targetIndex === null) return null
        const newIndex = targetIndex + direction
        if (newIndex < 0 || newIndex >= this.layers.length) return null
        const [layer] = this.layers.splice(targetIndex, 1)
        this.layers.splice(newIndex, 0, layer)
        this.selectedLayerIndex = newIndex
        return newIndex
    }

    moveLayerUp(index) {
        return this.moveLayer(index, -1)
    }

    moveLayerDown(index) {
        return this.moveLayer(index, 1)
    }

    setSelectedLayer(index) {
        const targetIndex = LayerManager.toIndex(index)
        if (targetIndex === null || !this.layers[targetIndex]) {
            this.selectedLayerIndex = null
            return null
        }
        this.selectedLayerIndex = targetIndex
        return this.selectedLayerIndex
    }

    getSelectedLayer() {
        if (this.selectedLayerIndex === null) return null
        return this.layers[this.selectedLayerIndex] ?? null
    }

    applyLayerEffects(image) {
        if (!image) return
        const { data, width, height } = image

        this.layers.forEach(layer => {
            if (!layer.effect || !layer.visible || layer.opacity <= 0) return

            const layerImage = new ImageData(
                new Uint8ClampedArray(data),
                width,
                height
            )

            layer.applyEffect(layerImage)
            
            // Check if this layer has transparentBackground enabled
            const hasTransparentBg = layer.effectParameters?.transparentBackground?.value === true
            this.blendImageData(data, layerImage.data, layer.opacity, hasTransparentBg ? 'replace' : 'normal')
        })
    }

    blendImageData(base, overlay, opacity, blendMode = 'normal') {
        if (blendMode === 'replace') {
            // Replace mode: layer completely replaces base image
            for (let i = 0; i < base.length; i += 4) {
                base[i] = overlay[i]
                base[i + 1] = overlay[i + 1]
                base[i + 2] = overlay[i + 2]
                base[i + 3] = Math.round(overlay[i + 3] * opacity)
            }
            return
        }
        
        // Normal blend mode
        for (let i = 0; i < base.length; i += 4) {
            const overlayAlpha = overlay[i + 3] / 255
            const effectiveOpacity = opacity * overlayAlpha
            const baseRetain = 1 - effectiveOpacity
            
            base[i] = base[i] * baseRetain + overlay[i] * effectiveOpacity
            base[i + 1] = base[i + 1] * baseRetain + overlay[i + 1] * effectiveOpacity
            base[i + 2] = base[i + 2] * baseRetain + overlay[i + 2] * effectiveOpacity
            base[i + 3] = base[i + 3] * baseRetain + overlay[i + 3] * opacity
        }
    }

    clone() {
        const clonedLayers = this.layers.map(layer => layer.clone())
        const clone = new LayerManager(clonedLayers)
        clone.selectedLayerIndex = this.selectedLayerIndex
        return clone
    }
}