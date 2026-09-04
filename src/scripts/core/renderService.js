/**
 * Client for the render worker.
 *
 * Owns the worker, keeps its cached base image in sync, and coalesces render
 * requests: while one job is in flight only the most recent pending request is
 * kept, because intermediate frames from a slider drag are never displayed.
 *
 * If workers are unavailable (older browsers, blocked by CSP, construction
 * throws) `available` is false and callers fall back to compositing inline.
 */
import RenderWorker from '../workers/renderWorker.js?worker'
import { toTransferableDescriptors } from './composite.js'

export class RenderService {
    constructor() {
        this.worker = null
        this.available = false
        this.generation = 0
        this.baseSent = false
        this.pendingBase = null      // { width, height, data } awaiting transfer
        this.jobId = 0
        this.inFlight = null         // { jobId, resolve, reject }
        this.queued = null           // { descriptors, resolve, reject }
        this.disposed = false

        try {
            this.worker = new RenderWorker()
            this.worker.addEventListener('message', (event) => this.handleMessage(event.data))
            this.worker.addEventListener('error', (event) => this.handleFailure(event))
            this.available = true
        } catch (error) {
            console.warn('Render worker unavailable; compositing on the main thread.', error)
            this.worker = null
            this.available = false
        }
    }

    /**
     * Publish a new base image. The pixels are copied and handed to the worker
     * lazily, on the next render, so repeated invalidations cost nothing.
     */
    setBase(imageData) {
        if (!this.available || !imageData) return
        this.generation += 1
        this.baseSent = false
        this.pendingBase = {
            width: imageData.width,
            height: imageData.height,
            data: imageData.data
        }
    }

    flushBase() {
        if (this.baseSent || !this.pendingBase) return
        const { width, height, data } = this.pendingBase
        // Copy: the worker takes ownership of whatever buffer we transfer, and the
        // caller's ImageData must stay usable.
        const copy = new Uint8ClampedArray(data)
        this.worker.postMessage(
            { type: 'setBase', generation: this.generation, width, height, buffer: copy.buffer },
            [copy.buffer]
        )
        this.baseSent = true
    }

    /**
     * Composite `descriptors` over the current base. Resolves with an ImageData,
     * or null if the request was superseded, the service is unavailable, or the
     * worker failed (callers should then render inline).
     */
    render(descriptors) {
        if (!this.available || !this.pendingBase) return Promise.resolve(null)

        return new Promise((resolve, reject) => {
            if (this.inFlight) {
                // Drop any earlier queued frame - it would never have been shown.
                if (this.queued) this.queued.resolve(null)
                this.queued = { descriptors, resolve, reject }
                return
            }
            this.dispatch(descriptors, resolve, reject)
        })
    }

    dispatch(descriptors, resolve, reject) {
        this.flushBase()
        const jobId = ++this.jobId
        this.inFlight = { jobId, resolve, reject }
        this.worker.postMessage({
            type: 'render',
            jobId,
            generation: this.generation,
            layers: toTransferableDescriptors(descriptors)
        })
    }

    handleMessage(message) {
        if (!message) return
        const current = this.inFlight
        if (!current || message.jobId !== current.jobId) return
        this.inFlight = null

        if (message.type === 'rendered') {
            let result = null
            try {
                result = new ImageData(
                    new Uint8ClampedArray(message.buffer),
                    message.width,
                    message.height
                )
            } catch (error) {
                current.reject(error)
                this.drainQueue()
                return
            }
            current.resolve(result)
        } else if (message.type === 'stale') {
            // The worker's base no longer matches; resend and let the caller retry.
            this.baseSent = false
            current.resolve(null)
        } else if (message.type === 'error') {
            current.reject(new Error(message.message))
        } else {
            current.resolve(null)
        }

        this.drainQueue()
    }

    drainQueue() {
        if (!this.queued || this.disposed) return
        const { descriptors, resolve, reject } = this.queued
        this.queued = null
        this.dispatch(descriptors, resolve, reject)
    }

    handleFailure(event) {
        console.warn('Render worker failed; falling back to main-thread compositing.', event?.message || event)
        this.available = false
        if (this.inFlight) {
            this.inFlight.resolve(null)
            this.inFlight = null
        }
        if (this.queued) {
            this.queued.resolve(null)
            this.queued = null
        }
    }

    dispose() {
        this.disposed = true
        this.available = false
        if (this.queued) { this.queued.resolve(null); this.queued = null }
        if (this.inFlight) { this.inFlight.resolve(null); this.inFlight = null }
        if (this.worker) {
            try {
                this.worker.postMessage({ type: 'release' })
                this.worker.terminate()
            } catch { /* already gone */ }
            this.worker = null
        }
        this.pendingBase = null
    }
}
