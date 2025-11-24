import { LayerManager } from './layers.js'
import { HistoryManager } from './history.js'
import { hsvAdjustment } from '../plugins/hsvAdjustment.js'

const STATE_CHANGE_EVENT = 'imageEditorStateChanged'

export class ImageEditor {
    constructor(image, name, type, extension, canvas) {
        this.IMAGE = image
        this.NAME = name
        this.EXTENSION = extension
        this.TYPE = type

        this.image = this.IMAGE
        this.type = this.TYPE
        this.name = this.NAME
        this.extension = this.EXTENSION

        this.canvas = canvas
        this.context = canvas.getContext("2d")
        this.layerManager = new LayerManager()
        this.history = new HistoryManager()
        this.isRestoringState = false
        this.renderWorker = null
        this.workerJobId = 0
        this.pendingJobId = null
        this.renderTimeout = null
        this.isPreviewRendering = false
        this.baseImageCache = null
        this.baseImageDirty = true
        this.previewRequested = false
        this.previewScale = 0.25
        this.previewCanvas = null
        this.previewContext = null

        this.canvas.width = this.IMAGE.width
        this.canvas.height = this.IMAGE.height

        this.initializeRenderWorker()
    }

    loadImage() {
        this.context.drawImage(this.IMAGE, 0, 0)
        this.baseImageDirty = true
        this.requestRender(true)
        this.commitSnapshot('Initial load')
    }

    resetImage() {
        this.image = this.IMAGE
        this.canvas.width = this.IMAGE.width
        this.canvas.height = this.IMAGE.height
        this.baseImageDirty = true
        this.requestRender(true)
        this.commitSnapshot('Reset image')
    }

    quickExport() {
        const exportAnchor = document.createElement('a')
        exportAnchor.href = this.canvas.toDataURL(this.type)
        exportAnchor.download = `${this.name}_PhotoEditsExport.${this.extension}`
        exportAnchor.click()
    }

    setType(type) {
        this.type = type
    }

    setName(name) {
        this.name = name
        this.commitSnapshot('Rename image')
    }

    setExtension(extension) {
        this.extension = extension
        this.commitSnapshot('Change extension')
    }

    setExtenstion(extension) { // backwards compat for changeFileType typo
        this.setExtension(extension)
    }

    changeFileType(name, extension) {
        this.setName(name)
        this.setExtension(extension)
        this.setType(`image/${extension}`)
    }

    initializeRenderWorker() {
        if (typeof Worker === 'undefined') return

        try {
            this.renderWorker = new Worker(
                new URL('../workers/renderWorker.js', import.meta.url),
                { type: 'module' }
            )
            this.pendingJobId = null
            this.pendingPayload = null
            this.pendingTransferables = null
            this.renderWorker.onmessage = (event) => {
                const { jobId, imageData, error } = event.data
                if (jobId !== this.pendingJobId) return
                this.pendingJobId = null

                if (error) {
                    console.error('Render worker error:', error)
                    this.renderWorker.terminate()
                    this.renderWorker = null
                    this.renderImageFallback()
                    this.dispatchStateChange('Render failed')
                    return
                }

                if (!imageData?.data) return

                const outputArray = new Uint8ClampedArray(imageData.data)
                const outputImageData = new ImageData(outputArray, imageData.width, imageData.height)
                this.context.putImageData(outputImageData, 0, 0)
                this.dispatchStateChange('Render complete')

                if (this.pendingPayload) {
                    const payload = this.pendingPayload
                    const transferables = this.pendingTransferables
                    this.pendingPayload = null
                    this.pendingTransferables = null
                    this.startRenderJob(payload, transferables)
                }
            }
            this.renderWorker.onerror = (event) => {
                console.error('Render worker crashed:', event.message)
                this.renderWorker.terminate()
                this.renderWorker = null
                this.pendingJobId = null
                this.pendingPayload = null
                this.pendingTransferables = null
                this.dispatchStateChange('Render failed')
            }
        } catch (error) {
            console.error('Failed to initialize render worker', error)
            this.renderWorker = null
        }
    }

    cancelPendingRender() {
        if (!this.pendingJobId || !this.renderWorker) return
        this.renderWorker.terminate()
        this.renderWorker = null
        this.pendingJobId = null
        this.initializeRenderWorker()
    }

    startRenderJob(payload, transferables) {
        if (!this.renderWorker) {
            this.renderImageFallback()
            return
        }

        if (this.pendingJobId) {
            this.pendingPayload = payload
            this.pendingTransferables = transferables
            return
        }

        const jobId = ++this.workerJobId
        this.pendingJobId = jobId
        this.dispatchStateChange('Render started')

        this.renderWorker.postMessage(
            { jobId, ...payload },
            transferables
        )
    }

    requestRender(immediate = false) {
        if (this.renderTimeout) {
            clearTimeout(this.renderTimeout)
            this.renderTimeout = null
        }

        if (immediate) {
            this.renderImage()
            return
        }

        this.renderTimeout = setTimeout(() => {
            this.renderTimeout = null
            this.renderImage()
        }, 60)
    }

    renderImage() {
        const hasRenderableLayers = this.layerManager.layers.some(layer =>
            layer.effect && layer.visible && layer.opacity > 0
        )

        if (!hasRenderableLayers) {
            this.modifiedImage = this.image
            this.context.clearRect(0, 0, this.canvas.width, this.canvas.height)
            this.context.drawImage(this.modifiedImage, 0, 0)
            return
        }

        if (this.renderWorker) {
            this.modifiedImage = this.image
            const imageData = this.cloneImageData(this.getBaseImageData())
            const transferableBuffer = imageData.data.buffer

            const payload = {
                baseImageData: {
                    width: imageData.width,
                    height: imageData.height,
                    data: transferableBuffer
                },
                layers: this.layerManager.layers.map(layer => ({
                    id: layer.id,
                    name: layer.name,
                    visible: layer.visible,
                    opacity: layer.opacity,
                    effectId: layer.effectId,
                    effectParameters: layer.effectParameters
                }))
            }

            if (this.pendingJobId) {
                this.cancelPendingRender()
            }

            if (!this.renderWorker) {
                this.renderImageFallback()
                return
            }

            this.startRenderJob(payload, [transferableBuffer])
        } else {
            this.renderImageFallback()
        }
    }

    ensureBaseImageCanvas() {
        if (!this.baseImageCanvas) {
            this.baseImageCanvas = document.createElement('canvas')
            this.baseImageContext = this.baseImageCanvas.getContext('2d')
        }
        return this.baseImageCanvas
    }

    ensurePreviewCanvas(width, height) {
        if (!this.previewCanvas) {
            this.previewCanvas = document.createElement('canvas')
            this.previewContext = this.previewCanvas.getContext('2d')
        }
        this.previewCanvas.width = width
        this.previewCanvas.height = height
        return this.previewCanvas
    }

    getBaseImageData() {
        if (!this.baseImageCache || this.baseImageDirty) {
            const width = this.image.width
            const height = this.image.height
            const baseCanvas = this.ensureBaseImageCanvas()
            baseCanvas.width = width
            baseCanvas.height = height
            this.baseImageContext.clearRect(0, 0, width, height)
            this.baseImageContext.drawImage(this.image, 0, 0, width, height)
            const imageData = this.baseImageContext.getImageData(0, 0, width, height)
            this.baseImageCache = new ImageData(
                new Uint8ClampedArray(imageData.data),
                width,
                height
            )
            this.baseImageDirty = false
        }
        return this.baseImageCache
    }

    cloneImageData(imageData) {
        return new ImageData(
            new Uint8ClampedArray(imageData.data),
            imageData.width,
            imageData.height
        )
    }

    renderImageFallback() {
        if (this.isPreviewRendering) {
            this.previewRequested = true
            return
        }

        this.isPreviewRendering = true
        this.previewRequested = false

        const runPreview = () => {
            const baseCanvas = this.ensureBaseImageCanvas()
            const scale = this.previewScale
            const width = Math.max(1, Math.round(baseCanvas.width * scale))
            const height = Math.max(1, Math.round(baseCanvas.height * scale))
            const previewCanvas = this.ensurePreviewCanvas(width, height)
            this.previewContext.clearRect(0, 0, width, height)
            this.previewContext.drawImage(baseCanvas, 0, 0, width, height)
            const previewData = this.previewContext.getImageData(0, 0, width, height)
            this.layerManager.applyLayerEffects(previewData)
            this.previewContext.putImageData(previewData, 0, 0)

            this.context.save()
            this.context.clearRect(0, 0, this.canvas.width, this.canvas.height)
            this.context.imageSmoothingEnabled = true
            this.context.drawImage(previewCanvas, 0, 0, this.canvas.width, this.canvas.height)
            this.context.restore()

            this.isPreviewRendering = false

            if (this.previewRequested) {
                this.renderImageFallback()
            }
        }

        requestAnimationFrame(runPreview)
    }

    bilinearInterpolation() {
        console.warn('Bilinear interpolation is not implemented yet.')
        return Promise.resolve()
    }

    nearestNeighbourInterpolation() {
        console.warn('Nearest neighbour interpolation is not implemented yet.')
        return Promise.resolve()
    }

    defaultInterpolation(newWidth, newHeight) {
        return new Promise((resolve) => {
            const tempCanvas = document.createElement('canvas')
            const tempContext = tempCanvas.getContext('2d')

            tempCanvas.width = newWidth
            tempCanvas.height = newHeight

            tempContext.drawImage(this.image, 0, 0, newWidth, newHeight)

            const resizedImage = new Image()
            resizedImage.src = tempCanvas.toDataURL(this.TYPE)
            resizedImage.onload = () => {
                this.image = resizedImage
                this.canvas.width = newWidth
                this.canvas.height = newHeight
                this.baseImageDirty = true
                this.requestRender(true)
                tempCanvas.remove()
                resolve()
            }
        })
    }

    async resizeCanvas(newHeight, newWidth, maintainAspectRatio, interpolationType) {
        let resizeWidth = Number(newWidth)
        let resizeHeight = Number(newHeight)

        if (maintainAspectRatio) {
            const aspectRatio = this.image.width / this.image.height
            if (resizeWidth / resizeHeight > aspectRatio) {
                resizeWidth = Math.round(resizeHeight * aspectRatio)
            } else {
                resizeHeight = Math.round(resizeWidth / aspectRatio)
            }
        }

        if (!resizeWidth || !resizeHeight) return

        if (interpolationType === "Default") {
            await this.defaultInterpolation(resizeWidth, resizeHeight)
        } else if (interpolationType === "Nearest Neighbour") {
            await this.nearestNeighbourInterpolation(resizeWidth, resizeHeight)
        } else if (interpolationType === "Bilinear") {
            await this.bilinearInterpolation(resizeWidth, resizeHeight)
        } else {
            await this.defaultInterpolation(resizeWidth, resizeHeight)
        }

        this.commitSnapshot('Resize canvas')
    }

    toggleVisibility(index) {
        this.layerManager.toggleVisibility(index)
        this.requestRender(true)
        this.commitSnapshot('Toggle layer visibility')
    }

    addLayer(name) {
        return this.addLayerInternal(name)
    }

    addLayerInternal(name, { skipSnapshot = false } = {}) {
        const layer = this.layerManager.addLayer(name)
        this.baseImageDirty = true
        this.requestRender(true)
        if (!skipSnapshot) {
            const reason = name ? `Add layer: ${name}` : 'Add layer'
            this.commitSnapshot(reason)
        }
        return layer
    }

    deleteLayer(index) {
        this.layerManager.deleteLayer(index)
        this.baseImageDirty = true
        this.requestRender(true)
        this.commitSnapshot('Delete layer')
    }

    applyEffectToLayer(index, effect, parameters = {}, valueStep = 0.01, snapshotReason = 'Apply layer effect') {
        this.layerManager.addLayerEffect(index, effect, parameters, valueStep)
        this.requestRender(true)
        if (snapshotReason) {
            this.commitSnapshot(snapshotReason)
        }
    }

    addEffectLayer(layerName, effect, parameters = {}, valueStep = 0.01) {
        const name = layerName ?? effect?.displayName ?? effect?.name ?? 'Effect Layer'
        this.addLayerInternal(name, { skipSnapshot: true })
        const index = this.getSelectedIndex()
        this.applyEffectToLayer(index, effect, parameters, valueStep, null)
        this.baseImageDirty = true
        this.commitSnapshot(`Add layer: ${name}`)
        return index
    }

    updateLayerEffectParameters(index, parameters = {}, options = {}) {
        const { snapshot = true, deferRender = false } = options
        this.layerManager.updateLayerParameters(index, parameters)
        if (deferRender) {
            this.renderImageFallback()
            this.requestRender(false)
        } else {
            this.requestRender(true)
        }
        if (snapshot) {
            this.commitSnapshot('Update effect parameters')
        }
    }

    setLayerOpacity(index, opacity, options = {}) {
        const normalizedOptions = typeof options === 'boolean'
            ? { snapshot: options }
            : options || {}
        const { snapshot = true, deferRender = false } = normalizedOptions
        this.layerManager.setOpacity(index, opacity)
        if (deferRender) {
            this.renderImageFallback()
            this.requestRender(false)
        } else {
            this.requestRender(true)
        }
        if (snapshot) {
            this.commitSnapshot('Change layer opacity')
        }
    }

    renameLayer(index, name) {
        this.layerManager.renameLayer(index, name)
        this.commitSnapshot('Rename layer')
    }

    moveLayerUp(index) {
        const targetIndex = index ?? this.getSelectedIndex()
        const newIndex = this.layerManager.moveLayerUp(targetIndex)
        if (newIndex === null || newIndex === undefined) return null
        this.baseImageDirty = true
        this.requestRender(true)
        this.commitSnapshot('Move layer up')
        return newIndex
    }

    moveLayerDown(index) {
        const targetIndex = index ?? this.getSelectedIndex()
        const newIndex = this.layerManager.moveLayerDown(targetIndex)
        if (newIndex === null || newIndex === undefined) return null
        this.baseImageDirty = true
        this.requestRender(true)
        this.commitSnapshot('Move layer down')
        return newIndex
    }

    setSelectedIndex(index) {
        this.layerManager.setSelectedLayer(index)
    }

    getSelectedIndex() {
        return this.layerManager.selectedLayerIndex
    }

    changeCanvasHSV(hue, saturate, brightness) {
        const parameters = {
            hue: { value: Number(hue) || 0, range: [-180, 180], valueStep: 1 },
            saturation: { value: Number(saturate) || 100, range: [0, 200], valueStep: 1 },
            brightness: { value: Number(brightness) || 100, range: [0, 200], valueStep: 1 }
        }

        let targetIndex = this.findLayerByEffect(hsvAdjustment)
        const layerAlreadyExists = targetIndex !== null

        if (!layerAlreadyExists) {
            targetIndex = this.addEffectLayer('HSV Adjustment', hsvAdjustment, parameters)
        } else {
            this.setSelectedIndex(targetIndex)
            this.updateLayerEffectParameters(targetIndex, {
                hue: { value: parameters.hue.value },
                saturation: { value: parameters.saturation.value },
                brightness: { value: parameters.brightness.value }
            })
        }

        this.setSelectedIndex(targetIndex)
        return targetIndex
    }

    findLayerByEffect(effect) {
        const selectedIndex = this.getSelectedIndex()
        if (selectedIndex !== null) {
            const selectedLayer = this.layerManager.layers[selectedIndex]
            if (selectedLayer && selectedLayer.effect === effect) {
                return selectedIndex
            }
        }

        const existingIndex = this.layerManager.layers.findIndex(layer => layer.effect === effect)
        return existingIndex === -1 ? null : existingIndex
    }

    crop(originHeight, originWidth, endHeight, endWidth) {
        return new Promise((resolve) => {
            const newHeight = Math.abs(endHeight - originHeight)
            const newWidth = Math.abs(endWidth - originWidth)

            if (!newHeight || !newWidth) {
                resolve()
                return
            }

            const tempCanvas = document.createElement('canvas')
            const tempContext = tempCanvas.getContext('2d')

            tempCanvas.width = newWidth
            tempCanvas.height = newHeight

            tempContext.drawImage(
                this.image,
                originWidth,
                originHeight,
                newWidth,
                newHeight,
                0,
                0,
                newWidth,
                newHeight
            )

            const croppedImage = new Image()
            croppedImage.src = tempCanvas.toDataURL(this.TYPE)
            croppedImage.onload = () => {
                this.canvas.width = newWidth
                this.canvas.height = newHeight
                this.image = croppedImage
                this.baseImageDirty = true
                this.requestRender(true)
                tempCanvas.remove()
                this.commitSnapshot('Crop image')
                resolve()
            }
        })
    }

    rotate(angle) {
        const tempCanvas = document.createElement('canvas')
        const tempContext = tempCanvas.getContext('2d')
        const radians = (angle * Math.PI) / 180

        const isRightAngle = angle % 90 === 0
        const swap = (angle % 180 !== 0) && isRightAngle

        const newWidth = swap ? this.canvas.height : this.canvas.width
        const newHeight = swap ? this.canvas.width : this.canvas.height

        tempCanvas.width = newWidth
        tempCanvas.height = newHeight
        tempContext.translate(newWidth / 2, newHeight / 2)
        tempContext.rotate(radians)

        const newOriginX = -this.canvas.width / 2
        const newOriginY = -this.canvas.height / 2
        tempContext.drawImage(this.image, newOriginX, newOriginY)

        const rotatedImage = new Image()
        rotatedImage.src = tempCanvas.toDataURL(this.TYPE)

        return new Promise((resolve) => {
            rotatedImage.onload = () => {
                this.canvas.width = newWidth
                this.canvas.height = newHeight
                this.image = rotatedImage

                this.context.clearRect(0, 0, newWidth, newHeight)
                this.context.drawImage(rotatedImage, 0, 0)
                this.baseImageDirty = true
                this.requestRender(true)
                tempCanvas.remove()
                this.commitSnapshot('Rotate image')
                resolve()
            }
        })
    }

    async undo() {
        const snapshot = this.history.undo()
        if (!snapshot) return
        await this.restoreSnapshot(snapshot, 'Undo')
    }

    async redo() {
        const snapshot = this.history.redo()
        if (!snapshot) return
        await this.restoreSnapshot(snapshot, 'Redo')
    }

    commitSnapshot(reason) {
        if (this.isRestoringState) return
        const snapshot = this.createSnapshot(reason)
        this.history.push(snapshot)
        this.dispatchStateChange(reason)
    }

    createSnapshot(reason) {
        return {
            reason,
            baseImageSrc: this.image.src,
            canvasWidth: this.canvas.width,
            canvasHeight: this.canvas.height,
            layerManager: this.layerManager.clone()
        }
    }

    async restoreSnapshot(snapshot, reason) {
        this.isRestoringState = true
        await this.replaceImage(snapshot.baseImageSrc)
        this.canvas.width = snapshot.canvasWidth
        this.canvas.height = snapshot.canvasHeight
        this.layerManager = snapshot.layerManager.clone()
        this.requestRender(true)
        this.isRestoringState = false
        this.dispatchStateChange(reason)
    }

    replaceImage(src) {
        return new Promise((resolve) => {
            const newImage = new Image()
            newImage.src = src
            newImage.onload = () => {
                this.image = newImage
                resolve()
            }
        })
    }

    dispatchStateChange(reason) {
        window.dispatchEvent(new CustomEvent(STATE_CHANGE_EVENT, {
            detail: {
                instance: this,
                reason,
                undoAvailable: this.history.canUndo(),
                redoAvailable: this.history.canRedo(),
                isRendering: reason === 'Render started',
                renderFailed: reason === 'Render failed'
            }
        }))
    }
}