/**
 * Cheap statistical sampling of the visible canvas, for the analysis panels.
 *
 * The histogram and statistics panels used to call getImageData over the whole
 * canvas and then walk every pixel, on every completed render. Two open panels on
 * a 4MP image cost two full GPU readbacks plus two full passes per frame, which
 * measured as a single 850ms main-thread freeze during a slider drag.
 *
 * Instead the canvas is point-sampled down to a bounded pixel budget on the GPU
 * (imageSmoothingEnabled = false, so this is nearest-neighbour selection rather
 * than averaging) and only the small result is read back. Averaging would smear
 * the tonal distribution; point sampling preserves it, so the histogram shape and
 * the channel statistics stay faithful.
 */

const DEFAULT_BUDGET = 240_000 // ~490x490; well beyond what a 256-bin readout needs

let scratchCanvas = null
let scratchContext = null

function ensureScratch() {
    if (!scratchCanvas) {
        scratchCanvas = document.createElement('canvas')
        // This canvas exists to be read back, so hint the browser to keep it in
        // software memory rather than round-tripping the GPU on every read.
        scratchContext = scratchCanvas.getContext('2d', { willReadFrequently: true })
    }
    return scratchContext
}

/**
 * Sample `canvas` down to at most `maxPixels` pixels.
 *
 * Returns { imageData, sampledPixels, totalPixels, scale } - or null if the
 * canvas has no area. When the canvas is already within budget the pixels are
 * read directly, so small images stay exact.
 */
export function sampleCanvas(canvas, maxPixels = DEFAULT_BUDGET) {
    if (!canvas || !canvas.width || !canvas.height) return null

    const totalPixels = canvas.width * canvas.height
    const context = ensureScratch()
    if (!context) return null

    if (totalPixels <= maxPixels) {
        // Small enough to measure exactly.
        scratchCanvas.width = canvas.width
        scratchCanvas.height = canvas.height
        context.clearRect(0, 0, canvas.width, canvas.height)
        context.drawImage(canvas, 0, 0)
        return {
            imageData: context.getImageData(0, 0, canvas.width, canvas.height),
            sampledPixels: totalPixels,
            totalPixels,
            scale: 1
        }
    }

    const scale = Math.sqrt(maxPixels / totalPixels)
    const width = Math.max(1, Math.round(canvas.width * scale))
    const height = Math.max(1, Math.round(canvas.height * scale))

    scratchCanvas.width = width
    scratchCanvas.height = height
    // Nearest-neighbour: pick pixels, do not blend them.
    context.imageSmoothingEnabled = false
    context.clearRect(0, 0, width, height)
    context.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, width, height)

    return {
        imageData: context.getImageData(0, 0, width, height),
        sampledPixels: width * height,
        totalPixels,
        scale
    }
}
