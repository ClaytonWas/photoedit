/**
 * GIF Studio - one surface for loading, editing, animating and exporting GIFs.
 *
 * Replaces two separate modal dialogs that were built in taskbarHandler and each
 * injected their own <style> block: they collided on element ids (the frame
 * editor's delay label pointed at the animator's input), covered the Layers panel
 * they told you to go and use, and between them offered no timeline, no playback,
 * no reordering, no way to apply effects to more than one frame, no export
 * options, no preview of the result and no way to cancel an encode.
 *
 * This lives in a windowManager window rather than a modal, so it can sit beside
 * the canvas while you work.
 */
import { windowManager } from '../core/windowManager.js'
import {
    gifFrameStack,
    loadGifFrames,
    exportFrameStackAsGif,
    applyLayerStackToFrames,
    createMultiParameterAnimation,
    getAnimatableParameters,
    downloadBlob,
    formatFileSize,
    startGifPlayback,
    stopGifPlayback,
    isGifPlaying,
    availableEasings
} from '../plugins/gifAnimator.js'

let studioWindow = null
let root = null
let selection = new Set()
let activeTab = 'frames'
let encodeController = null
let resultBlob = null
let resultUrl = null
let animationTracks = []
let thumbCache = new Map()

const getEditor = () => window.getActiveEditor?.() ?? window.imageEditor ?? null

// ── thumbnails ────────────────────────────────────────────────────────────────

const THUMB_HEIGHT = 54

function thumbnailFor(frame) {
    const key = `${frame.id}:${frame.rev}`
    const cached = thumbCache.get(key)
    if (cached) return cached

    const { width, height } = frame.imageData
    const scale = Math.min(THUMB_HEIGHT / height, 1)
    const w = Math.max(1, Math.round(width * scale))
    const h = Math.max(1, Math.round(height * scale))

    const source = gifFrameStack.renderFrameToScratch(gifFrameStack.frames.indexOf(frame))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    ctx.imageSmoothingQuality = 'medium'
    if (source) ctx.drawImage(source, 0, 0, w, h)
    const url = canvas.toDataURL('image/jpeg', 0.72)

    // Bounded LRU: a long GIF should not pin every thumbnail forever.
    if (thumbCache.size > 400) {
        const oldest = thumbCache.keys().next().value
        thumbCache.delete(oldest)
    }
    thumbCache.set(key, url)
    return url
}

export function invalidateThumbnails() {
    thumbCache.clear()
}

// ── markup ────────────────────────────────────────────────────────────────────

function studioMarkup() {
    return `
    <div class="gs">
        <div class="gsTabs" role="tablist">
            <button class="gsTab" data-tab="frames" role="tab">Frames</button>
            <button class="gsTab" data-tab="animate" role="tab">Animate</button>
            <button class="gsTab" data-tab="export" role="tab">Export</button>
        </div>

        <div class="gsEmpty" data-role="empty">
            <p>No animation loaded.</p>
            <div class="gsEmptyActions">
                <button class="gsBtn gsPrimary" data-action="import-gif">Import GIF…</button>
                <button class="gsBtn" data-action="import-images">Import Images…</button>
            </div>
            <p class="gsHint">Or use <strong>Animate</strong> to build one from an effect layer.</p>
        </div>

        <div class="gsBody" data-role="body" hidden>
            <!-- Frames -->
            <section class="gsPanel" data-panel="frames">
                <div class="gsTransport">
                    <button class="gsIconBtn" data-action="first" title="First frame">⏮</button>
                    <button class="gsIconBtn" data-action="prev" title="Previous frame">◀</button>
                    <button class="gsIconBtn gsPlay" data-action="play" title="Play/pause">▶</button>
                    <button class="gsIconBtn" data-action="next" title="Next frame">▶︎</button>
                    <button class="gsIconBtn" data-action="last" title="Last frame">⏭</button>
                    <input type="range" class="gsScrub" data-role="scrub" min="0" max="0" value="0">
                    <span class="gsCounter" data-role="counter">0 / 0</span>
                </div>

                <div class="gsStrip" data-role="strip"></div>

                <div class="gsRow">
                    <label class="gsField">Delay (ms)
                        <input type="number" min="10" max="10000" step="10" data-role="delay">
                    </label>
                    <button class="gsBtn" data-action="apply-delay">Set selected</button>
                    <button class="gsBtn" data-action="apply-delay-all">Set all</button>
                </div>

                <div class="gsRow gsWrap">
                    <button class="gsBtn" data-action="select-all">Select all</button>
                    <button class="gsBtn" data-action="duplicate">Duplicate</button>
                    <button class="gsBtn" data-action="delete">Delete</button>
                    <button class="gsBtn" data-action="reverse">Reverse order</button>
                    <button class="gsBtn" data-action="move-left">◀ Move</button>
                    <button class="gsBtn" data-action="move-right">Move ▶</button>
                </div>

                <div class="gsRow gsBake">
                    <button class="gsBtn gsPrimary" data-action="bake-selected">Bake effects into selected</button>
                    <button class="gsBtn" data-action="bake-all">Bake into all</button>
                </div>
                <p class="gsHint" data-role="bake-hint"></p>

                <div class="gsRow">
                    <button class="gsBtn" data-action="load-frame">Edit frame on canvas</button>
                    <button class="gsBtn" data-action="import-more">Add images…</button>
                </div>
            </section>

            <!-- Animate -->
            <section class="gsPanel" data-panel="animate" hidden>
                <p class="gsHint">Animate one or more layer parameters into a new frame sequence.</p>
                <div class="gsTracks" data-role="tracks"></div>
                <button class="gsBtn" data-action="add-track">+ Add parameter track</button>
                <div class="gsRow">
                    <label class="gsField">Frames
                        <input type="number" data-role="anim-count" value="24" min="2" max="600">
                    </label>
                    <label class="gsField">Delay (ms)
                        <input type="number" data-role="anim-delay" value="80" min="10" max="5000">
                    </label>
                </div>
                <div class="gsRow">
                    <label class="gsField">Easing
                        <select data-role="anim-easing"></select>
                    </label>
                    <label class="gsCheck"><input type="checkbox" data-role="anim-pingpong"> Ping-pong</label>
                </div>
                <button class="gsBtn gsPrimary" data-action="build-animation">Build frames</button>
                <p class="gsHint" data-role="anim-status"></p>
            </section>

            <!-- Export -->
            <section class="gsPanel" data-panel="export" hidden>
                <div class="gsRow">
                    <label class="gsField">Quality
                        <select data-role="ex-quality">
                            <option value="1">Best (slow)</option>
                            <option value="5">High</option>
                            <option value="10" selected>Balanced</option>
                            <option value="20">Fast</option>
                        </select>
                    </label>
                    <label class="gsField">Dithering
                        <select data-role="ex-dither">
                            <option value="">Off</option>
                            <option value="FloydSteinberg">Floyd–Steinberg</option>
                            <option value="FloydSteinberg-serpentine">Floyd–Steinberg (serpentine)</option>
                            <option value="Atkinson">Atkinson</option>
                            <option value="Atkinson-serpentine">Atkinson (serpentine)</option>
                        </select>
                    </label>
                </div>
                <div class="gsRow">
                    <label class="gsField">Loop
                        <select data-role="ex-loop">
                            <option value="0" selected>Forever</option>
                            <option value="-1">Once</option>
                            <option value="1">2 times</option>
                            <option value="4">5 times</option>
                            <option value="9">10 times</option>
                        </select>
                    </label>
                    <label class="gsField">Filename
                        <input type="text" data-role="ex-name" value="animation">
                    </label>
                </div>
                <p class="gsHint" data-role="ex-summary"></p>

                <div class="gsRow">
                    <button class="gsBtn gsPrimary" data-action="encode">Encode GIF</button>
                    <button class="gsBtn gsDanger" data-action="cancel-encode" hidden>Cancel</button>
                </div>

                <div class="gsProgress" data-role="progress" hidden>
                    <div class="gsProgressBar"><div class="gsProgressFill" data-role="progress-fill"></div></div>
                    <span data-role="progress-text">0%</span>
                </div>

                <div class="gsResult" data-role="result" hidden>
                    <img data-role="result-img" alt="Encoded animation preview">
                    <div class="gsResultMeta" data-role="result-meta"></div>
                    <div class="gsRow">
                        <button class="gsBtn gsPrimary" data-action="download">Download</button>
                        <button class="gsBtn" data-action="discard">Discard</button>
                    </div>
                </div>
            </section>
        </div>

        <input type="file" data-role="file-gif" accept=".gif,image/gif" hidden>
        <input type="file" data-role="file-images" accept="image/*" multiple hidden>
    </div>`
}

// ── rendering ─────────────────────────────────────────────────────────────────

const $ = (role) => root?.querySelector(`[data-role="${role}"]`)

function refresh() {
    if (!root) return
    const count = gifFrameStack.length
    const hasFrames = count > 0

    $('empty').hidden = hasFrames
    $('body').hidden = !hasFrames

    root.querySelectorAll('.gsTab').forEach(tab => {
        tab.classList.toggle('gsTabActive', tab.dataset.tab === activeTab)
    })
    root.querySelectorAll('.gsPanel').forEach(panel => {
        panel.hidden = panel.dataset.panel !== activeTab
    })

    if (!hasFrames) { renderAnimateTab(); return }

    const index = gifFrameStack.currentFrameIndex
    $('counter').textContent = `${index + 1} / ${count}`
    const scrub = $('scrub')
    scrub.max = String(Math.max(0, count - 1))
    scrub.value = String(index)

    const current = gifFrameStack.currentFrame
    if (current && document.activeElement !== $('delay')) {
        $('delay').value = current.delay
    }

    renderStrip()
    renderBakeHint()
    renderAnimateTab()
    renderExportSummary()

    root.querySelector('.gsPlay').textContent = isGifPlaying() ? '❚❚' : '▶'
}

function renderStrip() {
    const strip = $('strip')
    const frames = gifFrameStack.frames
    strip.innerHTML = ''

    frames.forEach((frame, index) => {
        const cell = document.createElement('button')
        cell.className = 'gsCell'
        cell.dataset.index = String(index)
        cell.draggable = true
        if (index === gifFrameStack.currentFrameIndex) cell.classList.add('gsCellCurrent')
        if (selection.has(index)) cell.classList.add('gsCellSelected')

        const img = document.createElement('img')
        img.src = thumbnailFor(frame)
        img.alt = `Frame ${index + 1}`
        img.draggable = false
        cell.appendChild(img)

        const badge = document.createElement('span')
        badge.className = 'gsCellBadge'
        badge.textContent = `${index + 1}`
        cell.appendChild(badge)

        const delay = document.createElement('span')
        delay.className = 'gsCellDelay'
        delay.textContent = `${frame.delay}`
        cell.appendChild(delay)

        strip.appendChild(cell)
    })

    const active = strip.children[gifFrameStack.currentFrameIndex]
    active?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}

function renderBakeHint() {
    const editor = getEditor()
    const layers = editor?.layerManager?.layers.filter(l => l.effect && l.visible).length ?? 0
    const hint = $('bake-hint')
    hint.textContent = layers === 0
        ? 'No visible effect layers — add one from the Filter menu to bake it into frames.'
        : `${layers} visible effect layer${layers === 1 ? '' : 's'} will be written into the frame pixels.`
}

function renderExportSummary() {
    const count = gifFrameStack.length
    const totalMs = gifFrameStack.frames.reduce((sum, f) => sum + f.delay, 0)
    $('ex-summary').textContent = count
        ? `${count} frames · ${gifFrameStack.width}×${gifFrameStack.height} · ${(totalMs / 1000).toFixed(2)}s`
        : ''
}

// ── animate tab ───────────────────────────────────────────────────────────────

function renderAnimateTab() {
    const container = $('tracks')
    if (!container) return
    const editor = getEditor()
    const params = editor ? getAnimatableParameters(editor, editor.getSelectedIndex()) : []

    const easingSelect = $('anim-easing')
    if (easingSelect && !easingSelect.options.length) {
        for (const name of availableEasings) {
            const option = document.createElement('option')
            option.value = name
            option.textContent = name
            easingSelect.appendChild(option)
        }
    }

    container.innerHTML = ''
    if (!params.length) {
        const note = document.createElement('p')
        note.className = 'gsHint'
        note.textContent = 'Select a layer with numeric parameters to animate it.'
        container.appendChild(note)
        return
    }

    animationTracks.forEach((track, index) => {
        const row = document.createElement('div')
        row.className = 'gsTrack'

        const select = document.createElement('select')
        for (const param of params) {
            const option = document.createElement('option')
            option.value = param.name
            option.textContent = param.name
            option.selected = param.name === track.parameterName
            select.appendChild(option)
        }
        select.addEventListener('change', () => {
            track.parameterName = select.value
            const param = params.find(p => p.name === select.value)
            if (param) { track.startValue = param.min; track.endValue = param.max }
            renderAnimateTab()
        })

        const from = document.createElement('input')
        from.type = 'number'; from.step = 'any'; from.value = track.startValue
        from.addEventListener('input', () => { track.startValue = parseFloat(from.value) })

        const to = document.createElement('input')
        to.type = 'number'; to.step = 'any'; to.value = track.endValue
        to.addEventListener('input', () => { track.endValue = parseFloat(to.value) })

        const remove = document.createElement('button')
        remove.className = 'gsIconBtn'
        remove.textContent = '×'
        remove.title = 'Remove track'
        remove.addEventListener('click', () => {
            animationTracks.splice(index, 1)
            renderAnimateTab()
        })

        row.append(select, labelled('from', from), labelled('to', to), remove)
        container.appendChild(row)
    })
}

function labelled(text, input) {
    const wrap = document.createElement('label')
    wrap.className = 'gsTrackField'
    wrap.append(document.createTextNode(text), input)
    return wrap
}

// ── actions ───────────────────────────────────────────────────────────────────

function selectedIndices() {
    if (selection.size) return [...selection].sort((a, b) => a - b)
    return gifFrameStack.length ? [gifFrameStack.currentFrameIndex] : []
}

function setStatus(role, message, isError = false) {
    const element = $(role)
    if (!element) return
    element.textContent = message
    element.classList.toggle('gsError', isError)
}

async function handleAction(action, event) {
    const editor = getEditor()

    switch (action) {
        case 'import-gif':
        case 'import-more-gif':
            $('file-gif').click(); break

        case 'import-images':
        case 'import-more':
            $('file-images').click(); break

        case 'play':
            if (isGifPlaying()) stopGifPlayback()
            else if (editor) startGifPlayback(editor, () => refresh())
            refresh(); break

        case 'first': gotoFrame(0); break
        case 'last': gotoFrame(gifFrameStack.length - 1); break
        case 'prev': gotoFrame(gifFrameStack.currentFrameIndex - 1); break
        case 'next': gotoFrame(gifFrameStack.currentFrameIndex + 1); break

        case 'select-all':
            selection = new Set(gifFrameStack.frames.map((_, i) => i))
            refresh(); break

        case 'apply-delay': {
            const value = parseInt($('delay').value, 10)
            if (Number.isFinite(value)) {
                for (const index of selectedIndices()) gifFrameStack.setDelay(index, Math.max(10, value))
                refresh()
            }
            break
        }
        case 'apply-delay-all': {
            const value = parseInt($('delay').value, 10)
            if (Number.isFinite(value)) {
                gifFrameStack.frames.forEach((_, i) => gifFrameStack.setDelay(i, Math.max(10, value)))
                refresh()
            }
            break
        }

        case 'duplicate':
            for (const index of selectedIndices().reverse()) gifFrameStack.duplicateFrame(index)
            selection.clear(); refresh(); break

        case 'delete': {
            const targets = selectedIndices()
            if (gifFrameStack.length - targets.length < 1) {
                setStatus('bake-hint', 'At least one frame must remain.', true)
                return
            }
            for (const index of targets.reverse()) gifFrameStack.deleteFrame(index)
            selection.clear(); refresh(); break
        }

        case 'reverse':
            gifFrameStack.reverse(); selection.clear(); refresh(); break

        case 'move-left': moveSelection(-1); break
        case 'move-right': moveSelection(1); break

        case 'load-frame':
            if (editor) {
                const { loadFrameToEditor } = await import('../plugins/gifAnimator.js')
                loadFrameToEditor(editor, gifFrameStack.currentFrameIndex)
            }
            break

        case 'bake-selected': await bake(selectedIndices()); break
        case 'bake-all': await bake(null); break

        case 'add-track': {
            const params = editor ? getAnimatableParameters(editor, editor.getSelectedIndex()) : []
            if (!params.length) return
            const first = params[0]
            animationTracks.push({ parameterName: first.name, startValue: first.min, endValue: first.max })
            renderAnimateTab()
            break
        }

        case 'build-animation': await buildAnimation(); break
        case 'encode': await encode(); break
        case 'cancel-encode': encodeController?.abort(); break
        case 'download':
            if (resultBlob) {
                const name = ($('ex-name').value || 'animation').replace(/[^\w.-]+/g, '_')
                downloadBlob(resultBlob, `${name}.gif`)
            }
            break
        case 'discard': clearResult(); refresh(); break
    }
}

function gotoFrame(index) {
    const count = gifFrameStack.length
    if (!count) return
    stopGifPlayback()
    gifFrameStack.currentFrameIndex = Math.max(0, Math.min(index, count - 1))
    const editor = getEditor()
    const frame = gifFrameStack.currentFrame
    if (editor && frame) {
        // Show the frame without disturbing the editor's own base image.
        if (editor.canvas.width !== frame.imageData.width || editor.canvas.height !== frame.imageData.height) {
            editor.canvas.width = frame.imageData.width
            editor.canvas.height = frame.imageData.height
        }
        editor.context.putImageData(frame.imageData, 0, 0)
    }
    refresh()
}

function moveSelection(direction) {
    const targets = selectedIndices()
    if (!targets.length) return
    const ordered = direction < 0 ? targets : [...targets].reverse()
    const moved = new Set()
    for (const index of ordered) {
        const to = index + direction
        if (to < 0 || to >= gifFrameStack.length) { moved.add(index); continue }
        gifFrameStack.moveFrame(index, to)
        moved.add(to)
    }
    selection = moved
    refresh()
}

async function bake(indices) {
    const editor = getEditor()
    if (!editor) return
    const layers = editor.layerManager.layers.filter(l => l.effect && l.visible)
    if (!layers.length) {
        setStatus('bake-hint', 'Nothing to bake — no visible effect layers.', true)
        return
    }
    setStatus('bake-hint', 'Baking…')
    try {
        const count = await applyLayerStackToFrames(editor, { indices })
        invalidateThumbnails()
        setStatus('bake-hint', `Baked into ${count} frame${count === 1 ? '' : 's'}. Remove the layers to avoid applying them twice.`)
        refresh()
    } catch (error) {
        setStatus('bake-hint', `Bake failed: ${error.message}`, true)
    }
}

async function buildAnimation() {
    const editor = getEditor()
    if (!editor) return
    const layerIndex = editor.getSelectedIndex()
    if (layerIndex === null || !animationTracks.length) {
        setStatus('anim-status', 'Add at least one parameter track first.', true)
        return
    }

    const frameCount = parseInt($('anim-count').value, 10) || 24
    const frameDelay = parseInt($('anim-delay').value, 10) || 80
    const easing = $('anim-easing').value || 'linear'
    const pingPong = $('anim-pingpong').checked

    setStatus('anim-status', 'Building frames…')
    try {
        // createMultiParameterAnimation has existed and been exported since the
        // animator was written, and nothing ever called it.
        const configs = animationTracks.map(track => ({ ...track, easing }))
        const blob = await createMultiParameterAnimation(
            editor, layerIndex, configs,
            { frameCount, frameDelay, pingPong, scale: 1 },
            (progress) => setStatus('anim-status', `Building… ${progress}%`)
        )
        // Feed the rendered animation straight back into the timeline so it can be
        // trimmed and retimed rather than only downloaded.
        const file = new File([blob], 'animation.gif', { type: 'image/gif' })
        await loadGifFrames(file)
        invalidateThumbnails()
        selection.clear()
        activeTab = 'frames'
        setStatus('anim-status', `Built ${gifFrameStack.length} frames.`)
        refresh()
    } catch (error) {
        setStatus('anim-status', `Failed: ${error.message}`, true)
    }
}

function clearResult() {
    if (resultUrl) { URL.revokeObjectURL(resultUrl); resultUrl = null }
    resultBlob = null
    const result = $('result')
    if (result) result.hidden = true
}

async function encode() {
    if (!gifFrameStack.length) return
    clearResult()

    encodeController = new AbortController()
    const progress = $('progress')
    const fill = $('progress-fill')
    const text = $('progress-text')
    const encodeBtn = root.querySelector('[data-action="encode"]')
    const cancelBtn = root.querySelector('[data-action="cancel-encode"]')

    progress.hidden = false
    encodeBtn.disabled = true
    cancelBtn.hidden = false

    try {
        const blob = await exportFrameStackAsGif(gifFrameStack, {
            quality: parseInt($('ex-quality').value, 10) || 10,
            dither: $('ex-dither').value || false,
            repeat: parseInt($('ex-loop').value, 10) || 0,
            signal: encodeController.signal,
            onProgress: (percent) => {
                fill.style.width = `${percent}%`
                text.textContent = `${percent}%`
            }
        })

        resultBlob = blob
        resultUrl = URL.createObjectURL(blob)
        $('result-img').src = resultUrl
        const totalMs = gifFrameStack.frames.reduce((sum, f) => sum + f.delay, 0)
        $('result-meta').textContent =
            `${formatFileSize(blob.size)} · ${gifFrameStack.length} frames · ${(totalMs / 1000).toFixed(2)}s`
        $('result').hidden = false
    } catch (error) {
        if (error?.name !== 'AbortError') {
            setStatus('ex-summary', `Encode failed: ${error.message}`, true)
        }
    } finally {
        encodeController = null
        progress.hidden = true
        fill.style.width = '0%'
        encodeBtn.disabled = false
        cancelBtn.hidden = true
    }
}

// ── wiring ────────────────────────────────────────────────────────────────────

function wire(contentElement) {
    root = contentElement

    root.addEventListener('click', (event) => {
        const tab = event.target.closest('.gsTab')
        if (tab) { activeTab = tab.dataset.tab; refresh(); return }

        const cell = event.target.closest('.gsCell')
        if (cell) {
            const index = Number(cell.dataset.index)
            if (event.shiftKey && selection.size) {
                const from = Math.min(...selection, index)
                const to = Math.max(...selection, index)
                for (let i = from; i <= to; i++) selection.add(i)
            } else if (event.metaKey || event.ctrlKey) {
                selection.has(index) ? selection.delete(index) : selection.add(index)
            } else {
                selection = new Set([index])
            }
            gotoFrame(index)
            return
        }

        const actionEl = event.target.closest('[data-action]')
        if (actionEl) handleAction(actionEl.dataset.action, event)
    })

    $('scrub').addEventListener('input', (event) => gotoFrame(Number(event.target.value)))

    $('file-gif').addEventListener('change', async (event) => {
        const file = event.target.files?.[0]
        event.target.value = ''
        if (!file) return
        try {
            await loadGifFrames(file)
            invalidateThumbnails()
            selection.clear()
            refresh()
        } catch (error) {
            setStatus('bake-hint', `Could not read GIF: ${error.message}`, true)
        }
    })

    $('file-images').addEventListener('change', async (event) => {
        const files = [...(event.target.files || [])]
        event.target.value = ''
        if (!files.length) return
        const frames = []
        for (const file of files) {
            const bitmap = await createImageBitmap(file).catch(() => null)
            if (!bitmap) continue
            const width = gifFrameStack.width || bitmap.width
            const height = gifFrameStack.height || bitmap.height
            const canvas = document.createElement('canvas')
            canvas.width = width
            canvas.height = height
            const ctx = canvas.getContext('2d', { willReadFrequently: true })
            const scale = Math.min(width / bitmap.width, height / bitmap.height)
            const w = bitmap.width * scale
            const h = bitmap.height * scale
            ctx.drawImage(bitmap, (width - w) / 2, (height - h) / 2, w, h)
            frames.push(ctx.getImageData(0, 0, width, height))
            bitmap.close?.()
        }
        if (frames.length) {
            gifFrameStack.insertFrames(frames, gifFrameStack.length)
            invalidateThumbnails()
            refresh()
        }
    })

    // Drag to reorder.
    let dragFrom = null
    $('strip').addEventListener('dragstart', (event) => {
        const cell = event.target.closest('.gsCell')
        if (!cell) return
        dragFrom = Number(cell.dataset.index)
        event.dataTransfer.effectAllowed = 'move'
    })
    $('strip').addEventListener('dragover', (event) => {
        if (dragFrom !== null) event.preventDefault()
    })
    $('strip').addEventListener('drop', (event) => {
        const cell = event.target.closest('.gsCell')
        if (!cell || dragFrom === null) return
        event.preventDefault()
        const to = Number(cell.dataset.index)
        gifFrameStack.moveFrame(dragFrom, to)
        gifFrameStack.currentFrameIndex = to
        dragFrom = null
        selection.clear()
        refresh()
    })
}

// ── public API ────────────────────────────────────────────────────────────────

export function openGifStudio() {
    if (studioWindow) {
        studioWindow.focus()
        studioWindow.show()
        refresh()
        return studioWindow
    }

    const content = document.createElement('div')
    content.innerHTML = studioMarkup()

    studioWindow = windowManager.createWindow({
        id: 'gif-studio',
        title: 'GIF Studio',
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="2" y="4" width="20" height="16" rx="2"></rect>
            <path d="M7 4v16M17 4v16M2 10h20M2 14h20"></path>
        </svg>`,
        width: 470,
        height: 640,
        minWidth: 360,
        minHeight: 420,
        content,
        contentClass: 'no-padding',
        onClose: () => {
            stopGifPlayback()
            encodeController?.abort()
            clearResult()
            studioWindow = null
            root = null
        },
        onCreate: (win) => wire(win.getContentElement())
    })

    refresh()
    return studioWindow
}

export function isGifStudioOpen() {
    return studioWindow !== null
}

/** Called after a GIF is loaded elsewhere so the timeline reflects it. */
export function notifyFramesChanged() {
    invalidateThumbnails()
    selection.clear()
    if (studioWindow) refresh()
}
