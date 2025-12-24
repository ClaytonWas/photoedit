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
    const strokeOffsets = []
    for (let len = 0; len < strokeLength; len++) {
        for (let w = -strokeWidth >> 1; w < strokeWidth >> 1; w++) {
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
    
    // Pre-calculate stroke offsets
    const halfWidth = strokeWidth >> 1
    const strokeOffsets = []
    for (let len = 0; len < strokeLength; len++) {
        for (let w = -halfWidth; w < halfWidth; w++) {
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

export function sobelEdges(image, parameters = {}) {
    const width = image.width
    const height = image.height
    const data = image.data
    const refData = new Uint8ClampedArray(data)
    const edgeThreshold = parameters.edgeThreshold ?? 100
    const blackoutBackground = parameters.blackoutBackground ?? true
    const transparentBackground = parameters.transparentBackground ?? false

    // Clear to black if needed
    if (blackoutBackground && !transparentBackground) {
        for (let i = 0; i < data.length; i += 4) {
            data[i] = 0
            data[i + 1] = 0
            data[i + 2] = 0
            data[i + 3] = 255
        }   
    }

    // Process with unrolled Sobel kernel
    for (let y = 0; y < height; y++) {
        const yOffset = y * width
        const y0 = y > 0 ? y - 1 : 0
        const y2 = y < height - 1 ? y + 1 : height - 1
        
        for (let x = 0; x < width; x++) {
            const x0 = x > 0 ? x - 1 : 0
            const x2 = x < width - 1 ? x + 1 : width - 1
            
            // Get pixel intensities (unrolled)
            const i00 = (y0 * width + x0) << 2
            const i01 = (y0 * width + x) << 2
            const i02 = (y0 * width + x2) << 2
            const i10 = (yOffset + x0) << 2
            const i12 = (yOffset + x2) << 2
            const i20 = (y2 * width + x0) << 2
            const i21 = (y2 * width + x) << 2
            const i22 = (y2 * width + x2) << 2
            
            const p00 = refData[i00] + refData[i00 + 1] + refData[i00 + 2]
            const p01 = refData[i01] + refData[i01 + 1] + refData[i01 + 2]
            const p02 = refData[i02] + refData[i02 + 1] + refData[i02 + 2]
            const p10 = refData[i10] + refData[i10 + 1] + refData[i10 + 2]
            const p12 = refData[i12] + refData[i12 + 1] + refData[i12 + 2]
            const p20 = refData[i20] + refData[i20 + 1] + refData[i20 + 2]
            const p21 = refData[i21] + refData[i21 + 1] + refData[i21 + 2]
            const p22 = refData[i22] + refData[i22 + 1] + refData[i22 + 2]
            
            // Sobel gradients (skip /3 since we're just comparing to threshold)
            const gx = -p00 + p02 - 2*p10 + 2*p12 - p20 + p22
            const gy = -p00 - 2*p01 - p02 + p20 + 2*p21 + p22
            const magnitude = Math.sqrt(gx * gx + gy * gy) * 0.333333
            
            const i = (yOffset + x) << 2
            if (magnitude > edgeThreshold) {
                data[i] = 255
                data[i + 1] = 255
                data[i + 2] = 255
            } else if (transparentBackground) {
                data[i + 3] = 0
            }
        }
    }

    return data
}

export function sobelEdgesColouredDirections(image, parameters = {}) {
    const width = image.width
    const height = image.height
    const data = image.data
    const refData = new Uint8ClampedArray(data)
    const edgeThreshold = parameters.edgeThreshold ?? 100
    const blackoutBackground = parameters.blackoutBackground ?? true
    const transparentBackground = parameters.transparentBackground ?? false

    if (blackoutBackground && !transparentBackground) {
        for (let i = 0; i < data.length; i += 4) {
            data[i] = 0
            data[i + 1] = 0
            data[i + 2] = 0
            data[i + 3] = 255
        }   
    }

    for (let y = 0; y < height; y++) {
        const yOffset = y * width
        const y0 = y > 0 ? y - 1 : 0
        const y2 = y < height - 1 ? y + 1 : height - 1
        
        for (let x = 0; x < width; x++) {
            const x0 = x > 0 ? x - 1 : 0
            const x2 = x < width - 1 ? x + 1 : width - 1
            
            const i00 = (y0 * width + x0) << 2
            const i01 = (y0 * width + x) << 2
            const i02 = (y0 * width + x2) << 2
            const i10 = (yOffset + x0) << 2
            const i12 = (yOffset + x2) << 2
            const i20 = (y2 * width + x0) << 2
            const i21 = (y2 * width + x) << 2
            const i22 = (y2 * width + x2) << 2
            
            const p00 = refData[i00] + refData[i00 + 1] + refData[i00 + 2]
            const p01 = refData[i01] + refData[i01 + 1] + refData[i01 + 2]
            const p02 = refData[i02] + refData[i02 + 1] + refData[i02 + 2]
            const p10 = refData[i10] + refData[i10 + 1] + refData[i10 + 2]
            const p12 = refData[i12] + refData[i12 + 1] + refData[i12 + 2]
            const p20 = refData[i20] + refData[i20 + 1] + refData[i20 + 2]
            const p21 = refData[i21] + refData[i21 + 1] + refData[i21 + 2]
            const p22 = refData[i22] + refData[i22 + 1] + refData[i22 + 2]
            
            const gx = -p00 + p02 - 2*p10 + 2*p12 - p20 + p22
            const gy = -p00 - 2*p01 - p02 + p20 + 2*p21 + p22
            const magnitude = Math.sqrt(gx * gx + gy * gy) * 0.333333
            
            const i = (yOffset + x) << 2
            if (magnitude > edgeThreshold) {
                const invMag = 1 / (magnitude * 3)
                const normalizedX = Math.abs(gx) * invMag
                const normalizedY = Math.abs(gy) * invMag
                
                data[i] = (normalizedX * 255) | 0
                data[i + 1] = (normalizedY * 255) | 0
                data[i + 2] = (normalizedX * normalizedY * 255) | 0
            } else if (transparentBackground) {
                data[i + 3] = 0
            }
        }
    }

    return data
}

export function prewittEdges(image, parameters = {}) {
    const width = image.width
    const height = image.height
    const data = image.data
    const refData = new Uint8ClampedArray(data)
    const edgeThreshold = parameters.edgeThreshold ?? 100
    const blackoutBackground = parameters.blackoutBackground ?? true
    const transparentBackground = parameters.transparentBackground ?? false

    if (blackoutBackground && !transparentBackground) {
        for (let i = 0; i < data.length; i += 4) {
            data[i] = 0
            data[i + 1] = 0
            data[i + 2] = 0
            data[i + 3] = 255
        }   
    }

    for (let y = 0; y < height; y++) {
        const yOffset = y * width
        const y0 = y > 0 ? y - 1 : 0
        const y2 = y < height - 1 ? y + 1 : height - 1
        
        for (let x = 0; x < width; x++) {
            const x0 = x > 0 ? x - 1 : 0
            const x2 = x < width - 1 ? x + 1 : width - 1
            
            const i00 = (y0 * width + x0) << 2
            const i01 = (y0 * width + x) << 2
            const i02 = (y0 * width + x2) << 2
            const i10 = (yOffset + x0) << 2
            const i12 = (yOffset + x2) << 2
            const i20 = (y2 * width + x0) << 2
            const i21 = (y2 * width + x) << 2
            const i22 = (y2 * width + x2) << 2
            
            const p00 = refData[i00] + refData[i00 + 1] + refData[i00 + 2]
            const p01 = refData[i01] + refData[i01 + 1] + refData[i01 + 2]
            const p02 = refData[i02] + refData[i02 + 1] + refData[i02 + 2]
            const p10 = refData[i10] + refData[i10 + 1] + refData[i10 + 2]
            const p12 = refData[i12] + refData[i12 + 1] + refData[i12 + 2]
            const p20 = refData[i20] + refData[i20 + 1] + refData[i20 + 2]
            const p21 = refData[i21] + refData[i21 + 1] + refData[i21 + 2]
            const p22 = refData[i22] + refData[i22 + 1] + refData[i22 + 2]
            
            // Prewitt: Gx = [-1,0,1; -1,0,1; -1,0,1], Gy = [1,1,1; 0,0,0; -1,-1,-1]
            const gx = -p00 + p02 - p10 + p12 - p20 + p22
            const gy = p00 + p01 + p02 - p20 - p21 - p22
            const magnitude = Math.sqrt(gx * gx + gy * gy) * 0.333333
            
            const i = (yOffset + x) << 2
            if (magnitude > edgeThreshold) {
                data[i] = 255
                data[i + 1] = 255
                data[i + 2] = 255
            } else if (transparentBackground) {
                data[i + 3] = 0
            }
        }
    }

    return data
}

// Alias for backwards compatibility
export const prewireEdges = prewittEdges

export function prewittEdgesColouredDirections(image, parameters = {}) {
    const width = image.width
    const height = image.height
    const data = image.data
    const refData = new Uint8ClampedArray(data)
    const edgeThreshold = parameters.edgeThreshold ?? 100
    const blackoutBackground = parameters.blackoutBackground ?? true
    const transparentBackground = parameters.transparentBackground ?? false

    if (blackoutBackground && !transparentBackground) {
        for (let i = 0; i < data.length; i += 4) {
            data[i] = 0
            data[i + 1] = 0
            data[i + 2] = 0
            data[i + 3] = 255
        }   
    }

    for (let y = 0; y < height; y++) {
        const yOffset = y * width
        const y0 = y > 0 ? y - 1 : 0
        const y2 = y < height - 1 ? y + 1 : height - 1
        
        for (let x = 0; x < width; x++) {
            const x0 = x > 0 ? x - 1 : 0
            const x2 = x < width - 1 ? x + 1 : width - 1
            
            const i00 = (y0 * width + x0) << 2
            const i01 = (y0 * width + x) << 2
            const i02 = (y0 * width + x2) << 2
            const i10 = (yOffset + x0) << 2
            const i12 = (yOffset + x2) << 2
            const i20 = (y2 * width + x0) << 2
            const i21 = (y2 * width + x) << 2
            const i22 = (y2 * width + x2) << 2
            
            const p00 = refData[i00] + refData[i00 + 1] + refData[i00 + 2]
            const p01 = refData[i01] + refData[i01 + 1] + refData[i01 + 2]
            const p02 = refData[i02] + refData[i02 + 1] + refData[i02 + 2]
            const p10 = refData[i10] + refData[i10 + 1] + refData[i10 + 2]
            const p12 = refData[i12] + refData[i12 + 1] + refData[i12 + 2]
            const p20 = refData[i20] + refData[i20 + 1] + refData[i20 + 2]
            const p21 = refData[i21] + refData[i21 + 1] + refData[i21 + 2]
            const p22 = refData[i22] + refData[i22 + 1] + refData[i22 + 2]
            
            const gx = -p00 + p02 - p10 + p12 - p20 + p22
            const gy = p00 + p01 + p02 - p20 - p21 - p22
            const magnitude = Math.sqrt(gx * gx + gy * gy) * 0.333333
            
            const i = (yOffset + x) << 2
            if (magnitude > edgeThreshold) {
                const invMag = 1 / (magnitude * 3)
                const normalizedX = Math.abs(gx) * invMag
                const normalizedY = Math.abs(gy) * invMag
                
                data[i] = (normalizedX * 255) | 0
                data[i + 1] = (normalizedY * 255) | 0
                data[i + 2] = (normalizedX * normalizedY * 255) | 0
            } else if (transparentBackground) {
                data[i + 3] = 0
            }
        }
    }

    return data
}

// Alias for backwards compatibility
export const prewireEdgesColouredDirections = prewittEdgesColouredDirections