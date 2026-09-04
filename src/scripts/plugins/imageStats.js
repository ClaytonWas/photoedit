/**
 * Image Statistics Panel
 * 
 * Comprehensive image statistics:
 * - Channel statistics (mean, std dev, min, max)
 * - Histogram percentiles
 * - Contrast ratio
 * - Dynamic range analysis
 */

import { windowManager } from '../core/windowManager.js'
import { sampleCanvas } from '../core/imageSampler.js'

let imageStatsWindow = null
let imageEditor = null

// Set up live update listener
function setupLiveUpdateListener() {
    window.addEventListener('imageEditorStateChanged', (event) => {
        const { instance, isRendering, renderFailed } = event.detail
        // Update imageEditor reference if provided
        if (instance) {
            imageEditor = instance
        }
        // Update when render completes successfully
        if (!isRendering && !renderFailed && imageStatsWindow) {
            // Use window.imageEditor as fallback
            if (!imageEditor && window.imageEditor) {
                imageEditor = window.imageEditor
            }
            updateStatsDisplay()
        }
    })
}

// Initialize listener once
setupLiveUpdateListener()

/**
 * Initialize with editor reference
 */
export function initImageStats(editor) {
    imageEditor = editor
}

/**
 * Calculate comprehensive image statistics
 */
function calculateImageStats(imageData) {
    const data = imageData.data
    // Transparent pixels are skipped in the loop below, so count the sampled pixels as
    // we go — dividing by the full buffer length skews every mean and standard deviation.
    let pixelCount = 0
    
    // Initialize accumulators
    let sumR = 0, sumG = 0, sumB = 0, sumLum = 0
    let sumR2 = 0, sumG2 = 0, sumB2 = 0, sumLum2 = 0
    let minR = 255, minG = 255, minB = 255, minLum = 255
    let maxR = 0, maxG = 0, maxB = 0, maxLum = 0
    
    const histogram = {
        r: new Uint32Array(256),
        g: new Uint32Array(256),
        b: new Uint32Array(256),
        lum: new Uint32Array(256)
    }
    
    // Single pass through data
    for (let i = 0; i < data.length; i += 4) {
        const r = data[i]
        const g = data[i + 1]
        const b = data[i + 2]
        const a = data[i + 3]
        
        // Skip transparent pixels
        if (a === 0) continue
        
        pixelCount++
        
        // Luminance (Rec. 709)
        const lum = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b)
        
        // Accumulate
        sumR += r; sumG += g; sumB += b; sumLum += lum
        sumR2 += r * r; sumG2 += g * g; sumB2 += b * b; sumLum2 += lum * lum
        
        // Min/Max
        minR = Math.min(minR, r); maxR = Math.max(maxR, r)
        minG = Math.min(minG, g); maxG = Math.max(maxG, g)
        minB = Math.min(minB, b); maxB = Math.max(maxB, b)
        minLum = Math.min(minLum, lum); maxLum = Math.max(maxLum, lum)
        
        // Histogram
        histogram.r[r]++
        histogram.g[g]++
        histogram.b[b]++
        histogram.lum[lum]++
    }
    
    // Guard every division: a fully transparent image samples no pixels at all.
    const sampleCount = pixelCount || 1

    // Calculate means
    const meanR = sumR / sampleCount
    const meanG = sumG / sampleCount
    const meanB = sumB / sampleCount
    const meanLum = sumLum / sampleCount
    
    // Calculate standard deviations. Clamp at zero because floating-point error can push
    // the variance very slightly negative when every sample is identical.
    const stdDev = (sumOfSquares, mean) => Math.sqrt(Math.max(0, (sumOfSquares / sampleCount) - (mean * mean)))
    const stdR = stdDev(sumR2, meanR)
    const stdG = stdDev(sumG2, meanG)
    const stdB = stdDev(sumB2, meanB)
    const stdLum = stdDev(sumLum2, meanLum)
    
    // Calculate percentiles from histogram
    const getPercentile = (hist, percentile) => {
        const target = (percentile / 100) * sampleCount
        let cumulative = 0
        for (let i = 0; i < 256; i++) {
            cumulative += hist[i]
            if (cumulative >= target) return i
        }
        return 255
    }
    
    // Nothing sampled: fall back to zeroes instead of reporting the 255 sentinels.
    if (pixelCount === 0) {
        minR = minG = minB = minLum = 0
    }

    // Dynamic range
    const dynamicRange = maxLum - minLum
    const dynamicRangeStops = Math.log2(Math.max(1, maxLum) / Math.max(1, minLum))
    
    // Contrast ratio (relative luminance)
    const contrastRatio = (maxLum + 0.05) / (minLum + 0.05)
    
    return {
        dimensions: {
            width: imageData.width,
            height: imageData.height,
            pixels: pixelCount
        },
        channels: {
            red: {
                mean: meanR.toFixed(1),
                std: stdR.toFixed(1),
                min: minR,
                max: maxR,
                range: maxR - minR,
                p5: getPercentile(histogram.r, 5),
                p95: getPercentile(histogram.r, 95)
            },
            green: {
                mean: meanG.toFixed(1),
                std: stdG.toFixed(1),
                min: minG,
                max: maxG,
                range: maxG - minG,
                p5: getPercentile(histogram.g, 5),
                p95: getPercentile(histogram.g, 95)
            },
            blue: {
                mean: meanB.toFixed(1),
                std: stdB.toFixed(1),
                min: minB,
                max: maxB,
                range: maxB - minB,
                p5: getPercentile(histogram.b, 5),
                p95: getPercentile(histogram.b, 95)
            },
            luminance: {
                mean: meanLum.toFixed(1),
                std: stdLum.toFixed(1),
                min: minLum,
                max: maxLum,
                range: dynamicRange,
                p5: getPercentile(histogram.lum, 5),
                p95: getPercentile(histogram.lum, 95)
            }
        },
        analysis: {
            dynamicRange,
            dynamicRangeStops: dynamicRangeStops.toFixed(2),
            contrastRatio: contrastRatio.toFixed(2),
            isHighContrast: contrastRatio > 4.5,
            isLowKey: meanLum < 85,
            isHighKey: meanLum > 170,
            dominantChannel: meanR > meanG && meanR > meanB ? 'Red' :
                            meanG > meanR && meanG > meanB ? 'Green' : 'Blue'
        }
    }
}

/**
 * Update statistics display
 */
function updateStatsDisplay() {
    const editor = window.getActiveEditor?.() || imageEditor || window.imageEditor
    if (!imageStatsWindow || !editor || !editor.canvas) return
    
    // Point-sampled; see imageSampler.js. Means, deviations and percentiles are
    // statistically identical, at a fraction of the cost.
    const sample = sampleCanvas(editor.canvas)
    if (!sample) return
    const stats = calculateImageStats(sample.imageData)
    // Report the real dimensions, not the sample's.
    stats.dimensions.width = editor.canvas.width
    stats.dimensions.height = editor.canvas.height
    stats.dimensions.pixels = sample.totalPixels
    
    const content = imageStatsWindow.getContentElement()
    if (!content) return
    
    content.innerHTML = `
        <div class="stats-section">
            <div class="stats-header">📐 Dimensions</div>
            <div class="stats-grid">
                <div class="stat-item">
                    <span class="stat-label">Width</span>
                    <span class="stat-value">${stats.dimensions.width}px</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Height</span>
                    <span class="stat-value">${stats.dimensions.height}px</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Pixels</span>
                    <span class="stat-value">${stats.dimensions.pixels.toLocaleString()}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Megapixels</span>
                    <span class="stat-value">${(stats.dimensions.pixels / 1000000).toFixed(2)} MP</span>
                </div>
            </div>
        </div>
        
        <div class="stats-section">
            <div class="stats-header">🎨 Channel Statistics</div>
            <table class="stats-table">
                <thead>
                    <tr>
                        <th>Channel</th>
                        <th>Mean</th>
                        <th>Std</th>
                        <th>Min</th>
                        <th>Max</th>
                        <th>Range</th>
                    </tr>
                </thead>
                <tbody>
                    <tr class="channel-red">
                        <td>Red</td>
                        <td>${stats.channels.red.mean}</td>
                        <td>${stats.channels.red.std}</td>
                        <td>${stats.channels.red.min}</td>
                        <td>${stats.channels.red.max}</td>
                        <td>${stats.channels.red.range}</td>
                    </tr>
                    <tr class="channel-green">
                        <td>Green</td>
                        <td>${stats.channels.green.mean}</td>
                        <td>${stats.channels.green.std}</td>
                        <td>${stats.channels.green.min}</td>
                        <td>${stats.channels.green.max}</td>
                        <td>${stats.channels.green.range}</td>
                    </tr>
                    <tr class="channel-blue">
                        <td>Blue</td>
                        <td>${stats.channels.blue.mean}</td>
                        <td>${stats.channels.blue.std}</td>
                        <td>${stats.channels.blue.min}</td>
                        <td>${stats.channels.blue.max}</td>
                        <td>${stats.channels.blue.range}</td>
                    </tr>
                    <tr class="channel-lum">
                        <td>Luminance</td>
                        <td>${stats.channels.luminance.mean}</td>
                        <td>${stats.channels.luminance.std}</td>
                        <td>${stats.channels.luminance.min}</td>
                        <td>${stats.channels.luminance.max}</td>
                        <td>${stats.channels.luminance.range}</td>
                    </tr>
                </tbody>
            </table>
        </div>
        
        <div class="stats-section">
            <div class="stats-header">📊 Analysis</div>
            <div class="stats-grid">
                <div class="stat-item">
                    <span class="stat-label">Dynamic Range</span>
                    <span class="stat-value">${stats.analysis.dynamicRangeStops} stops</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Contrast Ratio</span>
                    <span class="stat-value">${stats.analysis.contrastRatio}:1</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Dominant Channel</span>
                    <span class="stat-value">${stats.analysis.dominantChannel}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Exposure</span>
                    <span class="stat-value">${stats.analysis.isLowKey ? 'Low Key' : stats.analysis.isHighKey ? 'High Key' : 'Normal'}</span>
                </div>
            </div>
        </div>
    `
}

/**
 * Create stats panel content structure
 */
function createStatsContent() {
    const content = document.createElement('div')
    content.className = 'image-stats-panel'
    content.innerHTML = '<div class="stats-loading">Loading statistics...</div>'
    
    // Add styles
    const style = document.createElement('style')
    style.id = 'image-stats-styles'
    if (!document.getElementById('image-stats-styles')) {
        style.textContent = `
            .image-stats-panel {
                padding: 12px;
                display: flex;
                flex-direction: column;
                gap: 12px;
            }
            
            .stats-loading {
                text-align: center;
                padding: 20px;
                color: var(--text-secondary, #94a3b8);
            }
            
            .stats-section {
                background: var(--bg-tertiary, #334155);
                border-radius: 8px;
                padding: 12px;
            }
            
            .stats-header {
                font-size: 13px;
                font-weight: 600;
                color: var(--text-primary, #f1f5f9);
                margin-bottom: 10px;
            }
            
            .stats-grid {
                display: grid;
                grid-template-columns: repeat(2, 1fr);
                gap: 8px;
            }
            
            .stat-item {
                display: flex;
                flex-direction: column;
                gap: 2px;
            }
            
            .stat-label {
                font-size: 11px;
                color: var(--text-tertiary, #64748b);
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            
            .stat-value {
                font-size: 14px;
                font-weight: 600;
                color: var(--text-primary, #f1f5f9);
                font-family: 'IBM Plex Mono', monospace;
            }
            
            .stats-table {
                width: 100%;
                border-collapse: collapse;
                font-size: 12px;
            }
            
            .stats-table th,
            .stats-table td {
                padding: 6px 8px;
                text-align: right;
                border-bottom: 1px solid rgba(255, 255, 255, 0.05);
            }
            
            .stats-table th {
                color: var(--text-tertiary, #64748b);
                font-weight: 500;
                text-transform: uppercase;
                font-size: 10px;
                letter-spacing: 0.5px;
            }
            
            .stats-table td:first-child,
            .stats-table th:first-child {
                text-align: left;
            }
            
            .stats-table td {
                color: var(--text-primary, #f1f5f9);
                font-family: 'IBM Plex Mono', monospace;
            }
            
            .channel-red td:first-child { color: #ef4444; }
            .channel-green td:first-child { color: #22c55e; }
            .channel-blue td:first-child { color: #3b82f6; }
            .channel-lum td:first-child { color: #94a3b8; }
        `
        document.head.appendChild(style)
    }
    
    return content
}

/**
 * Open or focus image stats window
 */
export function openImageStatsWindow(editor) {
    if (editor) {
        imageEditor = editor
    }
    
    if (imageStatsWindow) {
        imageStatsWindow.focus()
        imageStatsWindow.show()
        updateStatsDisplay()
        return imageStatsWindow
    }
    
    const content = createStatsContent()
    
    imageStatsWindow = windowManager.createWindow({
        id: 'image-stats-panel',
        title: 'Image Statistics',
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 21H4.6c-.6 0-.9-.4-.9-1V3"></path>
            <path d="M7 14l4-4 4 4 5-5"></path>
        </svg>`,
        width: 360,
        height: 480,
        minWidth: 320,
        minHeight: 400,
        content,
        contentClass: 'no-padding',
        onClose: () => {
            imageStatsWindow = null
        },
        onCreate: (win) => {
            setTimeout(updateStatsDisplay, 100)
        }
    })
    
    return imageStatsWindow
}

/**
 * Close image stats window
 */
export function closeImageStatsWindow() {
    if (imageStatsWindow) {
        imageStatsWindow.close()
    }
}

/**
 * Check if stats window is open (exists and not closed)
 */
export function isImageStatsOpen() {
    return imageStatsWindow !== null
}

/**
 * Refresh stats if window is open
 */
export function refreshImageStats() {
    if (isImageStatsOpen()) {
        updateStatsDisplay()
    }
}
