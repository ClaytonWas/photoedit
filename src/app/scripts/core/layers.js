export class Layer {
    constructor(name="New Layer", visible = true, opacity = 1, effect=null, effectParameters = {}, valueStep = 0.01) {
        this.name = name
        this.visible = visible
        this.opacity = opacity
        this.effect = effect
        this.effectParameters = effectParameters
        this.valueStep = valueStep
    }

    applyEffect(image) {
        if (!this.effect) return;
    
        // Prepare parameters with only "value:" properties for each effect parameter
        const params = {};
        for (const [key, config] of Object.entries(this.effectParameters)) {
            params[key] = config.value;  // Extract only the value for each parameter
        }
    
        this.effect(image, params);
    }

    setEffect(selectedEffect, parameters = {}, valueStep) {
        this.effect = selectedEffect
        this.effectParameters = parameters
        this.valueStep = valueStep
    }

    setEffectParams(parameters) {
        // Iterate over each parameter to ensure only the value is modified
        for (let key in parameters) {
            if (this.effectParameters[key]) {
                this.effectParameters[key].value = parameters[key].value;
            }
        }
    }
}

export class LayerManager {
    constructor() {
        this.layers = []
        this.selectedLayerIndex = null // Is the selected index in this.layers[], null otherwise.
    }

    addLayer() {
        const layer = new Layer()
        this.layers.push(layer)
        this.selectedLayerIndex = this.layers.length
    }

    addLayerEffect(index, effect, parameters = {}, valueStep) {
        this.layers[index].setEffect(effect, parameters, valueStep)
    }

    applyLayerEffects(image) {
        for (const layer of this.layers) {
            if (layer.effect && layer.visible && layer.opacity > 0) {
                layer.applyEffect(image)
                console.log(`Applying effect of layer: ${layer.name}`, layer.effectParameters)
            }
        }
    }

    deleteLayer(index) {
        this.layers.splice(index, 1)
    }

    toggleVisibility(index) {
        this.layers[index].visible = !this.layers[index].visible
    }

    setOpacity(index, opacity) {
        this.layers[index].opacity = opacity
    }
}