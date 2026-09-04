/**
 * The single source of truth mapping effect functions to stable string ids.
 *
 * Layers hold a direct function reference so the main thread can call effects
 * without a lookup, but a function cannot cross a postMessage boundary. Every
 * effect therefore also carries an id, and the render worker rebuilds the
 * function from that id using this same table.
 *
 * Ids are looked up by function identity rather than by `fn.name`. Several
 * effects are re-exported under aliases (prewireEdges is prewittEdges), so the
 * name and the export are not the same string and a name-based lookup silently
 * fails to resolve them.
 */
import { greyscale } from '../plugins/greyscale.js'
import { sepia } from '../plugins/sepia.js'
import { filmEffects } from '../plugins/filmEffects.js'
import { hsvAdjustment } from '../plugins/hsvAdjustment.js'
import {
    paintedStylization,
    pointsInSpace,
    vectorsInSpace,
    sobelEdges,
    sobelEdgesColouredDirections,
    prewittEdges,
    prewittEdgesColouredDirections
} from '../plugins/paintedStylization.js'

export const EFFECTS = {
    greyscale,
    sepia,
    filmEffects,
    hsvAdjustment,
    paintedStylization,
    pointsInSpace,
    vectorsInSpace,
    sobelEdges,
    sobelEdgesColouredDirections,
    prewittEdges,
    prewittEdgesColouredDirections
}

const ID_BY_FUNCTION = new Map(Object.entries(EFFECTS).map(([id, fn]) => [fn, id]))

/**
 * Stable id for an effect function, or null if it is not a registered effect.
 * Unregistered effects still render on the main thread; they just cannot be
 * offloaded to the worker.
 */
export function getEffectId(effect) {
    if (typeof effect !== 'function') return null
    return ID_BY_FUNCTION.get(effect) ?? null
}

export function getEffectById(effectId) {
    if (!effectId) return null
    return EFFECTS[effectId] ?? null
}

export function isRegisteredEffect(effect) {
    return ID_BY_FUNCTION.has(effect)
}
