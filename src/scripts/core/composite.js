/**
 * Layer compositing, expressed against plain data so it can run unchanged on the
 * main thread and inside the render worker.
 *
 * A "layer descriptor" is the serialisable form of a Layer:
 *   { effectId, visible, opacity, parameters, transparentBackground }
 * where `parameters` is already flattened to plain values (not the
 * {value, range, valueStep} config objects the UI binds to).
 *
 * There is deliberately no DOM access in this module.
 */
import { getEffectById } from './effectRegistry.js'

/**
 * Flatten a Layer's effectParameters config map into the plain
 * `{ name: value }` object that effect functions expect.
 */
export function flattenParameters(effectParameters = {}) {
    const params = {}
    for (const key in effectParameters) {
        const config = effectParameters[key]
        params[key] = config ? config.value : undefined
    }
    return params
}

/**
 * Reduce a Layer to the minimum a renderer needs. Returns null for layers that
 * cannot contribute anything, so callers can skip them without re-checking.
 */
export function toLayerDescriptor(layer) {
    if (!layer || !layer.effect || !layer.visible || layer.opacity <= 0) return null
    return {
        effectId: layer.effectId,
        // Kept for the main-thread path so effects that are not in the registry
        // (anything added at runtime) still render. Stripped before postMessage,
        // since a function cannot be structured-cloned.
        effect: layer.effect,
        opacity: layer.opacity,
        parameters: flattenParameters(layer.effectParameters),
        // Edge effects that clear to transparent must replace the base rather than
        // blend over it, otherwise the cleared pixels blend back to the original.
        transparentBackground: layer.effectParameters?.transparentBackground?.value === true
    }
}

/**
 * Strip descriptors down to what can cross a postMessage boundary.
 */
export function toTransferableDescriptors(descriptors = []) {
    return descriptors.map(({ effectId, opacity, parameters, transparentBackground }) => ({
        effectId, opacity, parameters, transparentBackground
    }))
}

export function toLayerDescriptors(layers = []) {
    const descriptors = []
    for (const layer of layers) {
        const descriptor = toLayerDescriptor(layer)
        if (descriptor) descriptors.push(descriptor)
    }
    return descriptors
}

/**
 * Blend `overlay` down onto `base` in place.
 *
 * 'replace' takes the overlay wholesale, scaling only its alpha - used by effects
 * that produce their own transparent background.
 */
export function blendInto(base, overlay, opacity, mode = 'normal') {
    if (mode === 'replace') {
        for (let i = 0; i < base.length; i += 4) {
            base[i] = overlay[i]
            base[i + 1] = overlay[i + 1]
            base[i + 2] = overlay[i + 2]
            base[i + 3] = overlay[i + 3] * opacity
        }
        return
    }

    // The overlay is the base with an effect applied, so colour interpolates by the
    // layer's opacity alone. Weighting by the overlay's own alpha (as this once did)
    // only half-applied the effect to translucent pixels.
    //
    // Alpha takes the maximum rather than interpolating: an effect that draws - and
    // so raises alpha - adds coverage, while one that clears alpha cannot punch a
    // hole through the image underneath. A layer that genuinely means to replace the
    // image, transparency included, uses 'replace' mode. On an opaque image (the
    // common case) this is a no-op, since max(255, x) is 255.
    const retain = 1 - opacity
    for (let i = 0; i < base.length; i += 4) {
        const baseAlpha = base[i + 3]
        const overlayAlpha = overlay[i + 3]

        base[i] = base[i] * retain + overlay[i] * opacity
        base[i + 1] = base[i + 1] * retain + overlay[i + 1] * opacity
        base[i + 2] = base[i + 2] * retain + overlay[i + 2] * opacity
        if (overlayAlpha > baseAlpha) {
            base[i + 3] = baseAlpha + (overlayAlpha - baseAlpha) * opacity
        }
    }
}

/**
 * Apply a stack of layer descriptors to `target` (an ImageData-shaped
 * {data, width, height}) in place.
 *
 * `scratch` lets the caller supply a reusable Uint8ClampedArray for the per-layer
 * working copy. Without it every layer allocates a full frame, which on a 4MP
 * image is 15MB per layer per render.
 */
export function compositeLayers(target, descriptors, scratch = null) {
    if (!target || !descriptors || descriptors.length === 0) return target

    const { data, width, height } = target
    let working = scratch

    for (const descriptor of descriptors) {
        // Prefer the direct reference (main thread); fall back to the registry,
        // which is the only option inside the worker.
        const effect = typeof descriptor.effect === 'function'
            ? descriptor.effect
            : getEffectById(descriptor.effectId)
        if (!effect) continue

        if (!working || working.length !== data.length) {
            working = new Uint8ClampedArray(data.length)
        }
        working.set(data)

        // Effects read width/height off the image, so hand them a view over the
        // reused buffer rather than a fresh allocation.
        const layerImage = { data: working, width, height }

        try {
            effect(layerImage, descriptor.parameters)
        } catch (error) {
            // A single broken effect should not abandon the whole stack.
            console.error(`Effect "${descriptor.effectId}" failed`, error)
            continue
        }

        blendInto(data, working, descriptor.opacity, descriptor.transparentBackground ? 'replace' : 'normal')
    }

    return target
}

/**
 * Size of the scratch buffer compositing needs for a given frame.
 */
export function scratchSizeFor(width, height) {
    return width * height * 4
}
