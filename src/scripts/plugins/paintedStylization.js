const clamp = (value, min, max) => Math.min(Math.max(value, min), max)

export function paintedStylization(image, parameters = {}) {
    const width = image.width
    const height = image.height
    const data = image.data
    const dataLen = data.length
    
    const smallestDimension = Math.max(1, Math.min(width, height))
    const maxStrokeWidth = Math.max(1, Math.floor(smallestDimension * 0.05))
    const maxStrokeLength = Math.max(5, Math.floor(smallestDimension * 0.15))

    const strokeWidth = clamp(parameters.width ?? 5, 1, maxStrokeWidth)
    const strokeLength = clamp(parameters.length ?? 5, 1, maxStrokeLength)
    const samplingValue = clamp(parameters.sampling ?? 10, 1, 2000)
    const distanceBetweenSamples = samplingValue * 4
    const edgeThreshold = parameters.edgeThreshold ?? 100
    const overwritePixels = parameters.overwritePixels ?? false
    const overwriteEdges = parameters.overwriteEdges ?? false
    
    const radians = (parameters.angle ?? 45) * (Math.PI / 180)
    
    // Pre-calculate trig values
    const cosAngle = Math.cos(radians)
    const sinAngle = Math.sin(radians)
    const cosPerp = Math.cos(radians + Math.PI / 2)
    const sinPerp = Math.sin(radians + Math.PI / 2)

    // Use Uint8Array bitmap instead of Set with strings (much faster)
    const sampleBitmap = new Uint8Array(width * height)
    
    // Calculate edge map inline (avoid separate function call and extra array copy)
    const edgeMap = new Uint8Array(width * height)
    
    // Sobel edge detection - unrolled kernel
    for (let y = 0; y < height; y++) {
        const yOffset = y * width
        for (let x = 0; x < width; x++) {
            // Clamp neighbor coordinates
            const x0 = x > 0 ? x - 1 : 0
            const x2 = x < width - 1 ? x + 1 : width - 1
            const y0 = y > 0 ? y - 1 : 0
            const y2 = y < height - 1 ? y + 1 : height - 1
            
            // Get pixel intensities (unrolled 3x3)
            const i00 = (y0 * width + x0) << 2
            const i01 = (y0 * width + x) << 2
            const i02 = (y0 * width + x2) << 2
            const i10 = (yOffset + x0) << 2
            const i12 = (yOffset + x2) << 2
            const i20 = (y2 * width + x0) << 2
            const i21 = (y2 * width + x) << 2
            const i22 = (y2 * width + x2) << 2
            
            const p00 = (data[i00] + data[i00 + 1] + data[i00 + 2]) * 0.333333
            const p01 = (data[i01] + data[i01 + 1] + data[i01 + 2]) * 0.333333
            const p02 = (data[i02] + data[i02 + 1] + data[i02 + 2]) * 0.333333
            const p10 = (data[i10] + data[i10 + 1] + data[i10 + 2]) * 0.333333
            const p12 = (data[i12] + data[i12 + 1] + data[i12 + 2]) * 0.333333
            const p20 = (data[i20] + data[i20 + 1] + data[i20 + 2]) * 0.333333
            const p21 = (data[i21] + data[i21 + 1] + data[i21 + 2]) * 0.333333
            const p22 = (data[i22] + data[i22 + 1] + data[i22 + 2]) * 0.333333
            
            // Sobel: Gx = [-1,0,1; -2,0,2; -1,0,1], Gy = [-1,-2,-1; 0,0,0; 1,2,1]
            const gx = -p00 + p02 - 2*p10 + 2*p12 - p20 + p22
            const gy = -p00 - 2*p01 - p02 + p20 + 2*p21 + p22
            
            edgeMap[yOffset + x] = Math.min(255, Math.sqrt(gx * gx + gy * gy))
        }
    }

    // Mark sample points in bitmap
    for (let i = 0; i < dataLen; i += distanceBetweenSamples) {
        const pixel = i >> 2
        if (pixel < sampleBitmap.length) {
            sampleBitmap[pixel] = 1
        }
    }

    // Pre-calculate stroke offsets to avoid repeated trig in inner loop
    const halfStrokeWidth = strokeWidth >> 1
    const strokeOffsets = []
    for (let len = 0; len < strokeLength; len++) {
        for (let w = -halfStrokeWidth; w < strokeWidth - halfStrokeWidth; w++) {
            strokeOffsets.push({
                dx: Math.round(cosAngle * len + cosPerp * w),
                dy: Math.round(sinAngle * len + sinPerp * w)
            })
        }
    }

    // Process each sample point
    for (let i = 0; i < dataLen; i += distanceBetweenSamples) {
        const pixel = i >> 2
        const x = pixel % width
        const y = (pixel / width) | 0

        const r = data[i]
        const g = data[i + 1]
        const b = data[i + 2]

        // Draw stroke using pre-calculated offsets
        for (let j = 0; j < strokeOffsets.length; j++) {
            const offset = strokeOffsets[j]
            const vx = x + offset.dx
            const vy = y + offset.dy
            
            // Bounds check
            if (vx < 0 || vx >= width || vy < 0 || vy >= height) continue
            
            const pixelIndex = vy * width + vx
            
            // Skip if sample point (unless overwrite enabled)
            if (!overwritePixels && sampleBitmap[pixelIndex]) continue
            
            // Check for edge (unless overwrite enabled)
            if (!overwriteEdges && edgeMap[pixelIndex] > edgeThreshold) break
            
            const dataIndex = pixelIndex << 2
            data[dataIndex] = r
            data[dataIndex + 1] = g
            data[dataIndex + 2] = b
            data[dataIndex + 3] = 255
        }
    }

    return data
}


export function pointsInSpace(image, parameters = {}) {
    const data = image.data
    const distanceBetweenSamples = (parameters.sampling ?? 10) << 2

    for (let i = 0; i < data.length; i += distanceBetweenSamples) {        
        data[i] = 255
        data[i + 1] = 255
        data[i + 2] = 255
    }
}

export function vectorsInSpace(image, parameters = {}) {
    const width = image.width
    const height = image.height
    const data = image.data
    const dataLen = data.length
    
    const smallestDimension = Math.max(1, Math.min(width, height))
    const maxStrokeWidth = Math.max(1, Math.floor(smallestDimension * 0.03))
    const maxStrokeLength = Math.max(3, Math.floor(smallestDimension * 0.12))

    const strokeWidth = clamp(parameters.width ?? 1, 1, maxStrokeWidth)
    const strokeLength = clamp(parameters.length ?? 3, 1, maxStrokeLength)
    const samplingValue = clamp(parameters.sampling ?? 10, 1, 2000)
    const distanceBetweenSamples = samplingValue << 2
    const r = parameters.R ?? 255
    const g = parameters.G ?? 255
    const b = parameters.B ?? 255
    const a = parameters.A ?? 255

    const radians = ((parameters.angle ?? 90) * Math.PI) / 180
    
    // Pre-calculate trig
    const cosAngle = Math.cos(radians)
    const sinAngle = Math.sin(radians)
    const cosPerp = Math.cos(radians + Math.PI / 2)
    const sinPerp = Math.sin(radians + Math.PI / 2)
    
    // Pre-calculate stroke offsets.
    // The span is centred on the sample and always covers `strokeWidth` columns,
    // so a width of 1 still draws a single-pixel stroke.
    const halfWidth = strokeWidth >> 1
    const strokeOffsets = []
    for (let len = 0; len < strokeLength; len++) {
        for (let w = -halfWidth; w < strokeWidth - halfWidth; w++) {
            strokeOffsets.push({
                dx: Math.round(cosAngle * len + cosPerp * w),
                dy: Math.round(sinAngle * len + sinPerp * w)
            })
        }
    }

    for (let i = 0; i < dataLen; i += distanceBetweenSamples) {
        const pixel = i >> 2
        const x = pixel % width
        const y = (pixel / width) | 0

        for (let j = 0; j < strokeOffsets.length; j++) {
            const offset = strokeOffsets[j]
            const vx = x + offset.dx
            const vy = y + offset.dy
    
            if (vx >= 0 && vx < width && vy >= 0 && vy < height) {
                const idx = (vy * width + vx) << 2
                data[idx] = r
                data[idx + 1] = g
                data[idx + 2] = b
                data[idx + 3] = a
            }
        }
    }

    return data
}

// ── Edge detection ────────────────────────────────────────────────────────────
// Sobel and Prewitt, flat and direction-coloured, were four near-identical copies
// of the same 60-line loop. They now share one kernel; only the coefficients and
// the colouring differ.

const SOBEL = { a: 2 }    // Gx = [-1,0,1; -2,0,2; -1,0,1]
const PREWITT = { a: 1 }  // Gx = [-1,0,1; -1,0,1; -1,0,1]

function parseHex(colour, fallback) {
    const hex = typeof colour === 'string' && colour.length >= 7 ? colour : fallback
    return [
        parseInt(hex.slice(1, 3), 16) || 0,
        parseInt(hex.slice(3, 5), 16) || 0,
        parseInt(hex.slice(5, 7), 16) || 0
    ]
}

/** Clear the frame to the chosen background before edges are drawn over it. */
function fillBackground(data, transparent, blackout) {
    if (!transparent && !blackout) return
    const alpha = transparent ? 0 : 255
    for (let i = 0; i < data.length; i += 4) {
        data[i] = 0
        data[i + 1] = 0
        data[i + 2] = 0
        data[i + 3] = alpha
    }
}

/**
 * Shared gradient-magnitude edge pass.
 *
 * @param {object} kernel      { a } - the centre-row/column weight (2 = Sobel, 1 = Prewitt)
 * @param {function} paint     (data, i, gx, gy, magnitude) => void, called for each edge pixel
 */
function detectEdges(image, parameters, kernel, paint) {
    const width = image.width
    const height = image.height
    const data = image.data
    const reference = new Uint8ClampedArray(data)
    const threshold = parameters.edgeThreshold ?? 100
    const a = kernel.a

    fillBackground(
        data,
        parameters.transparentBackground ?? false,
        parameters.blackoutBackground ?? true
    )

    for (let y = 0; y < height; y++) {
        const rowOffset = y * width
        const y0 = y > 0 ? y - 1 : 0
        const y2 = y < height - 1 ? y + 1 : height - 1
        const row0 = y0 * width
        const row2 = y2 * width

        for (let x = 0; x < width; x++) {
            const x0 = x > 0 ? x - 1 : 0
            const x2 = x < width - 1 ? x + 1 : width - 1

            // Channel sums stand in for intensity; the /3 is folded into the
            // magnitude below so the threshold keeps its original meaning.
            const i00 = (row0 + x0) << 2, i01 = (row0 + x) << 2, i02 = (row0 + x2) << 2
            const i10 = (rowOffset + x0) << 2, i12 = (rowOffset + x2) << 2
            const i20 = (row2 + x0) << 2, i21 = (row2 + x) << 2, i22 = (row2 + x2) << 2

            const p00 = reference[i00] + reference[i00 + 1] + reference[i00 + 2]
            const p01 = reference[i01] + reference[i01 + 1] + reference[i01 + 2]
            const p02 = reference[i02] + reference[i02 + 1] + reference[i02 + 2]
            const p10 = reference[i10] + reference[i10 + 1] + reference[i10 + 2]
            const p12 = reference[i12] + reference[i12 + 1] + reference[i12 + 2]
            const p20 = reference[i20] + reference[i20 + 1] + reference[i20 + 2]
            const p21 = reference[i21] + reference[i21 + 1] + reference[i21 + 2]
            const p22 = reference[i22] + reference[i22 + 1] + reference[i22 + 2]

            const gx = -p00 + p02 - a * p10 + a * p12 - p20 + p22
            const gy = -p00 - a * p01 - p02 + p20 + a * p21 + p22
            const magnitude = Math.sqrt(gx * gx + gy * gy) * 0.333333

            if (magnitude > threshold) {
                paint(data, (rowOffset + x) << 2, gx, gy, magnitude)
            }
        }
    }

    return data
}

function flatPainter(parameters) {
    const [r, g, b] = parseHex(parameters.edgeColor, '#ffffff')
    return (data, i) => {
        data[i] = r
        data[i + 1] = g
        data[i + 2] = b
        data[i + 3] = 255
    }
}

function directionPainter(parameters) {
    const [xr, xg, xb] = parseHex(parameters.colorX, '#ff0000')
    const [yr, yg, yb] = parseHex(parameters.colorY, '#00ff00')
    return (data, i, gx, gy, magnitude) => {
        // Blend the two colours by how horizontal vs vertical the gradient is.
        const inverse = 1 / (magnitude * 3)
        const nx = Math.abs(gx) * inverse
        const ny = Math.abs(gy) * inverse
        data[i] = Math.min(255, (nx * xr + ny * yr) | 0)
        data[i + 1] = Math.min(255, (nx * xg + ny * yg) | 0)
        data[i + 2] = Math.min(255, (nx * xb + ny * yb) | 0)
        data[i + 3] = 255
    }
}

export function sobelEdges(image, parameters = {}) {
    return detectEdges(image, parameters, SOBEL, flatPainter(parameters))
}

export function sobelEdgesColouredDirections(image, parameters = {}) {
    return detectEdges(image, parameters, SOBEL, directionPainter(parameters))
}

export function prewittEdges(image, parameters = {}) {
    return detectEdges(image, parameters, PREWITT, flatPainter(parameters))
}

export function prewittEdgesColouredDirections(image, parameters = {}) {
    return detectEdges(image, parameters, PREWITT, directionPainter(parameters))
}

// Aliases retained for the existing menu wiring.
export const prewireEdges = prewittEdges
// Alias for backwards compatibility
export const prewireEdgesColouredDirections = prewittEdgesColouredDirections