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
        this.renderTimeout = null
        this.isRendering = false
        this.renderRequested = false
        this.isPreviewRendering = false
        this.previewRequested = false
        this.fullQualityRenderTimeout = null
        this.baseImageCache = null
        this.baseImageDirty = true
        this.baseImageCanvas = null
        this.baseImageContext = null
        this.previewCanvas = null
        this.previewContext = null
        this.previewScale = 0.25

        this.canvas.width = this.IMAGE.width
        this.canvas.height = this.IMAGE.height
    }

    loadImage() {
        this.context.drawImage(this.IMAGE, 0, 0)
        this.invalidateBaseImageCache()
        this.requestRender(true)
        this.commitSnapshot('Initial load')
    }

    resetImage() {
        this.image = this.IMAGE
        this.canvas.width = this.IMAGE.width
        this.canvas.height = this.IMAGE.height
        this.invalidateBaseImageCache()
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


    requestRender(immediate = false) {
        if (this.renderTimeout) {
            clearTimeout(this.renderTimeout)
            this.renderTimeout = null
        }

        // Cancel any pending full-quality render
        if (this.fullQualityRenderTimeout) {
            clearTimeout(this.fullQualityRenderTimeout)
            this.fullQualityRenderTimeout = null
        }

        if (immediate) {
            // Skip preview and go straight to full quality for immediate renders
            this.renderFullQuality()
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
            // Cancel any pending renders
            if (this.fullQualityRenderTimeout) {
                clearTimeout(this.fullQualityRenderTimeout)
                this.fullQualityRenderTimeout = null
            }
            this.context.clearRect(0, 0, this.canvas.width, this.canvas.height)
            this.context.drawImage(this.image, 0, 0)
            this.dispatchStateChange('Render complete')
            return
        }

        // Show quick preview first for live updates
        this.renderPreview()

        // Cancel any existing full-quality render timeout
        if (this.fullQualityRenderTimeout) {
            clearTimeout(this.fullQualityRenderTimeout)
        }

        // Queue full-quality render after a short delay
        this.fullQualityRenderTimeout = setTimeout(() => {
            this.fullQualityRenderTimeout = null
            this.renderFullQuality()
        }, 150)
    }

    renderPreview() {
        if (this.isPreviewRendering) {
            this.previewRequested = true
            return
        }

        this.isPreviewRendering = true
        this.previewRequested = false
        this.dispatchStateChange('Render started')

        requestAnimationFrame(() => {
            try {
                const baseCanvas = this.ensureBaseImageCanvas()
                const scale = this.previewScale
                const width = Math.max(1, Math.round(baseCanvas.width * scale))
                const height = Math.max(1, Math.round(baseCanvas.height * scale))
                
                // Create or resize preview canvas
                if (!this.previewCanvas) {
                    this.previewCanvas = document.createElement('canvas')
                    this.previewContext = this.previewCanvas.getContext('2d')
                }
                this.previewCanvas.width = width
                this.previewCanvas.height = height
                
                // Draw base image at preview scale
                this.previewContext.clearRect(0, 0, width, height)
                this.previewContext.drawImage(baseCanvas, 0, 0, width, height)
                
                // Get preview image data and apply effects
                const previewData = this.previewContext.getImageData(0, 0, width, height)
                this.layerManager.applyLayerEffects(previewData)
                this.previewContext.putImageData(previewData, 0, 0)

                // Scale up and draw to main canvas with smoothing
                this.context.save()
                this.context.clearRect(0, 0, this.canvas.width, this.canvas.height)
                this.context.imageSmoothingEnabled = true
                this.context.imageSmoothingQuality = 'high'
                this.context.drawImage(this.previewCanvas, 0, 0, this.canvas.width, this.canvas.height)
                this.context.restore()
            } catch (error) {
                console.error('Preview render error:', error)
            } finally {
                this.isPreviewRendering = false

                // If another preview was requested, do it now
                if (this.previewRequested) {
                    this.renderPreview()
                }
            }
        })
    }

    renderFullQuality() {
        if (this.isRendering) {
            return
        }

        this.isRendering = true
        this.fullQualityRenderTimeout = null // Clear the timeout since we're starting the render
        this.dispatchStateChange('Render started')

        requestAnimationFrame(() => {
            try {
                const baseImageData = this.getBaseImageData()
                const imageData = this.cloneImageData(baseImageData)
                
                // Apply all layer effects directly at full quality
                this.layerManager.applyLayerEffects(imageData)
                
                // Draw the result to the canvas
                this.context.putImageData(imageData, 0, 0)
            } catch (error) {
                console.error('Full quality render error:', error)
                this.isRendering = false
                this.dispatchStateChange('Render failed')
                return
            }
            this.isRendering = false
            this.dispatchStateChange('Render complete')
        })
    }

    ensureBaseImageCanvas() {
        if (!this.baseImageCanvas) {
            this.baseImageCanvas = document.createElement('canvas')
            this.baseImageContext = this.baseImageCanvas.getContext('2d')
        }
        return this.baseImageCanvas
    }


    invalidateBaseImageCache() {
        this.baseImageCache = null
        this.baseImageDirty = true
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
                this.invalidateBaseImageCache()
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
        // Note: Adding a layer doesn't change the base image, so we don't need to invalidate cache
        this.requestRender(true)
        if (!skipSnapshot) {
            const reason = name ? `Add layer: ${name}` : 'Add layer'
            this.commitSnapshot(reason)
        }
        return layer
    }

    deleteLayer(index) {
        this.layerManager.deleteLayer(index)
        // Note: Deleting a layer doesn't change the base image, so we don't need to invalidate cache
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
        // Note: Adding an effect layer doesn't change the base image, so we don't need to invalidate cache
        this.commitSnapshot(`Add layer: ${name}`)
        return index
    }

    updateLayerEffectParameters(index, parameters = {}, options = {}) {
        const { snapshot = true, deferRender = false } = options
        this.layerManager.updateLayerParameters(index, parameters)
        this.requestRender(!deferRender)
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
        this.requestRender(!deferRender)
        if (snapshot) {
            this.commitSnapshot('Change layer opacity')
        }
    }

    setLayerBlendMode(index, blendMode, options = {}) {
        const { snapshot = true, deferRender = false } = options
        this.layerManager.setBlendMode(index, blendMode)
        this.requestRender(!deferRender)
        if (snapshot) {
            this.commitSnapshot('Change layer blend mode')
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
        // Note: Moving a layer doesn't change the base image, so we don't need to invalidate cache
        this.requestRender(true)
        this.commitSnapshot('Move layer up')
        return newIndex
    }

    moveLayerDown(index) {
        const targetIndex = index ?? this.getSelectedIndex()
        const newIndex = this.layerManager.moveLayerDown(targetIndex)
        if (newIndex === null || newIndex === undefined) return null
        // Note: Moving a layer doesn't change the base image, so we don't need to invalidate cache
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
                this.invalidateBaseImageCache()
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
                this.invalidateBaseImageCache()
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
                this.invalidateBaseImageCache()
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
                isRendering: this.isRendering || this.isPreviewRendering || this.fullQualityRenderTimeout !== null,
                renderFailed: reason === 'Render failed'
            }
        }))
    }

    /**
     * Returns a promise that resolves when all pending renders are complete
     */
    waitForRenderComplete() {
        return new Promise((resolve) => {
            const checkRenderState = () => {
                if (!this.isRendering && !this.isPreviewRendering && !this.fullQualityRenderTimeout && !this.renderTimeout) {
                    resolve()
                } else {
                    requestAnimationFrame(checkRenderState)
                }
            }
            checkRenderState()
        })
    }

    /**
     * Returns true if any render is in progress or queued
     */
    get isBusy() {
        return this.isRendering || this.isPreviewRendering || this.fullQualityRenderTimeout !== null || this.renderTimeout !== null
    }
}