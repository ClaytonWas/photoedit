/**
 * Interactive crop tool.
 *
 * Replaces the old rubber band, which drew into a canvas sized to the full image
 * (96MB of backing store on a 24MP photo, cleared on every mousemove), lived
 * inside the transformed `#imageCanvasDiv`, bound mouse events only, and threw
 * the rectangle away on mouseup leaving four disconnected number inputs behind.
 *
 * Design notes:
 * - The overlay is a viewport-sized canvas parented to `.imageViewingModule`,
 *   which carries no transform. Geometry is computed by projecting image
 *   coordinates through the viewport, so zooming and panning mid-crop just work
 *   and the buffer stays ~1 screen, not ~1 image.
 * - Pointer Events with setPointerCapture. Mouse, pen and touch share one path,
 *   and releasing outside the canvas still ends the drag - the old mouse-only
 *   listeners left the tool permanently armed in that case.
 * - The selection is real state that survives the drag, so it can be nudged,
 *   resized by its handles, constrained to an aspect ratio, and committed with
 *   the keyboard.
 */

const HANDLE_HIT = 11        // px, generous for touch
const HANDLE_DRAW = 4        // px, half-size of the drawn square
const EDGE_HIT = 7
const DRAG_THRESHOLD = 3

export const CROP_ASPECT_PRESETS = [
    { id: 'free', label: 'Free', ratio: null },
    { id: 'original', label: 'Original', ratio: 'original' },
    { id: 'square', label: '1:1', ratio: 1 },
    { id: '4:3', label: '4:3', ratio: 4 / 3 },
    { id: '3:2', label: '3:2', ratio: 3 / 2 },
    { id: '16:9', label: '16:9', ratio: 16 / 9 },
    { id: '3:4', label: '3:4', ratio: 3 / 4 },
    { id: '2:3', label: '2:3', ratio: 2 / 3 },
    { id: '9:16', label: '9:16', ratio: 9 / 16 }
]

const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

function isTextEntry(element) {
    if (!element) return false
    const tag = element.tagName
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || element.isContentEditable
}

export class CropTool {
    /**
     * @param {object} options
     * @param {HTMLElement} options.host       untransformed positioned ancestor (.imageViewingModule)
     * @param {CanvasViewport} options.viewport
     * @param {() => object|null} options.getEditor  resolves the live ImageEditor
     * @param {(rect) => void} [options.onChange]    fires whenever the rect changes
     * @param {(rect) => void} [options.onCommit]
     * @param {() => void} [options.onCancel]
     */
    constructor({ host, viewport, getEditor, onChange, onCommit, onCancel }) {
        this.host = host
        this.viewport = viewport
        this.getEditor = getEditor
        this.onChange = onChange || (() => {})
        this.onCommit = onCommit || (() => {})
        this.onCancel = onCancel || (() => {})

        this.active = false
        this.rect = null            // {x, y, width, height} in image pixels
        this.rectBeforeDrag = null
        this.aspect = null          // number | null
        this.overlay = null
        this.context = null
        this.drag = null            // {mode, pointerId, startImage, startRect}
        this.hover = null
        this.frameHandle = null
        this.detachViewport = null
        this.onKeyDown = this.handleKeyDown.bind(this)
        this.onPointerDown = this.handlePointerDown.bind(this)
        this.onPointerMove = this.handlePointerMove.bind(this)
        this.onPointerUp = this.handlePointerUp.bind(this)
    }

    // ---------------------------------------------------------------- lifecycle

    activate(options = {}) {
        if (this.active) {
            if (options.rect) this.setRect(options.rect)
            return
        }
        const editor = this.getEditor()
        if (!editor) return

        this.active = true
        this.ensureOverlay()

        // Start with no selection so the first drag draws one. Pre-selecting the
        // whole image would classify every drag as "move", and a rect that already
        // fills the image cannot move - so dragging would appear to do nothing.
        this.rect = options.rect ? this.clampRect(options.rect) : null

        this.detachViewport = this.viewport.onChange(() => this.scheduleDraw())
        window.addEventListener('keydown', this.onKeyDown, true)
        this.overlay.addEventListener('pointerdown', this.onPointerDown)
        this.overlay.addEventListener('pointermove', this.onPointerMove)
        this.overlay.addEventListener('pointerup', this.onPointerUp)
        this.overlay.addEventListener('pointercancel', this.onPointerUp)

        this.host.classList.add('cropping')
        this.scheduleDraw()
        this.onChange(this.getRect())
    }

    deactivate() {
        if (!this.active) return
        this.active = false
        this.drag = null
        this.hover = null

        window.removeEventListener('keydown', this.onKeyDown, true)
        if (this.detachViewport) { this.detachViewport(); this.detachViewport = null }
        if (this.frameHandle) { cancelAnimationFrame(this.frameHandle); this.frameHandle = null }
        if (this.overlay) {
            this.overlay.removeEventListener('pointerdown', this.onPointerDown)
            this.overlay.removeEventListener('pointermove', this.onPointerMove)
            this.overlay.removeEventListener('pointerup', this.onPointerUp)
            this.overlay.removeEventListener('pointercancel', this.onPointerUp)
            this.overlay.remove()
            this.overlay = null
            this.context = null
        }
        this.host.classList.remove('cropping')
    }

    ensureOverlay() {
        if (this.overlay) return
        const overlay = document.createElement('canvas')
        overlay.className = 'cropOverlay'
        // touch-action must be none or the browser claims the drag for scrolling.
        overlay.style.touchAction = 'none'
        this.host.appendChild(overlay)
        this.overlay = overlay
        this.context = overlay.getContext('2d')
    }

    // -------------------------------------------------------------------- state

    getRect() {
        return this.rect ? { ...this.rect } : null
    }

    setRect(rect, { silent = false } = {}) {
        if (!rect) return
        this.rect = this.clampRect(rect)
        this.scheduleDraw()
        if (!silent) this.onChange(this.getRect())
    }

    setAspect(ratio) {
        const editor = this.getEditor()
        if (ratio === 'original' && editor) {
            this.aspect = editor.canvas.width / editor.canvas.height
        } else {
            this.aspect = typeof ratio === 'number' && ratio > 0 ? ratio : null
        }
        if (this.aspect && this.rect) {
            this.setRect(this.applyAspect(this.rect, 'se'))
        }
    }

    imageBounds() {
        const editor = this.getEditor()
        if (!editor) return { width: 0, height: 0 }
        return { width: editor.canvas.width, height: editor.canvas.height }
    }

    clampRect(rect) {
        const { width: iw, height: ih } = this.imageBounds()
        let x = Math.round(rect.x)
        let y = Math.round(rect.y)
        let w = Math.round(rect.width)
        let h = Math.round(rect.height)

        // Normalise a negative-extent rect rather than rejecting it.
        if (w < 0) { x += w; w = -w }
        if (h < 0) { y += h; h = -h }

        w = Math.max(1, Math.min(w, iw))
        h = Math.max(1, Math.min(h, ih))
        x = Math.max(0, Math.min(x, iw - w))
        y = Math.max(0, Math.min(y, ih - h))
        return { x, y, width: w, height: h }
    }

    /** Reshape `rect` to the locked aspect, holding the corner opposite `anchor`. */
    applyAspect(rect, anchor) {
        if (!this.aspect) return rect
        const { width: iw, height: ih } = this.imageBounds()
        let { x, y, width, height } = rect

        // Drive from whichever dimension the gesture changed most.
        const wantWidthDriven = anchor.includes('e') || anchor.includes('w') || width / this.aspect > height
        if (wantWidthDriven) height = width / this.aspect
        else width = height * this.aspect

        if (width > iw) { width = iw; height = width / this.aspect }
        if (height > ih) { height = ih; width = height * this.aspect }

        if (anchor.includes('w')) x = rect.x + rect.width - width
        if (anchor.includes('n')) y = rect.y + rect.height - height
        if (anchor === 'move') { x = rect.x; y = rect.y }

        x = Math.max(0, Math.min(x, iw - width))
        y = Math.max(0, Math.min(y, ih - height))
        return { x, y, width, height }
    }

    // ----------------------------------------------------------------- pointers

    handlePointerDown(event) {
        if (event.button !== undefined && event.button !== 0) return  // ignore right/middle
        const image = this.viewport.clientToImage(event.clientX, event.clientY)
        if (!image) return

        // Shift forces a fresh selection, so a rect that covers the whole image is
        // not a dead end - without it every drag inside it would only ever "move".
        const mode = event.shiftKey ? 'new' : this.hitTest(event.clientX, event.clientY)

        this.overlay.setPointerCapture(event.pointerId)
        this.rectBeforeDrag = this.getRect()
        this.drag = {
            mode,
            pointerId: event.pointerId,
            startImage: image,
            startRect: this.getRect(),
            moved: false,
            startClient: { x: event.clientX, y: event.clientY }
        }
        event.preventDefault()
        event.stopPropagation()
    }

    handlePointerMove(event) {
        if (!this.drag || event.pointerId !== this.drag.pointerId) {
            this.updateHover(event.clientX, event.clientY)
            return
        }

        const dxClient = event.clientX - this.drag.startClient.x
        const dyClient = event.clientY - this.drag.startClient.y
        if (!this.drag.moved && Math.hypot(dxClient, dyClient) < DRAG_THRESHOLD) return
        this.drag.moved = true

        const image = this.viewport.clientToImage(event.clientX, event.clientY)
        if (!image) return

        const { mode, startImage, startRect } = this.drag
        const dx = image.x - startImage.x
        const dy = image.y - startImage.y

        if (mode === 'new') {
            let rect = {
                x: Math.min(startImage.x, image.x),
                y: Math.min(startImage.y, image.y),
                width: Math.abs(image.x - startImage.x),
                height: Math.abs(image.y - startImage.y)
            }
            if (this.aspect) {
                const anchor = (image.x < startImage.x ? 'w' : 'e') + ''
                rect = this.applyAspect({ ...rect }, image.y < startImage.y ? 'n' + anchor : 's' + anchor)
            }
            this.setRect(rect)
        } else if (mode === 'move') {
            this.setRect({ ...startRect, x: startRect.x + dx, y: startRect.y + dy })
        } else {
            this.setRect(this.resizeBy(startRect, mode, dx, dy))
        }
        event.preventDefault()
    }

    handlePointerUp(event) {
        if (!this.drag || event.pointerId !== this.drag.pointerId) return
        const wasNew = this.drag.mode === 'new'
        const moved = this.drag.moved
        try { this.overlay.releasePointerCapture(event.pointerId) } catch { /* already released */ }
        this.drag = null

        // A click with no drag must not collapse the selection to nothing.
        if (!moved) {
            if (wasNew && this.rectBeforeDrag) this.setRect(this.rectBeforeDrag)
            this.scheduleDraw()
            return
        }
        // Handles are suppressed mid-drag, so the tool has to repaint once the
        // gesture ends or they never appear.
        this.scheduleDraw()
        this.onChange(this.getRect())
    }

    resizeBy(startRect, mode, dx, dy) {
        let { x, y, width, height } = startRect
        if (mode.includes('e')) width += dx
        if (mode.includes('s')) height += dy
        if (mode.includes('w')) { x += dx; width -= dx }
        if (mode.includes('n')) { y += dy; height -= dy }

        // Flipping through an edge should mirror, not invert into negatives.
        if (width < 1) { x += width - 1; width = 1 }
        if (height < 1) { y += height - 1; height = 1 }

        const rect = { x, y, width, height }
        return this.aspect ? this.applyAspect(rect, mode) : rect
    }

    hitTest(clientX, clientY) {
        if (!this.rect) return 'new'
        const topLeft = this.viewport.imageToClient(this.rect.x, this.rect.y)
        const bottomRight = this.viewport.imageToClient(
            this.rect.x + this.rect.width,
            this.rect.y + this.rect.height
        )
        if (!topLeft || !bottomRight) return 'new'

        const left = topLeft.x, top = topLeft.y, right = bottomRight.x, bottom = bottomRight.y
        const nearLeft = Math.abs(clientX - left) <= HANDLE_HIT
        const nearRight = Math.abs(clientX - right) <= HANDLE_HIT
        const nearTop = Math.abs(clientY - top) <= HANDLE_HIT
        const nearBottom = Math.abs(clientY - bottom) <= HANDLE_HIT
        const withinX = clientX >= left - EDGE_HIT && clientX <= right + EDGE_HIT
        const withinY = clientY >= top - EDGE_HIT && clientY <= bottom + EDGE_HIT

        if (nearLeft && nearTop) return 'nw'
        if (nearRight && nearTop) return 'ne'
        if (nearLeft && nearBottom) return 'sw'
        if (nearRight && nearBottom) return 'se'
        if (nearTop && withinX) return 'n'
        if (nearBottom && withinX) return 's'
        if (nearLeft && withinY) return 'w'
        if (nearRight && withinY) return 'e'
        if (clientX > left && clientX < right && clientY > top && clientY < bottom) return 'move'
        return 'new'
    }

    updateHover(clientX, clientY) {
        const mode = this.hitTest(clientX, clientY)
        if (mode === this.hover) return
        this.hover = mode
        const cursors = {
            nw: 'nwse-resize', se: 'nwse-resize',
            ne: 'nesw-resize', sw: 'nesw-resize',
            n: 'ns-resize', s: 'ns-resize',
            e: 'ew-resize', w: 'ew-resize',
            move: 'move', new: 'crosshair'
        }
        if (this.overlay) this.overlay.style.cursor = cursors[mode] || 'crosshair'
    }

    // ----------------------------------------------------------------- keyboard

    handleKeyDown(event) {
        if (!this.active) return
        if (isTextEntry(document.activeElement)) return

        const step = event.shiftKey ? 10 : 1

        if (event.key === 'Enter') {
            event.preventDefault()
            event.stopPropagation()
            this.commit()
            return
        }
        if (event.key === 'Escape') {
            event.preventDefault()
            // Stop other Escape owners (menus, GIF dialogs) from also reacting.
            event.stopPropagation()
            this.cancel()
            return
        }

        const nudges = {
            ArrowLeft: [-step, 0], ArrowRight: [step, 0],
            ArrowUp: [0, -step], ArrowDown: [0, step]
        }
        const delta = nudges[event.key]
        if (!delta || !this.rect) return

        event.preventDefault()
        event.stopPropagation()
        const [dx, dy] = delta
        if (event.altKey) {
            // Alt resizes from the bottom-right instead of moving.
            this.setRect(this.resizeBy(this.rect, 'se', dx, dy))
        } else {
            this.setRect({ ...this.rect, x: this.rect.x + dx, y: this.rect.y + dy })
        }
    }

    commit() {
        const rect = this.getRect()
        if (!rect || rect.width < 1 || rect.height < 1) return
        this.onCommit(rect)
    }

    cancel() {
        this.deactivate()
        this.onCancel()
    }

    // ------------------------------------------------------------------ drawing

    scheduleDraw() {
        if (!this.active || this.frameHandle) return
        this.frameHandle = requestAnimationFrame(() => {
            this.frameHandle = null
            this.draw()
        })
    }

    draw() {
        if (!this.active || !this.overlay || !this.context) return
        const hostRect = this.viewport.getHostRect()
        if (!hostRect) return

        const dpr = window.devicePixelRatio || 1
        const width = Math.max(1, Math.round(hostRect.width))
        const height = Math.max(1, Math.round(hostRect.height))

        // Buffer follows the viewport, not the image, so this stays ~1 screen.
        if (this.overlay.width !== width * dpr || this.overlay.height !== height * dpr) {
            this.overlay.width = width * dpr
            this.overlay.height = height * dpr
        }
        this.overlay.style.width = `${width}px`
        this.overlay.style.height = `${height}px`

        const ctx = this.context
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        ctx.clearRect(0, 0, width, height)

        if (!this.rect) return
        const topLeft = this.viewport.imageToHost(this.rect.x, this.rect.y)
        const bottomRight = this.viewport.imageToHost(
            this.rect.x + this.rect.width,
            this.rect.y + this.rect.height
        )
        if (!topLeft || !bottomRight) return

        const x = topLeft.x
        const y = topLeft.y
        const w = bottomRight.x - topLeft.x
        const h = bottomRight.y - topLeft.y

        // Dim everything outside the selection.
        ctx.fillStyle = 'rgba(8, 10, 16, 0.55)'
        ctx.beginPath()
        ctx.rect(0, 0, width, height)
        ctx.rect(x, y, w, h)
        ctx.fill('evenodd')

        // Rule-of-thirds guides, only when there is room for them to read.
        if (w > 48 && h > 48) {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)'
            ctx.lineWidth = 1
            ctx.beginPath()
            for (let i = 1; i < 3; i++) {
                const gx = x + (w * i) / 3
                const gy = y + (h * i) / 3
                ctx.moveTo(gx, y); ctx.lineTo(gx, y + h)
                ctx.moveTo(x, gy); ctx.lineTo(x + w, gy)
            }
            ctx.stroke()
        }

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)'
        ctx.lineWidth = 1.5
        ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1)

        // Handles, hidden while dragging so they do not sit under the cursor.
        if (!this.drag || this.drag.mode === 'move') {
            ctx.fillStyle = '#ffffff'
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)'
            ctx.lineWidth = 1
            for (const handle of HANDLES) {
                const hx = handle.includes('w') ? x : handle.includes('e') ? x + w : x + w / 2
                const hy = handle.includes('n') ? y : handle.includes('s') ? y + h : y + h / 2
                ctx.fillRect(hx - HANDLE_DRAW, hy - HANDLE_DRAW, HANDLE_DRAW * 2, HANDLE_DRAW * 2)
                ctx.strokeRect(hx - HANDLE_DRAW, hy - HANDLE_DRAW, HANDLE_DRAW * 2, HANDLE_DRAW * 2)
            }
        }

        // Live dimension readout, flipped inside the rect when it would clip.
        const label = `${Math.round(this.rect.width)} × ${Math.round(this.rect.height)}`
        ctx.font = '600 12px "IBM Plex Mono", ui-monospace, monospace'
        const textWidth = ctx.measureText(label).width
        const boxW = textWidth + 14
        const boxH = 22
        let boxX = x
        let boxY = y - boxH - 6
        if (boxY < 2) boxY = y + 6
        if (boxX + boxW > width) boxX = width - boxW - 2
        if (boxX < 2) boxX = 2
        ctx.fillStyle = 'rgba(8, 10, 16, 0.85)'
        ctx.fillRect(boxX, boxY, boxW, boxH)
        ctx.fillStyle = '#ffffff'
        ctx.textBaseline = 'middle'
        ctx.fillText(label, boxX + 7, boxY + boxH / 2)
    }
}
