/**
 * GIF Animator Plugin
 * - Create animated GIFs by automating slider values
 * - Load GIFs and extract frames for editing in the layer stack
 * - Export edited frames back to GIF
 */

import GIF from 'gif.js'

// GIF.js worker path - needs to be served from public folder
const WORKER_PATH = '/gif.worker.js'

/**
 * GIF Frame Stack - stores frames for editing
 */
class GifFrameStack {
    constructor() {
        this.frames = [] // Array of { imageData, delay, canvas }
        this.width = 0
        this.height = 0
        this.currentFrameIndex = 0
    }

    get length() {
        return this.frames.length
    }

    get currentFrame() {
        return this.frames[this.currentFrameIndex] || null
    }

    addFrame(imageData, delay = 100) {
        const canvas = document.createElement('canvas')
        canvas.width = imageData.width
        canvas.height = imageData.height
        const ctx = canvas.getContext('2d')
        ctx.putImageData(imageData, 0, 0)
        
        this.frames.push({
            imageData: imageData,
            delay: delay,
            canvas: canvas
        })
        
        if (this.frames.length === 1) {
            this.width = imageData.width
            this.height = imageData.height
        }
    }

    getFrame(index) {
        return this.frames[index] || null
    }

    setFrame(index, imageData) {
        if (this.frames[index]) {
            this.frames[index].imageData = imageData
            const ctx = this.frames[index].canvas.getContext('2d')
            ctx.putImageData(imageData, 0, 0)
        }
    }

    setDelay(index, delay) {
        if (this.frames[index]) {
            this.frames[index].delay = delay
        }
    }

    deleteFrame(index) {
        if (index >= 0 && index < this.frames.length) {
            this.frames.splice(index, 1)
            if (this.currentFrameIndex >= this.frames.length) {
                this.currentFrameIndex = Math.max(0, this.frames.length - 1)
            }
        }
    }

    duplicateFrame(index) {
        const frame = this.frames[index]
        if (frame) {
            const newImageData = new ImageData(
                new Uint8ClampedArray(frame.imageData.data),
                frame.imageData.width,
                frame.imageData.height
            )
            this.frames.splice(index + 1, 0, {
                imageData: newImageData,
                delay: frame.delay,
                canvas: this.createCanvasFromImageData(newImageData)
            })
        }
    }

    moveFrame(fromIndex, toIndex) {
        if (fromIndex >= 0 && fromIndex < this.frames.length && 
            toIndex >= 0 && toIndex < this.frames.length) {
            const [frame] = this.frames.splice(fromIndex, 1)
            this.frames.splice(toIndex, 0, frame)
        }
    }

    createCanvasFromImageData(imageData) {
        const canvas = document.createElement('canvas')
        canvas.width = imageData.width
        canvas.height = imageData.height
        const ctx = canvas.getContext('2d')
        ctx.putImageData(imageData, 0, 0)
        return canvas
    }

    clear() {
        this.frames = []
        this.width = 0
        this.height = 0
        this.currentFrameIndex = 0
    }
}

// Global frame stack instance
export const gifFrameStack = new GifFrameStack()

/**
 * Parse GIF and extract frames
 * Uses canvas-based decoding for browser compatibility
 */
export async function loadGifFrames(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        
        reader.onload = async (e) => {
            try {
                const arrayBuffer = e.target.result
                const frames = await parseGif(arrayBuffer)
                
                gifFrameStack.clear()
                for (const frame of frames) {
                    gifFrameStack.addFrame(frame.imageData, frame.delay)
                }
                
                resolve(gifFrameStack)
            } catch (err) {
                reject(err)
            }
        }
        
        reader.onerror = () => reject(new Error('Failed to read file'))
        reader.readAsArrayBuffer(file)
    })
}

/**
 * Parse GIF binary data and extract frames
 */
async function parseGif(arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer)
    const frames = []
    
    // Verify GIF header
    const header = String.fromCharCode(...bytes.slice(0, 6))
    if (header !== 'GIF87a' && header !== 'GIF89a') {
        throw new Error('Invalid GIF file')
    }
    
    // Logical Screen Descriptor
    const width = bytes[6] | (bytes[7] << 8)
    const height = bytes[8] | (bytes[9] << 8)
    const packed = bytes[10]
    const hasGCT = (packed & 0x80) !== 0
    const gctSize = hasGCT ? 3 * (1 << ((packed & 0x07) + 1)) : 0
    
    let offset = 13 + gctSize
    
    // Global Color Table
    let globalColorTable = null
    if (hasGCT) {
        globalColorTable = []
        for (let i = 13; i < 13 + gctSize; i += 3) {
            globalColorTable.push([bytes[i], bytes[i + 1], bytes[i + 2]])
        }
    }
    
    // Create master canvas
    const masterCanvas = document.createElement('canvas')
    masterCanvas.width = width
    masterCanvas.height = height
    const masterCtx = masterCanvas.getContext('2d')
    
    let graphicControl = null
    let frameIndex = 0
    
    while (offset < bytes.length) {
        const blockType = bytes[offset++]
        
        if (blockType === 0x21) {
            // Extension
            const extType = bytes[offset++]
            
            if (extType === 0xF9) {
                // Graphic Control Extension
                const blockSize = bytes[offset++]
                const gcPacked = bytes[offset]
                const disposalMethod = (gcPacked >> 2) & 0x07
                const hasTransparency = (gcPacked & 0x01) !== 0
                const delay = (bytes[offset + 1] | (bytes[offset + 2] << 8)) * 10
                const transparentIndex = bytes[offset + 3]
                
                graphicControl = {
                    disposalMethod,
                    hasTransparency,
                    delay: Math.max(delay, 20),
                    transparentIndex
                }
                
                offset += blockSize + 1 // +1 for terminator
            } else {
                // Skip other extensions
                while (bytes[offset] !== 0) {
                    offset += bytes[offset] + 1
                }
                offset++ // Skip terminator
            }
        } else if (blockType === 0x2C) {
            // Image Descriptor
            const left = bytes[offset] | (bytes[offset + 1] << 8)
            const top = bytes[offset + 2] | (bytes[offset + 3] << 8)
            const frameWidth = bytes[offset + 4] | (bytes[offset + 5] << 8)
            const frameHeight = bytes[offset + 6] | (bytes[offset + 7] << 8)
            const imgPacked = bytes[offset + 8]
            offset += 9
            
            const hasLCT = (imgPacked & 0x80) !== 0
            const interlaced = (imgPacked & 0x40) !== 0
            const lctSize = hasLCT ? 3 * (1 << ((imgPacked & 0x07) + 1)) : 0
            
            // Local Color Table
            let colorTable = globalColorTable
            if (hasLCT) {
                colorTable = []
                for (let i = 0; i < lctSize; i += 3) {
                    colorTable.push([bytes[offset + i], bytes[offset + i + 1], bytes[offset + i + 2]])
                }
                offset += lctSize
            }
            
            // LZW Minimum Code Size
            const minCodeSize = bytes[offset++]
            
            // Collect LZW data blocks
            const lzwData = []
            while (bytes[offset] !== 0) {
                const blockSize = bytes[offset++]
                for (let i = 0; i < blockSize; i++) {
                    lzwData.push(bytes[offset++])
                }
            }
            offset++ // Skip terminator
            
            // Decode LZW
            const pixels = decodeLZW(lzwData, minCodeSize, frameWidth * frameHeight)
            
            // Apply frame to master canvas
            const frameImageData = masterCtx.createImageData(frameWidth, frameHeight)
            
            for (let i = 0; i < pixels.length; i++) {
                const colorIndex = pixels[i]
                const color = colorTable[colorIndex] || [0, 0, 0]
                const isTransparent = graphicControl?.hasTransparency && colorIndex === graphicControl.transparentIndex
                
                frameImageData.data[i * 4] = color[0]
                frameImageData.data[i * 4 + 1] = color[1]
                frameImageData.data[i * 4 + 2] = color[2]
                frameImageData.data[i * 4 + 3] = isTransparent ? 0 : 255
            }
            
            // Handle interlacing
            if (interlaced) {
                const deinterlaced = deinterlace(frameImageData, frameWidth, frameHeight)
                frameImageData.data.set(deinterlaced.data)
            }
            
            // Create temp canvas for this frame
            const tempCanvas = document.createElement('canvas')
            tempCanvas.width = frameWidth
            tempCanvas.height = frameHeight
            const tempCtx = tempCanvas.getContext('2d')
            tempCtx.putImageData(frameImageData, 0, 0)
            
            // Draw to master canvas
            masterCtx.drawImage(tempCanvas, left, top)
            
            // Capture frame
            const capturedData = masterCtx.getImageData(0, 0, width, height)
            frames.push({
                imageData: capturedData,
                delay: graphicControl?.delay || 100
            })
            
            // Handle disposal
            if (graphicControl) {
                if (graphicControl.disposalMethod === 2) {
                    // Restore to background
                    masterCtx.clearRect(left, top, frameWidth, frameHeight)
                } else if (graphicControl.disposalMethod === 3) {
                    // Restore to previous - not fully implemented
                }
            }
            
            graphicControl = null
            frameIndex++
        } else if (blockType === 0x3B) {
            // Trailer
            break
        } else {
            // Unknown block, try to skip
            break
        }
    }
    
    return frames
}

/**
 * LZW Decoder
 */
function decodeLZW(data, minCodeSize, pixelCount) {
    const clearCode = 1 << minCodeSize
    const eoiCode = clearCode + 1
    let codeSize = minCodeSize + 1
    let nextCode = eoiCode + 1
    let maxCode = (1 << codeSize) - 1
    
    // Initialize code table
    const codeTable = []
    for (let i = 0; i < clearCode; i++) {
        codeTable[i] = [i]
    }
    codeTable[clearCode] = []
    codeTable[eoiCode] = []
    
    const output = []
    let bitBuffer = 0
    let bitCount = 0
    let dataIndex = 0
    let prevCode = -1
    
    const readCode = () => {
        while (bitCount < codeSize && dataIndex < data.length) {
            bitBuffer |= data[dataIndex++] << bitCount
            bitCount += 8
        }
        const code = bitBuffer & ((1 << codeSize) - 1)
        bitBuffer >>= codeSize
        bitCount -= codeSize
        return code
    }
    
    while (output.length < pixelCount) {
        const code = readCode()
        
        if (code === clearCode) {
            codeSize = minCodeSize + 1
            nextCode = eoiCode + 1
            maxCode = (1 << codeSize) - 1
            codeTable.length = eoiCode + 1
            prevCode = -1
            continue
        }
        
        if (code === eoiCode) {
            break
        }
        
        let entry
        if (code < codeTable.length) {
            entry = codeTable[code]
        } else if (code === nextCode && prevCode !== -1) {
            entry = [...codeTable[prevCode], codeTable[prevCode][0]]
        } else {
            break
        }
        
        output.push(...entry)
        
        if (prevCode !== -1 && nextCode <= 4095) {
            codeTable[nextCode++] = [...codeTable[prevCode], entry[0]]
            if (nextCode > maxCode && codeSize < 12) {
                codeSize++
                maxCode = (1 << codeSize) - 1
            }
        }
        
        prevCode = code
    }
    
    return output.slice(0, pixelCount)
}

/**
 * Deinterlace GIF frame
 */
function deinterlace(imageData, width, height) {
    const output = new ImageData(width, height)
    const passes = [
        { start: 0, step: 8 },
        { start: 4, step: 8 },
        { start: 2, step: 4 },
        { start: 1, step: 2 }
    ]
    
    let srcRow = 0
    for (const pass of passes) {
        for (let y = pass.start; y < height; y += pass.step) {
            const srcOffset = srcRow * width * 4
            const dstOffset = y * width * 4
            for (let x = 0; x < width * 4; x++) {
                output.data[dstOffset + x] = imageData.data[srcOffset + x]
            }
            srcRow++
        }
    }
    
    return output
}

/**
 * Prepares image data for GIF export with transparency support.
 * GIF only supports 1-bit transparency (fully transparent or fully opaque).
 * We use index 0 in the color palette as the transparent color.
 * 
 * @param {CanvasRenderingContext2D} ctx - The canvas context
 * @param {number} width - Canvas width
 * @param {number} height - Canvas height  
 * @returns {{canvas: HTMLCanvasElement, hasTransparency: boolean}}
 */
function prepareFrameForGif(ctx, width, height) {
    const imageData = ctx.getImageData(0, 0, width, height)
    const data = imageData.data
    let hasTransparency = false
    
    // Two-pass approach:
    // 1. First, shift any actual black pixels (0,0,0) to near-black (1,1,1) so they don't become transparent
    // 2. Then, set transparent pixels to pure black (0,0,0) which becomes the transparency key
    for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] >= 128) {
            // Opaque pixel - check if it's pure black and shift it slightly
            if (data[i] === 0 && data[i + 1] === 0 && data[i + 2] === 0) {
                data[i] = 1
                data[i + 1] = 1
                data[i + 2] = 1
            }
        } else {
            // Transparent pixel - mark with pure black (the transparency key)
            data[i] = 0
            data[i + 1] = 0  
            data[i + 2] = 0
            data[i + 3] = 255  // Must be opaque for gif.js to process
            hasTransparency = true
        }
    }
    
    // Create a new canvas with the processed data
    const processedCanvas = document.createElement('canvas')
    processedCanvas.width = width
    processedCanvas.height = height
    const processedCtx = processedCanvas.getContext('2d')
    processedCtx.putImageData(imageData, 0, 0)
    
    return { canvas: processedCanvas, hasTransparency }
}

/**
 * Export frame stack as GIF using gif.js
 */
export function exportFrameStackAsGif(frameStack = gifFrameStack, options = {}) {
    const {
        quality = 10,
        workers = 2,
        workerScript = WORKER_PATH,
        onProgress = () => {}
    } = options

    return new Promise((resolve, reject) => {
        if (frameStack.length === 0) {
            reject(new Error('No frames to export'))
            return
        }

        // Check if any frame has transparency
        let hasAnyTransparency = false
        for (const frame of frameStack.frames) {
            const data = frame.imageData.data
            for (let i = 3; i < data.length; i += 4) {
                if (data[i] < 128) {
                    hasAnyTransparency = true
                    break
                }
            }
            if (hasAnyTransparency) break
        }

        const gifOptions = {
            workers: workers,
            quality: quality,
            width: frameStack.width,
            height: frameStack.height,
            workerScript: workerScript
        }
        
        // If we have transparency, tell gif.js to use black (0x000000) as transparent
        if (hasAnyTransparency) {
            gifOptions.transparent = 0x000000
        }

        const gif = new GIF(gifOptions)

        for (const frame of frameStack.frames) {
            if (hasAnyTransparency) {
                // Process frame to mark transparent pixels
                const frameCtx = frame.canvas.getContext('2d')
                const { canvas } = prepareFrameForGif(frameCtx, frameStack.width, frameStack.height)
                gif.addFrame(canvas, { delay: frame.delay, copy: true, dispose: 2 })
            } else {
                gif.addFrame(frame.canvas, { delay: frame.delay, copy: true })
            }
        }

        gif.on('progress', (p) => onProgress(Math.round(p * 100)))
        
        gif.on('finished', (blob) => {
            resolve(blob)
        })

        gif.render()
    })
}

/**
 * Animation configuration options
 */
const easingFunctions = {
    linear: t => t,
    easeIn: t => t * t,
    easeOut: t => t * (2 - t),
    easeInOut: t => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
    easeInCubic: t => t * t * t,
    easeOutCubic: t => (--t) * t * t + 1,
    easeInOutCubic: t => t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1,
    bounce: t => {
        const n1 = 7.5625
        const d1 = 2.75
        if (t < 1 / d1) return n1 * t * t
        if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75
        if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375
        return n1 * (t -= 2.625 / d1) * t + 0.984375
    }
}

/**
 * Creates an animated GIF by automating a slider parameter
 */
export async function createSliderAnimation(imageEditor, layerIndex, config, onProgress = () => {}) {
    const {
        parameterName,
        startValue,
        endValue,
        frameCount = 10,
        frameDelay = 100,
        pingPong = false,
        easing = 'linear',
        scale = 1,
        quality = 10
    } = config

    if (!imageEditor) {
        throw new Error('ImageEditor instance is required')
    }

    const layer = imageEditor.layerManager.layers[layerIndex]
    if (!layer) {
        throw new Error(`Layer at index ${layerIndex} not found`)
    }

    if (!layer.effectParameters[parameterName]) {
        throw new Error(`Parameter "${parameterName}" not found on layer`)
    }

    const easingFn = easingFunctions[easing] || easingFunctions.linear

    // Calculate output dimensions
    const outputWidth = Math.round(imageEditor.canvas.width * scale)
    const outputHeight = Math.round(imageEditor.canvas.height * scale)

    // Store original value to restore later
    const originalValue = layer.effectParameters[parameterName].value

    // Generate frame values
    const frameValues = []
    for (let i = 0; i < frameCount; i++) {
        const t = frameCount > 1 ? i / (frameCount - 1) : 0
        const easedT = easingFn(t)
        const value = startValue + (endValue - startValue) * easedT
        frameValues.push(value)
    }

    // Add reverse frames for ping-pong
    if (pingPong) {
        for (let i = frameCount - 2; i > 0; i--) {
            frameValues.push(frameValues[i])
        }
    }

    const totalFrames = frameValues.length

    // Create temporary canvas for scaling
    const tempCanvas = document.createElement('canvas')
    tempCanvas.width = outputWidth
    tempCanvas.height = outputHeight
    const tempCtx = tempCanvas.getContext('2d')

    // First pass: check if any frame has transparency
    let hasTransparency = false
    layer.effectParameters[parameterName].value = frameValues[0]
    await renderFrameSync(imageEditor)
    tempCtx.drawImage(imageEditor.canvas, 0, 0, outputWidth, outputHeight)
    const checkData = tempCtx.getImageData(0, 0, outputWidth, outputHeight).data
    for (let i = 3; i < checkData.length; i += 4) {
        if (checkData[i] < 128) {
            hasTransparency = true
            break
        }
    }

    // Create GIF encoder
    const gifOptions = {
        workers: 2,
        quality: quality,
        width: outputWidth,
        height: outputHeight,
        workerScript: WORKER_PATH
    }
    
    if (hasTransparency) {
        gifOptions.transparent = 0x000000
    }
    
    const gif = new GIF(gifOptions)

    // Capture frames
    for (let i = 0; i < totalFrames; i++) {
        const value = frameValues[i]

        // Update the parameter
        layer.effectParameters[parameterName].value = value

        // Render the frame synchronously
        await renderFrameSync(imageEditor)
        
        // Small delay to prevent browser throttling on large GIFs
        if (totalFrames > 100 && i % 10 === 0) {
            await new Promise(r => setTimeout(r, 10))
        }

        // Scale and capture
        tempCtx.clearRect(0, 0, outputWidth, outputHeight)
        tempCtx.drawImage(imageEditor.canvas, 0, 0, outputWidth, outputHeight)
        
        if (hasTransparency) {
            const { canvas } = prepareFrameForGif(tempCtx, outputWidth, outputHeight)
            gif.addFrame(canvas, { delay: frameDelay, copy: true, dispose: 2 })
        } else {
            gif.addFrame(tempCtx, { delay: frameDelay, copy: true })
        }

        onProgress(Math.round((i + 1) / totalFrames * 50)) // 50% for capture
    }

    // Restore original value
    layer.effectParameters[parameterName].value = originalValue
    await renderFrameSync(imageEditor)

    // Clean up temp canvas
    tempCanvas.remove()

    // Render GIF
    return new Promise((resolve, reject) => {
        gif.on('progress', (p) => onProgress(50 + Math.round(p * 50))) // 50-100% for render
        gif.on('finished', (blob) => resolve(blob))
        gif.on('error', (err) => reject(err))
        gif.render()
    })
}

/**
 * Renders a frame synchronously with proper wait for completion
 */
function renderFrameSync(imageEditor) {
    return new Promise(resolve => {
        const baseImageData = imageEditor.getBaseImageData()
        const imageData = imageEditor.cloneImageData(baseImageData)
        imageEditor.layerManager.applyLayerEffects(imageData)
        imageEditor.context.putImageData(imageData, 0, 0)
        // Double requestAnimationFrame ensures paint is complete
        requestAnimationFrame(() => {
            requestAnimationFrame(() => resolve())
        })
    })
}

/**
 * Creates a multi-parameter animation
 */
export async function createMultiParameterAnimation(imageEditor, layerIndex, configs, options = {}, onProgress = () => {}) {
    const {
        frameCount = 10,
        frameDelay = 100,
        pingPong = false,
        scale = 1,
        quality = 10
    } = options

    if (!imageEditor) {
        throw new Error('ImageEditor instance is required')
    }

    const layer = imageEditor.layerManager.layers[layerIndex]
    if (!layer) {
        throw new Error(`Layer at index ${layerIndex} not found`)
    }

    for (const config of configs) {
        if (!layer.effectParameters[config.parameterName]) {
            throw new Error(`Parameter "${config.parameterName}" not found on layer`)
        }
    }

    const outputWidth = Math.round(imageEditor.canvas.width * scale)
    const outputHeight = Math.round(imageEditor.canvas.height * scale)

    const originalValues = {}
    for (const config of configs) {
        originalValues[config.parameterName] = layer.effectParameters[config.parameterName].value
    }

    const allFrameValues = configs.map(config => {
        const { parameterName, startValue, endValue, easing = 'linear' } = config
        const easingFn = easingFunctions[easing] || easingFunctions.linear
        
        const values = []
        for (let i = 0; i < frameCount; i++) {
            const t = frameCount > 1 ? i / (frameCount - 1) : 0
            const easedT = easingFn(t)
            values.push(startValue + (endValue - startValue) * easedT)
        }
        
        if (pingPong) {
            for (let i = frameCount - 2; i > 0; i--) {
                values.push(values[i])
            }
        }
        
        return { parameterName, values }
    })

    const totalFrames = allFrameValues[0].values.length

    const tempCanvas = document.createElement('canvas')
    tempCanvas.width = outputWidth
    tempCanvas.height = outputHeight
    const tempCtx = tempCanvas.getContext('2d')

    // First pass: check if any frame has transparency
    let hasTransparency = false
    for (const { parameterName, values } of allFrameValues) {
        layer.effectParameters[parameterName].value = values[0]
    }
    await renderFrameSync(imageEditor)
    tempCtx.drawImage(imageEditor.canvas, 0, 0, outputWidth, outputHeight)
    const checkData = tempCtx.getImageData(0, 0, outputWidth, outputHeight).data
    for (let i = 3; i < checkData.length; i += 4) {
        if (checkData[i] < 128) {
            hasTransparency = true
            break
        }
    }

    // Create GIF encoder
    const gifOptions = {
        workers: 2,
        quality: quality,
        width: outputWidth,
        height: outputHeight,
        workerScript: WORKER_PATH
    }
    
    if (hasTransparency) {
        gifOptions.transparent = 0x000000
    }
    
    const gif = new GIF(gifOptions)

    for (let i = 0; i < totalFrames; i++) {
        for (const { parameterName, values } of allFrameValues) {
            layer.effectParameters[parameterName].value = values[i]
        }

        await renderFrameSync(imageEditor)

        tempCtx.clearRect(0, 0, outputWidth, outputHeight)
        tempCtx.drawImage(imageEditor.canvas, 0, 0, outputWidth, outputHeight)
        
        if (hasTransparency) {
            const { canvas } = prepareFrameForGif(tempCtx, outputWidth, outputHeight)
            gif.addFrame(canvas, { delay: frameDelay, copy: true, dispose: 2 })
        } else {
            gif.addFrame(tempCtx, { delay: frameDelay, copy: true })
        }

        onProgress(Math.round((i + 1) / totalFrames * 50))
    }

    for (const config of configs) {
        layer.effectParameters[config.parameterName].value = originalValues[config.parameterName]
    }
    await renderFrameSync(imageEditor)

    // Clean up temp canvas
    tempCanvas.remove()

    return new Promise((resolve, reject) => {
        gif.on('progress', (p) => onProgress(50 + Math.round(p * 50)))
        gif.on('finished', (blob) => resolve(blob))
        gif.on('error', (err) => reject(err))
        gif.render()
    })
}

/**
 * Downloads a blob as a file
 */
export function downloadBlob(blob, filename = 'animation.gif') {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
}

/**
 * Creates and downloads a slider animation GIF
 */
export async function exportSliderAnimationAsGif(imageEditor, layerIndex, config, filename = 'animation.gif', onProgress = () => {}) {
    const blob = await createSliderAnimation(imageEditor, layerIndex, config, onProgress)
    downloadBlob(blob, filename)
    return blob
}

/**
 * Gets available parameters for animation from a layer
 */
export function getAnimatableParameters(imageEditor, layerIndex) {
    if (!imageEditor) return []
    
    const layer = imageEditor.layerManager.layers[layerIndex]
    if (!layer || !layer.effectParameters) return []

    return Object.entries(layer.effectParameters)
        .filter(([_, config]) => typeof config.value === 'number' && config.range)
        .map(([name, config]) => ({
            name,
            currentValue: config.value,
            min: config.range[0],
            max: config.range[1],
            step: config.valueStep || 0.01
        }))
}

/**
 * Preview animation without creating GIF
 */
export function previewAnimation(imageEditor, layerIndex, config, onFrame = () => {}) {
    const {
        parameterName,
        startValue,
        endValue,
        frameCount = 10,
        frameDelay = 100,
        pingPong = false,
        easing = 'linear'
    } = config

    const layer = imageEditor?.layerManager?.layers[layerIndex]
    if (!layer || !layer.effectParameters[parameterName]) {
        console.error('Invalid layer or parameter')
        return () => {}
    }

    const easingFn = easingFunctions[easing] || easingFunctions.linear
    const originalValue = layer.effectParameters[parameterName].value

    const frameValues = []
    for (let i = 0; i < frameCount; i++) {
        const t = frameCount > 1 ? i / (frameCount - 1) : 0
        const easedT = easingFn(t)
        frameValues.push(startValue + (endValue - startValue) * easedT)
    }

    if (pingPong) {
        for (let i = frameCount - 2; i > 0; i--) {
            frameValues.push(frameValues[i])
        }
    }

    let currentFrame = 0
    let isRunning = true

    const animate = () => {
        if (!isRunning) return

        const value = frameValues[currentFrame]
        layer.effectParameters[parameterName].value = value
        imageEditor.requestRender(true)
        onFrame(value, currentFrame, frameValues.length)

        currentFrame = (currentFrame + 1) % frameValues.length

        setTimeout(animate, frameDelay)
    }

    animate()

    return () => {
        isRunning = false
        layer.effectParameters[parameterName].value = originalValue
        imageEditor.requestRender(true)
    }
}

/**
 * Load a GIF frame into the image editor as the base image
 */
export function loadFrameToEditor(imageEditor, frameIndex) {
    const frame = gifFrameStack.getFrame(frameIndex)
    if (!frame || !imageEditor) return false

    const img = new Image()
    const canvas = document.createElement('canvas')
    canvas.width = frame.imageData.width
    canvas.height = frame.imageData.height
    const ctx = canvas.getContext('2d')
    ctx.putImageData(frame.imageData, 0, 0)

    img.onload = () => {
        imageEditor.image = img
        imageEditor.canvas.width = img.width
        imageEditor.canvas.height = img.height
        imageEditor.invalidateBaseImageCache()
        imageEditor.requestRender(true)
    }
    img.src = canvas.toDataURL()
    
    gifFrameStack.currentFrameIndex = frameIndex
    return true
}

/**
 * Save current editor state back to frame stack
 */
export function saveEditorToFrame(imageEditor, frameIndex) {
    if (!imageEditor || frameIndex < 0 || frameIndex >= gifFrameStack.length) return false

    const imageData = imageEditor.context.getImageData(
        0, 0, 
        imageEditor.canvas.width, 
        imageEditor.canvas.height
    )
    
    gifFrameStack.setFrame(frameIndex, imageData)
    return true
}

/**
 * GIF Playback Controller
 * Plays/stops GIF animation on the main canvas
 */
let gifPlaybackInterval = null
let gifPlaybackRunning = false

export function isGifPlaying() {
    return gifPlaybackRunning
}

export function startGifPlayback(imageEditor, onFrameChange) {
    if (gifFrameStack.length === 0) return false
    if (gifPlaybackRunning) return true
    
    gifPlaybackRunning = true
    let currentIndex = gifFrameStack.currentFrameIndex
    
    const playNextFrame = () => {
        if (!gifPlaybackRunning) return
        
        const frame = gifFrameStack.getFrame(currentIndex)
        if (!frame) {
            stopGifPlayback()
            return
        }
        
        // Draw frame to editor canvas
        const canvas = document.createElement('canvas')
        canvas.width = frame.imageData.width
        canvas.height = frame.imageData.height
        const ctx = canvas.getContext('2d')
        ctx.putImageData(frame.imageData, 0, 0)
        
        const img = new Image()
        img.onload = () => {
            if (!gifPlaybackRunning) return
            imageEditor.image = img
            imageEditor.canvas.width = img.width
            imageEditor.canvas.height = img.height
            imageEditor.invalidateBaseImageCache()
            imageEditor.requestRender(true)
            
            if (onFrameChange) onFrameChange(currentIndex)
            
            // Schedule next frame
            const delay = frame.delay || 100
            gifPlaybackInterval = setTimeout(() => {
                currentIndex = (currentIndex + 1) % gifFrameStack.length
                playNextFrame()
            }, delay)
        }
        img.src = canvas.toDataURL()
    }
    
    playNextFrame()
    return true
}

export function stopGifPlayback() {
    gifPlaybackRunning = false
    if (gifPlaybackInterval) {
        clearTimeout(gifPlaybackInterval)
        gifPlaybackInterval = null
    }
}

export function toggleGifPlayback(imageEditor, onFrameChange) {
    if (gifPlaybackRunning) {
        stopGifPlayback()
        return false
    } else {
        return startGifPlayback(imageEditor, onFrameChange)
    }
}

/**
 * Estimate GIF file size based on parameters
 * GIF uses LZW compression, typically achieving 2-4x compression for typical images
 * More complex/noisy images compress worse
 */
export function estimateGifFileSize(width, height, frameCount, pingPong = false) {
    // Calculate total frames including ping-pong
    const totalFrames = pingPong ? (frameCount * 2 - 2) : frameCount
    
    // Raw frame size (GIF uses 256 color palette = 1 byte per pixel)
    const rawFrameSize = width * height
    
    // GIF overhead per frame (local color table, graphic control extension, etc.)
    const frameOverhead = 800 // approximate bytes per frame for headers
    
    // LZW compression ratio varies by image complexity
    // Complex animated content typically achieves 1.5-3x compression
    // We use a conservative estimate of 2x compression
    const compressionRatio = 2
    
    // Calculate estimated size
    const compressedFrameSize = rawFrameSize / compressionRatio
    const totalSize = (compressedFrameSize + frameOverhead) * totalFrames
    
    // Add global header overhead
    const headerOverhead = 1000 // GIF header, global color table, etc.
    
    return {
        bytes: totalSize + headerOverhead,
        totalFrames,
        rawFrameSize,
        dimensions: { width, height }
    }
}

/**
 * Format bytes to human readable string
 */
export function formatFileSize(bytes) {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

// Export easing function names for UI
export const availableEasings = Object.keys(easingFunctions)
