/**
 * Off-main-thread layer compositing.
 *
 * The worker holds its own copy of the base image so a render only has to send
 * the layer descriptors, not the pixels. Results come back as transferable
 * buffers, so neither direction copies a full frame.
 *
 * Protocol
 *   -> { type: 'setBase', generation, width, height, buffer }   (buffer transferred in)
 *   -> { type: 'render',  jobId, generation, layers }
 *   -> { type: 'release' }
 *   <- { type: 'rendered', jobId, generation, width, height, buffer }  (buffer transferred out)
 *   <- { type: 'stale',    jobId, generation }      base changed under us; caller should resend
 *   <- { type: 'error',    jobId, message }
 */
import { compositeLayers } from '../core/composite.js'

let base = null          // { generation, width, height, data: Uint8ClampedArray }
let scratch = null       // reused per-layer working buffer
let output = null        // reused result buffer, handed away on each post

self.addEventListener('message', (event) => {
    const message = event.data
    if (!message) return

    if (message.type === 'setBase') {
        base = {
            generation: message.generation,
            width: message.width,
            height: message.height,
            data: new Uint8ClampedArray(message.buffer)
        }
        // Buffers sized for the previous image are useless now.
        scratch = null
        output = null
        return
    }

    if (message.type === 'release') {
        base = null
        scratch = null
        output = null
        return
    }

    if (message.type !== 'render') return

    const { jobId, generation, layers } = message

    if (!base) {
        self.postMessage({ type: 'stale', jobId, generation })
        return
    }

    // The main thread may have moved on to a new base while this job was queued.
    if (generation !== base.generation) {
        self.postMessage({ type: 'stale', jobId, generation: base.generation })
        return
    }

    try {
        const { width, height, data } = base
        const byteLength = data.length

        // `output` is transferred away after every post, which detaches its buffer,
        // so re-allocate whenever the previous one is gone or the wrong size.
        if (!output || output.length !== byteLength || output.buffer.byteLength === 0) {
            output = new Uint8ClampedArray(byteLength)
        }
        output.set(data)

        if (!scratch || scratch.length !== byteLength) {
            scratch = new Uint8ClampedArray(byteLength)
        }

        compositeLayers({ data: output, width, height }, layers, scratch)

        const buffer = output.buffer
        output = null // ownership moves to the main thread

        self.postMessage(
            { type: 'rendered', jobId, generation, width, height, buffer },
            [buffer]
        )
    } catch (error) {
        self.postMessage({ type: 'error', jobId, message: error?.message || String(error) })
    }
})
