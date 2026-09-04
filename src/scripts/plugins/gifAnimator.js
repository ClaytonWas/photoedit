/**
 * GIF Animator Plugin
 * - Create animated GIFs by automating slider values
 * - Load GIFs and extract frames for editing in the layer stack
 * - Export edited frames back to GIF
 */

import GIF from 'gif.js'
import { compositeLayers } from '../core/composite.js'

// GIF.js worker path - needs to be served from public folder
const WORKER_PATH = '/gif.worker.js'

/**
 * GIF Frame Stack - stores frames for editing
 */
class GifFrameStack {
    constructor() {
        // Frames hold pixels only. They used to also carry a full HTMLCanvasElement
        // of the same size, doubling memory: this repo's own 1536x685 60-frame
        // sample GIF cost ~505MB resident. Anything that needs a canvas renders
        // through the shared scratch below.
        this.frames = [] // Array of { id, rev, imageData, delay, rawDelay }
        this.width = 0
        this.height = 0
        this.currentFrameIndex = 0
        // Which frame, if any, is actually loaded into the editor as its base image.
        // Distinct from currentFrameIndex, which only tracks what is being previewed:
        // writing back to a merely-previewed frame overwrites it with the wrong pixels.
        this.editingFrameIndex = null
        this.loopCount = 0        // 0 = forever, matching the GIF default
        this.nextId = 1
        this.scratch = null
        this.scratchCtx = null
    }

    /**
     * Shared canvas holding one frame at a time. Callers must use the result
     * immediately - the next call overwrites it.
     */
    renderFrameToScratch(index) {
        const frame = this.frames[index]
        if (!frame) return null
        const { width, height } = frame.imageData
        if (!this.scratch) {
            this.scratch = document.createElement('canvas')
            this.scratchCtx = this.scratch.getContext('2d', { willReadFrequently: true })
        }
        if (this.scratch.width !== width || this.scratch.height !== height) {
            this.scratch.width = width
            this.scratch.height = height
        }
        this.scratchCtx.putImageData(frame.imageData, 0, 0)
        return this.scratch
    }

    get length() {
        return this.frames.length
    }

    get currentFrame() {
        return this.frames[this.currentFrameIndex] || null
    }

    addFrame(imageData, delay = 100) {
        // id is stable across reordering and rev changes on every pixel write, so
        // thumbnail caches key on identity instead of array position.
        this.frames.push({
            id: this.nextId++,
            rev: 0,
            imageData,
            delay
        })

        if (this.frames.length === 1) {
            this.width = imageData.width
            this.height = imageData.height
        }
    }

    insertFrames(imageDataList, atIndex = this.frames.length, delay = 100) {
        const made = imageDataList.map(imageData => ({
            id: this.nextId++, rev: 0, imageData, delay
        }))
        const at = Math.max(0, Math.min(atIndex, this.frames.length))
        this.frames.splice(at, 0, ...made)
        if (this.frames.length === made.length && made.length) {
            this.width = made[0].imageData.width
            this.height = made[0].imageData.height
        }
        return made.length
    }

    /**
     * Recompute the stack's nominal size from its frames. Frames are padded or
     * cropped to this on export, so it must bound them all.
     */
    syncDimensions() {
        let width = 0
        let height = 0
        for (const frame of this.frames) {
            if (frame.imageData.width > width) width = frame.imageData.width
            if (frame.imageData.height > height) height = frame.imageData.height
        }
        this.width = width
        this.height = height
    }

    getFrame(index) {
        return this.frames[index] || null
    }

    setFrame(index, imageData) {
        const frame = this.frames[index]
        if (!frame) return
        frame.imageData = imageData
        frame.rev++
        // The stack's dimensions are what the encoder is told to emit, so they must
        // always describe the frames. Keeping them only in step with frame 0 let a
        // resized middle frame be read past the end of during export.
        this.syncDimensions()
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
        if (!frame) return
        const copy = new ImageData(
            new Uint8ClampedArray(frame.imageData.data),
            frame.imageData.width,
            frame.imageData.height
        )
        this.frames.splice(index + 1, 0, {
            id: this.nextId++,
            rev: 0,
            imageData: copy,
            delay: frame.delay
        })
    }

    reverse() {
        this.frames.reverse()
        this.currentFrameIndex = this.frames.length - 1 - this.currentFrameIndex
    }

    moveFrame(fromIndex, toIndex) {
        if (fromIndex >= 0 && fromIndex < this.frames.length && 
            toIndex >= 0 && toIndex < this.frames.length) {
            const [frame] = this.frames.splice(fromIndex, 1)
            this.frames.splice(toIndex, 0, frame)
        }
    }

    clear() {
        this.frames = []
        this.width = 0
        this.height = 0
        this.currentFrameIndex = 0
        this.editingFrameIndex = null
        this.loopCount = 0
    }
}

// Global frame stack instance
export const gifFrameStack = new GifFrameStack()

/**
 * Parse GIF and extract frames.
 *
 * Rewritten for three reasons: the old sub-block loops were unbounded, so a
 * truncated file spun forever and hung the tab; disposal method 3 was a no-op, so
 * GIFs authored with restore-to-previous decoded with permanent ghost trails; and
 * the LZW decoder rebuilt JavaScript arrays per code, which measured ~11x slower
 * than the standard prefix/suffix form on a real frame.
 */
export async function loadGifFrames(file, options = {}) {
    const { onProgress = () => {}, signal = null } = options
    const buffer = await file.arrayBuffer()

    gifFrameStack.clear()
    // Decoding a large GIF is seconds of work. Frames are appended as they are
    // produced and the parser yields between them, so the tab stays responsive and
    // progress is real rather than a spinner.
    const parsed = await parseGif(buffer, {
        signal,
        onFrame: (frame, index, estimatedTotal) => {
            gifFrameStack.addFrame(frame.imageData, frame.delay)
            onProgress(estimatedTotal ? Math.min(99, Math.round((index + 1) / estimatedTotal * 100)) : 0, index + 1)
        }
    })
    gifFrameStack.loopCount = parsed.loopCount
    onProgress(100, gifFrameStack.length)
    return gifFrameStack
}

/**
 * Bounds-checked cursor over the byte stream. Every read goes through this, so a
 * truncated or malformed file raises instead of looping forever.
 */
class ByteReader {
    constructor(bytes) {
        this.bytes = bytes
        this.offset = 0
    }
    get remaining() { return this.bytes.length - this.offset }
    byte() {
        if (this.offset >= this.bytes.length) throw new Error('Unexpected end of GIF data')
        return this.bytes[this.offset++]
    }
    short() { return this.byte() | (this.byte() << 8) }
    skip(count) {
        if (this.offset + count > this.bytes.length) throw new Error('Unexpected end of GIF data')
        this.offset += count
    }
    slice(count) {
        if (this.offset + count > this.bytes.length) throw new Error('Unexpected end of GIF data')
        const view = this.bytes.subarray(this.offset, this.offset + count)
        this.offset += count
        return view
    }
    /** Concatenate a chain of length-prefixed sub-blocks up to the 0 terminator. */
    subBlocks() {
        const chunks = []
        let total = 0
        for (;;) {
            const size = this.byte()
            if (size === 0) break
            const chunk = this.slice(size)
            chunks.push(chunk)
            total += size
        }
        const out = new Uint8Array(total)
        let at = 0
        for (const chunk of chunks) { out.set(chunk, at); at += chunk.length }
        return out
    }
    skipSubBlocks() {
        for (;;) {
            const size = this.byte()
            if (size === 0) break
            this.skip(size)
        }
    }
}

async function parseGif(arrayBuffer, { onFrame = null, signal = null } = {}) {
    const bytes = new Uint8Array(arrayBuffer)
    const reader = new ByteReader(bytes)
    const frames = []

    const header = String.fromCharCode(...bytes.subarray(0, 6))
    if (header !== 'GIF87a' && header !== 'GIF89a') throw new Error('Not a GIF file')
    reader.skip(6)

    const width = reader.short()
    const height = reader.short()
    if (!width || !height) throw new Error('GIF reports a zero-sized canvas')
    const packed = reader.byte()
    reader.skip(2) // background colour index, pixel aspect ratio

    const hasGlobalTable = (packed & 0x80) !== 0
    const globalTable = hasGlobalTable ? readColorTable(reader, 1 << ((packed & 0x07) + 1)) : null

    // Composite frames onto a persistent canvas; readbacks are frequent, so keep
    // it in software memory rather than round-tripping the GPU per frame.
    const master = document.createElement('canvas')
    master.width = width
    master.height = height
    const masterCtx = master.getContext('2d', { willReadFrequently: true })

    let control = null
    let loopCount = 0        // 0 = loop forever, the GIF default
    let sawTrailer = false

    while (reader.remaining > 0) {
        const block = reader.byte()

        if (block === 0x3B) { sawTrailer = true; break }

        if (block === 0x21) {
            const label = reader.byte()
            if (label === 0xF9) {
                const size = reader.byte()             // always 4
                const flags = reader.byte()
                const rawDelay = reader.short()
                const transparentIndex = reader.byte()
                reader.skip(Math.max(0, size - 4))
                reader.byte()                          // block terminator
                control = {
                    disposal: (flags >> 2) & 0x07,
                    hasTransparency: (flags & 0x01) !== 0,
                    transparentIndex,
                    // Browsers treat a raw delay of 0 or 1 as 100ms. The old code
                    // floored at 20ms, so those GIFs played (and re-exported) 5x fast.
                    delay: (rawDelay <= 1 ? 10 : rawDelay) * 10,
                    rawDelay
                }
            } else if (label === 0xFF) {
                // Application extension: recover the NETSCAPE loop count, which was
                // previously discarded so every GIF re-exported as infinite.
                const size = reader.byte()
                const identifier = reader.slice(size)
                const name = String.fromCharCode(...identifier.subarray(0, 11))
                const payload = reader.subBlocks()
                if (name === 'NETSCAPE2.0' && payload.length >= 3 && payload[0] === 1) {
                    loopCount = payload[1] | (payload[2] << 8)
                }
            } else {
                reader.skipSubBlocks()
            }
            continue
        }

        if (block !== 0x2C) {
            // Unknown block: the stream is not something we can keep parsing.
            break
        }

        const left = reader.short()
        const top = reader.short()
        const frameWidth = reader.short()
        const frameHeight = reader.short()
        const imagePacked = reader.byte()

        if (!frameWidth || !frameHeight) throw new Error('GIF frame has zero size')
        if (left + frameWidth > width || top + frameHeight > height) {
            // Tolerate: some encoders overshoot by a pixel. Clip rather than fail.
        }

        const interlaced = (imagePacked & 0x40) !== 0
        const hasLocalTable = (imagePacked & 0x80) !== 0
        const colorTable = hasLocalTable
            ? readColorTable(reader, 1 << ((imagePacked & 0x07) + 1))
            : globalTable
        if (!colorTable) throw new Error('GIF frame has no colour table')

        const minCodeSize = reader.byte()
        if (minCodeSize < 2 || minCodeSize > 11) throw new Error('Invalid LZW code size')
        const lzwData = reader.subBlocks()

        const pixelCount = frameWidth * frameHeight
        let indices = decodeLZW(lzwData, minCodeSize, pixelCount)
        if (interlaced) indices = deinterlaceIndices(indices, frameWidth, frameHeight)

        // Disposal 3 restores what was on the canvas before this frame was drawn.
        const previous = control?.disposal === 3
            ? masterCtx.getImageData(0, 0, width, height)
            : null

        const patch = new ImageData(frameWidth, frameHeight)
        const patchData = patch.data
        const transparentIndex = control?.hasTransparency ? control.transparentIndex : -1
        for (let i = 0; i < pixelCount; i++) {
            const index = indices[i]
            const out = i << 2
            if (index === transparentIndex) continue    // leave fully transparent
            const colour = colorTable[index] || BLACK
            patchData[out] = colour[0]
            patchData[out + 1] = colour[1]
            patchData[out + 2] = colour[2]
            patchData[out + 3] = 255
        }

        // putImageData ignores compositing, so go through a scratch canvas to let
        // transparent pixels of this frame reveal what is underneath.
        const scratch = getScratchCanvas(frameWidth, frameHeight)
        scratch.ctx.putImageData(patch, 0, 0)
        masterCtx.drawImage(scratch.canvas, left, top)

        const decodedFrame = {
            imageData: masterCtx.getImageData(0, 0, width, height),
            delay: control?.delay ?? 100,
            rawDelay: control?.rawDelay ?? 0
        }
        frames.push(decodedFrame)
        if (onFrame) {
            // Rough total from bytes consumed so far, good enough for a progress bar.
            const estimate = reader.offset > 0
                ? Math.max(frames.length, Math.round(frames.length * bytes.length / reader.offset))
                : 0
            onFrame(decodedFrame, frames.length - 1, estimate)
        }
        // Yield so decoding a 60-frame GIF does not freeze the tab for seconds.
        if ((frames.length & 3) === 0) {
            if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError')
            await new Promise(resolve => setTimeout(resolve, 0))
        }

        const disposal = control?.disposal ?? 0
        if (disposal === 2) {
            masterCtx.clearRect(left, top, frameWidth, frameHeight)
        } else if (disposal === 3 && previous) {
            masterCtx.putImageData(previous, 0, 0)
        }

        control = null
    }

    if (!frames.length) throw new Error('No frames found in GIF')
    if (!sawTrailer && frames.length) {
        console.warn('GIF stream ended without a trailer; decoded what was readable.')
    }
    return { frames, width, height, loopCount }
}

const BLACK = [0, 0, 0]

function readColorTable(reader, entries) {
    const raw = reader.slice(entries * 3)
    const table = new Array(entries)
    for (let i = 0; i < entries; i++) {
        const at = i * 3
        table[i] = [raw[at], raw[at + 1], raw[at + 2]]
    }
    return table
}

let scratchCanvas = null
let scratchCtx = null
function getScratchCanvas(width, height) {
    if (!scratchCanvas) {
        scratchCanvas = document.createElement('canvas')
        scratchCtx = scratchCanvas.getContext('2d', { willReadFrequently: true })
    }
    if (scratchCanvas.width !== width || scratchCanvas.height !== height) {
        scratchCanvas.width = width
        scratchCanvas.height = height
    } else {
        scratchCtx.clearRect(0, 0, width, height)
    }
    return { canvas: scratchCanvas, ctx: scratchCtx }
}

/**
 * LZW decode into a palette-index array.
 *
 * Standard prefix/suffix table walked with an explicit stack. The previous
 * implementation stored each dictionary entry as a JavaScript array and rebuilt it
 * with spread on every new code, which allocated on every symbol.
 */
function decodeLZW(data, minCodeSize, pixelCount) {
    const clearCode = 1 << minCodeSize
    const endCode = clearCode + 1
    const output = new Uint8Array(pixelCount)

    const prefix = new Int32Array(4096)
    const suffix = new Uint8Array(4096)
    const stack = new Uint8Array(4096)

    for (let i = 0; i < clearCode; i++) suffix[i] = i

    let codeSize = minCodeSize + 1
    let codeMask = (1 << codeSize) - 1
    let available = clearCode + 2
    let previousCode = -1
    let stackTop = 0
    // First character of the previously emitted string. The KwKwK case needs the
    // FIRST character of the previous entry, not its last.
    let firstChar = 0

    let bitBuffer = 0
    let bitCount = 0
    let at = 0
    let written = 0

    while (written < pixelCount) {
        if (stackTop === 0) {
            while (bitCount < codeSize) {
                if (at >= data.length) { // truncated stream: stop cleanly
                    return output
                }
                bitBuffer |= data[at++] << bitCount
                bitCount += 8
            }
            const code = bitBuffer & codeMask
            bitBuffer >>= codeSize
            bitCount -= codeSize

            if (code === clearCode) {
                codeSize = minCodeSize + 1
                codeMask = (1 << codeSize) - 1
                available = clearCode + 2
                previousCode = -1
                continue
            }
            if (code === endCode) break

            if (previousCode === -1) {
                if (code >= available) break
                firstChar = suffix[code]
                stack[stackTop++] = firstChar
                previousCode = code
                continue
            }

            let current = code
            if (code >= available) {
                // KwKwK: this code is the entry being defined by this very step, so
                // its expansion is the previous string followed by that string's
                // FIRST character.
                stack[stackTop++] = firstChar
                current = previousCode
            }
            while (current >= clearCode) {
                stack[stackTop++] = suffix[current]
                current = prefix[current]
                if (stackTop >= stack.length) return output // corrupt chain guard
            }
            firstChar = suffix[current]
            stack[stackTop++] = firstChar

            if (available < 4096) {
                prefix[available] = previousCode
                suffix[available] = firstChar
                available++
                if ((available & codeMask) === 0 && available < 4096) {
                    codeSize++
                    codeMask += available
                }
            }
            previousCode = code
        }

        output[written++] = stack[--stackTop]
    }

    return output
}

/** Reorder interlaced rows in index space, before colour expansion. */
function deinterlaceIndices(indices, width, height) {
    const out = new Uint8Array(indices.length)
    const passes = [[0, 8], [4, 8], [2, 4], [1, 2]]
    let sourceRow = 0
    for (const [start, step] of passes) {
        for (let y = start; y < height; y += step) {
            out.set(indices.subarray(sourceRow * width, (sourceRow + 1) * width), y * width)
            sourceRow++
        }
    }
    return out
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
function prepareImageDataForGif(source) {
    const imageData = new ImageData(
        new Uint8ClampedArray(source.data),
        source.width,
        source.height
    )
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
    
    return imageData
}

/** Context-based wrapper retained for the animation capture paths. */
function prepareFrameForGif(ctx, width, height) {
    const prepared = prepareImageDataForGif(ctx.getImageData(0, 0, width, height))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    canvas.getContext('2d').putImageData(prepared, 0, 0)
    return { canvas, hasTransparency: true }
}

/**
 * Export frame stack as GIF using gif.js
 */
export function exportFrameStackAsGif(frameStack = gifFrameStack, options = {}) {
    const {
        quality = 10,
        workers = Math.min(navigator.hardwareConcurrency || 4, 8),
        workerScript = WORKER_PATH,
        dither = false,
        repeat = frameStack.loopCount ?? 0,
        onProgress = () => {},
        signal = null
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
            workers,
            quality,
            dither,
            repeat,
            width: frameStack.width,
            height: frameStack.height,
            workerScript
        }

        if (hasAnyTransparency) {
            gifOptions.transparent = 0x000000
        }

        const gif = new GIF(gifOptions)

        for (const frame of frameStack.frames) {
            // gif.js indexes each frame's buffer by the encoder's declared width and
            // height, so a frame of any other size must be normalised first or it is
            // read out of bounds.
            const source = (frame.imageData.width === frameStack.width && frame.imageData.height === frameStack.height)
                ? frame.imageData
                : fitImageData(frame.imageData, frameStack.width, frameStack.height)
            const payload = hasAnyTransparency ? prepareImageDataForGif(source) : source
            gif.addFrame(payload, hasAnyTransparency
                ? { delay: frame.delay, copy: true, dispose: 2 }
                : { delay: frame.delay, copy: true })
        }

        gif.on('progress', (p) => onProgress(Math.round(p * 100)))
        gif.on('finished', (blob) => resolve(blob))
        // Without this a failing encode worker leaves the promise pending forever.
        gif.on('error', (error) => reject(error instanceof Error ? error : new Error(String(error))))

        if (signal) {
            if (signal.aborted) {
                reject(new DOMException('Export cancelled', 'AbortError'))
                return
            }
            signal.addEventListener('abort', () => {
                try { gif.abort() } catch { /* already finished */ }
                reject(new DOMException('Export cancelled', 'AbortError'))
            }, { once: true })
        }

        gif.render()
    })
}

/** Centre a frame's pixels inside a canvas of the stack's nominal size. */
function fitImageData(source, width, height) {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    const scratch = document.createElement('canvas')
    scratch.width = source.width
    scratch.height = source.height
    scratch.getContext('2d').putImageData(source, 0, 0)
    ctx.drawImage(scratch, Math.round((width - source.width) / 2), Math.round((height - source.height) / 2))
    return ctx.getImageData(0, 0, width, height)
}

/**
 * Apply the editor's current layer stack to a range of frames.
 *
 * Previously the only way to get an effect onto every frame was to load, render
 * and save each one by hand through the editor canvas - a full PNG round trip per
 * frame. This works directly on pixels: no DOM, no encode, no canvas resize.
 */
let bakeInFlight = false

export async function applyLayerStackToFrames(imageEditor, options = {}) {
    const {
        stack = gifFrameStack,
        indices = null,
        onProgress = () => {},
        signal = null
    } = options
    if (!imageEditor || stack.length === 0) return 0
    // The loop yields, so a second bake could interleave and double-apply effects.
    if (bakeInFlight) throw new Error('A bake is already running')
    bakeInFlight = true

    // Resolve targets to frame objects up front: indices shift if the timeline is
    // reordered while the loop is yielding.
    const targets = (indices ?? stack.frames.map((_, i) => i))
        .map(index => stack.frames[index])
        .filter(Boolean)
    const descriptors = imageEditor.layerManager.toDescriptors()
    if (!descriptors.length) return 0

    let scratch = null
    let done = 0

    try {
    for (const frame of targets) {
        if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError')
        const index = stack.frames.indexOf(frame)
        if (index === -1) continue   // deleted while we were yielding

        const source = frame.imageData
        const copy = new ImageData(
            new Uint8ClampedArray(source.data),
            source.width,
            source.height
        )
        if (!scratch || scratch.length !== copy.data.length) {
            scratch = new Uint8ClampedArray(copy.data.length)
        }
        compositeLayers(copy, descriptors, scratch)
        stack.setFrame(index, copy)

        done++
        onProgress(Math.round((done / targets.length) * 100))
        // Yield periodically so progress paints and the UI stays responsive.
        if (done % 4 === 0) await new Promise(resolve => setTimeout(resolve, 0))
    }
    return done
    } finally {
        bakeInFlight = false
    }
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
        quality = 10,
        dither = false,
        repeat = 0,
        signal = null
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
    renderFrameSync(imageEditor)
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
        workers: Math.min(navigator.hardwareConcurrency || 4, 8),
        quality,
        dither,
        repeat,
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
        renderFrameSync(imageEditor)
        
        // Yield regularly so progress paints, input is processed, and a cancel
        // request is seen - not only on very large exports.
        if ((i & 7) === 0) {
            if (signal?.aborted) throw new DOMException('Export cancelled', 'AbortError')
            await new Promise(resolve => setTimeout(resolve, 0))
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
    renderFrameSync(imageEditor)

    // Clean up temp canvas
    tempCanvas.remove()

    // Render GIF
    return new Promise((resolve, reject) => {
        gif.on('progress', (p) => onProgress(50 + Math.round(p * 50))) // 50-100% for render
        gif.on('finished', (blob) => resolve(blob))
        gif.on('error', (err) => reject(err instanceof Error ? err : new Error(String(err))))
        if (signal) {
            signal.addEventListener('abort', () => {
                try { gif.abort() } catch { /* already done */ }
                reject(new DOMException('Export cancelled', 'AbortError'))
            }, { once: true })
        }
        gif.render()
    })
}

/**
 * Renders a frame synchronously with proper wait for completion
 */
/**
 * Composite one frame at full quality and return its pixels.
 *
 * Synchronous by design. The previous version waited two animation frames per
 * capture "to ensure paint is complete", which cost >= 33ms of pure waiting per
 * frame (3.3s across a 100-frame export) even though nothing reads the painted
 * canvas - the pixels come from the compositor directly.
 */
function renderFrameSync(imageEditor) {
    const imageData = imageEditor.renderToImageData()
    imageEditor.context.putImageData(imageData, 0, 0)
    return imageData
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
    renderFrameSync(imageEditor)
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

        renderFrameSync(imageEditor)

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
    renderFrameSync(imageEditor)

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

    // Direct pixel handoff. The old path went imageData -> canvas -> toDataURL ->
    // Image -> onload, which cost a full PNG encode and decode per frame.
    const { width, height } = frame.imageData
    const source = document.createElement('canvas')
    source.width = width
    source.height = height
    source.getContext('2d').putImageData(frame.imageData, 0, 0)

    imageEditor.image = source
    imageEditor.canvas.width = width
    imageEditor.canvas.height = height
    imageEditor.invalidateBaseImageCache()
    imageEditor.requestRender(true)

    gifFrameStack.currentFrameIndex = frameIndex
    // Only an explicit load makes the editor's base image this frame, so only now
    // is it safe to write the editor's output back to it.
    gifFrameStack.editingFrameIndex = frameIndex
    return true
}

/**
 * Save current editor state back to frame stack
 */
/**
 * Write the editor's composited output back into a frame.
 *
 * Refuses unless that frame was explicitly loaded for editing. Merely previewing a
 * frame (scrubbing, playback) paints the canvas without changing the editor's base
 * image, so writing back would replace the previewed frame with a render of
 * whichever frame is actually loaded - silent, unrecoverable pixel loss.
 */
export function saveEditorToFrame(imageEditor, frameIndex) {
    if (!imageEditor || frameIndex < 0 || frameIndex >= gifFrameStack.length) return false
    if (gifFrameStack.editingFrameIndex !== frameIndex) return false

    // Composite fresh at full resolution rather than scraping the visible canvas,
    // which may still be showing the quarter-scale preview mid-drag.
    const imageData = typeof imageEditor.renderToImageData === 'function'
        ? imageEditor.renderToImageData()
        : imageEditor.context.getImageData(0, 0, imageEditor.canvas.width, imageEditor.canvas.height)

    gifFrameStack.setFrame(frameIndex, imageData)
    return true
}

/**
 * GIF Playback Controller
 * Plays/stops GIF animation on the main canvas
 */
let gifPlaybackHandle = null
let gifPlaybackRunning = false

export function isGifPlaying() {
    return gifPlaybackRunning
}

export function startGifPlayback(imageEditor, onFrameChange) {
    if (gifFrameStack.length === 0) return false
    if (gifPlaybackRunning) return true
    if (!imageEditor?.context) return false

    gifPlaybackRunning = true
    let index = gifFrameStack.currentFrameIndex

    // Playback used to PNG-encode each frame with canvas.toDataURL, decode it back
    // through an Image, reassign imageEditor.image, invalidate the base cache and
    // re-composite the whole layer stack - about 84ms per displayed frame. Frames
    // are now blitted straight onto the visible canvas.
    const canvas = imageEditor.canvas
    const context = imageEditor.context

    const drawFrame = (i) => {
        const frame = gifFrameStack.getFrame(i)
        if (!frame) return false
        const { width, height } = frame.imageData
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width
            canvas.height = height
        }
        context.putImageData(frame.imageData, 0, 0)
        gifFrameStack.currentFrameIndex = i
        gifFrameStack.editingFrameIndex = null   // previewing, not editing
        if (onFrameChange) onFrameChange(i)
        return true
    }

    if (!drawFrame(index)) { gifPlaybackRunning = false; return false }

    // A single rAF clock accumulating real elapsed time, rather than chained
    // setTimeouts, so timing does not drift and the loop pauses with the tab.
    let last = performance.now()
    let accumulated = 0

    const tick = (now) => {
        if (!gifPlaybackRunning) return
        accumulated += now - last
        last = now

        const frame = gifFrameStack.getFrame(index)
        const delay = Math.max(20, frame?.delay || 100)
        if (accumulated >= delay) {
            // Skip whole frames rather than falling behind on a slow tab.
            while (accumulated >= delay && gifFrameStack.length > 0) {
                accumulated -= delay
                index = (index + 1) % gifFrameStack.length
            }
            if (!drawFrame(index)) { stopGifPlayback(); return }
        }
        gifPlaybackHandle = requestAnimationFrame(tick)
    }

    gifPlaybackHandle = requestAnimationFrame(tick)
    return true
}

export function stopGifPlayback() {
    gifPlaybackRunning = false
    if (gifPlaybackHandle) {
        cancelAnimationFrame(gifPlaybackHandle)
        gifPlaybackHandle = null
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
