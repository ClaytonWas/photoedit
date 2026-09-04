/**
 * The canvas viewport: pan and zoom state, and the mapping between image pixels
 * and screen coordinates.
 *
 * This used to live in a closure inside canvasHandler, which meant anything else
 * that needed the zoom level had to regex it back out of the inline transform
 * string. Tools now read the mapping from here instead.
 *
 * The image<->client mapping is derived from the canvas's live bounding rect
 * rather than from scale/translate directly. getBoundingClientRect() already
 * accounts for the CSS transform, the flex centring, the padding and the
 * max-width/height fit, so the mapping stays correct without reimplementing any
 * of that layout maths.
 */

const CHANGE_EVENT = 'viewportchange'

export class CanvasViewport extends EventTarget {
    constructor() {
        super()
        this.host = null      // .imageViewingModule - untransformed, positioned
        this.content = null   // #imageCanvasDiv - carries the transform
        this.canvas = null    // #imageCanvas
        this.scale = 1
        this.translateX = 0
        this.translateY = 0
        this.minScale = 0.05
        this.maxScale = 40
        this.resizeObserver = null
    }

    attach({ host, content, canvas }) {
        this.host = host ?? null
        this.content = content ?? null
        this.canvas = canvas ?? null

        // transform-origin must be the top-left corner for the zoom-anchoring maths
        // below to hold. With the stylesheet's `center` origin, scaling also shifts
        // the element, and zoom drifts away from the pointer.
        if (this.content) this.content.style.transformOrigin = '0 0'

        if (this.resizeObserver) this.resizeObserver.disconnect()
        if (typeof ResizeObserver !== 'undefined' && this.host) {
            // A layout change moves the canvas without any transform change, so
            // overlays need to hear about it too.
            this.resizeObserver = new ResizeObserver(() => this.emitChange())
            this.resizeObserver.observe(this.host)
            if (this.canvas) this.resizeObserver.observe(this.canvas)
        }

        this.apply()
    }

    emitChange() {
        this.dispatchEvent(new CustomEvent(CHANGE_EVENT, {
            detail: { scale: this.scale, translateX: this.translateX, translateY: this.translateY }
        }))
    }

    apply() {
        if (this.content) {
            this.content.style.transform =
                `translate(${this.translateX}px, ${this.translateY}px) scale(${this.scale})`
        }
        this.emitChange()
    }

    setTransform(scale, translateX, translateY) {
        this.scale = Math.min(Math.max(scale, this.minScale), this.maxScale)
        this.translateX = translateX
        this.translateY = translateY
        this.apply()
    }

    panBy(dx, dy) {
        this.translateX += dx
        this.translateY += dy
        this.apply()
    }

    reset() {
        this.setTransform(1, 0, 0)
    }

    /**
     * Zoom by `factor`, keeping the image point currently under (clientX, clientY)
     * pinned to that same screen position.
     */
    zoomAt(clientX, clientY, factor) {
        if (!this.host) { this.scale *= factor; this.apply(); return }

        const hostRect = this.host.getBoundingClientRect()
        const px = clientX - hostRect.left
        const py = clientY - hostRect.top

        const next = Math.min(Math.max(this.scale * factor, this.minScale), this.maxScale)
        if (next === this.scale) return

        // With transform-origin at 0 0: screen = translate + scale * local.
        // Solve for the translate that keeps `local` under the same screen point.
        const localX = (px - this.translateX) / this.scale
        const localY = (py - this.translateY) / this.scale

        this.scale = next
        this.translateX = px - localX * next
        this.translateY = py - localY * next
        this.apply()
    }

    /** Live bounding rect of the canvas element, or null if not attached. */
    getCanvasRect() {
        if (!this.canvas) return null
        const rect = this.canvas.getBoundingClientRect()
        if (!rect.width || !rect.height) return null
        return rect
    }

    /** Bounding rect of the untransformed host, used to position overlays. */
    getHostRect() {
        return this.host ? this.host.getBoundingClientRect() : null
    }

    /** Screen point -> image pixel coordinates (may fall outside the image). */
    clientToImage(clientX, clientY) {
        const rect = this.getCanvasRect()
        if (!rect || !this.canvas) return null
        return {
            x: ((clientX - rect.left) / rect.width) * this.canvas.width,
            y: ((clientY - rect.top) / rect.height) * this.canvas.height
        }
    }

    /** Image pixel coordinates -> screen point. */
    imageToClient(x, y) {
        const rect = this.getCanvasRect()
        if (!rect || !this.canvas) return null
        return {
            x: rect.left + (x / this.canvas.width) * rect.width,
            y: rect.top + (y / this.canvas.height) * rect.height
        }
    }

    /** Image pixel coordinates -> coordinates local to the overlay host. */
    imageToHost(x, y) {
        const point = this.imageToClient(x, y)
        const hostRect = this.getHostRect()
        if (!point || !hostRect) return null
        return { x: point.x - hostRect.left, y: point.y - hostRect.top }
    }

    /** How many screen pixels one image pixel currently occupies. */
    get pixelRatio() {
        const rect = this.getCanvasRect()
        if (!rect || !this.canvas || !this.canvas.width) return 1
        return rect.width / this.canvas.width
    }

    onChange(handler) {
        this.addEventListener(CHANGE_EVENT, handler)
        return () => this.removeEventListener(CHANGE_EVENT, handler)
    }
}

export const viewport = new CanvasViewport()
