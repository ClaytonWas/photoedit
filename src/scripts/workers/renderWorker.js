import { greyscale } from '../plugins/greyscale.js'
import { sepia } from '../plugins/sepia.js'
import { filmEffects } from '../plugins/filmEffects.js'
import { paintedStylization, pointsInSpace, vectorsInSpace, sobelEdges, sobelEdgesColouredDirections, prewireEdges, prewireEdgesColouredDirections } from '../plugins/paintedStylization.js'
import { hsvAdjustment } from '../plugins/hsvAdjustment.js'

const effectRegistry = {
    greyscale,
    sepia,
    filmEffects,
    paintedStylization,
    pointsInSpace,
    vectorsInSpace,
    sobelEdges,
    sobelEdgesColouredDirections,
    prewireEdges,
    prewireEdgesColouredDirections,
    hsvAdjustment
}

const blendImageData = (base, overlay, opacity) => {
    for (let i = 0; i < base.length; i += 4) {
        base[i] = base[i] * (1 - opacity) + overlay[i] * opacity
        base[i + 1] = base[i + 1] * (1 - opacity) + overlay[i + 1] * opacity
        base[i + 2] = base[i + 2] * (1 - opacity) + overlay[i + 2] * opacity
        base[i + 3] = 255
    }
}

const getEffectParams = (effectParameters = {}) => {
    const params = {}
    Object.entries(effectParameters).forEach(([key, config]) => {
        params[key] = config?.value
    })
    return params
}

self.addEventListener('message', (event) => {
    const { jobId, baseImageData, layers } = event.data
    if (!baseImageData) {
        self.postMessage({ jobId, error: 'Missing base image data' })
        return
    }

    const baseArray = new Uint8ClampedArray(baseImageData.data)
    const width = baseImageData.width
    const height = baseImageData.height

    const workingArray = new Uint8ClampedArray(baseArray)

    const hasLayers = Array.isArray(layers) && layers.length > 0
    if (!hasLayers) {
        self.postMessage({
            jobId,
            imageData: {
                width,
                height,
                data: workingArray.buffer
            }
        }, [workingArray.buffer])
        return
    }

    layers.forEach(layer => {
        if (!layer.visible || layer.opacity <= 0 || !layer.effectId) return
        const effect = effectRegistry[layer.effectId]
        if (typeof effect !== 'function') return

        const overlay = new ImageData(
            new Uint8ClampedArray(workingArray),
            width,
            height
        )

        const params = getEffectParams(layer.effectParameters)

        try {
            effect(overlay, params)
            blendImageData(workingArray, overlay.data, layer.opacity)
        } catch (error) {
            console.error(`Worker failed to render effect ${layer.effectId}`, error)
        }
    })

    self.postMessage({
        jobId,
        imageData: {
            width,
            height,
            data: workingArray.buffer
        }
    }, [workingArray.buffer])
})

