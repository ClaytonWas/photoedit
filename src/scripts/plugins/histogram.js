/**
 * Histogram Analysis Panel
 * 
 * Real-time histogram visualization with:
 * - RGB channel histograms
 * - Luminance histogram
 * - Color statistics
 * - Interactive channel toggles
 */

import { Chart, registerables } from 'chart.js'
import { windowManager } from '../core/windowManager.js'

// Register Chart.js components
Chart.register(...registerables)

// Histogram panel state
let histogramWindow = null
let histogramChart = null
let imageEditor = null
let updateQueued = false
let channelVisibility = {
    red: true,
    green: true,
    blue: true,
    luminance: true
}

// Debounce helper
function debounce(fn, delay) {
    let timeoutId
    return (...args) => {
        clearTimeout(timeoutId)
        timeoutId = setTimeout(() => fn(...args), delay)
    }
}

/**
 * Initialize histogram panel with editor reference
 */
export function initHistogram(editor) {
    imageEditor = editor
}

/**
 * Calculate histogram data from image data
 */
function calculateHistogram(imageData) {
    const data = imageData.data
    const red = new Uint32Array(256)
    const green = new Uint32Array(256)
    const blue = new Uint32Array(256)
    const luminance = new Uint32Array(256)
    
    let totalR = 0, totalG = 0, totalB = 0
    let minR = 255, minG = 255, minB = 255
    let maxR = 0, maxG = 0, maxB = 0
    const pixelCount = data.length / 4
    
    for (let i = 0; i < data.length; i += 4) {
        const r = data[i]
        const g = data[i + 1]
        const b = data[i + 2]
        // Skip fully transparent pixels
        if (data[i + 3] === 0) continue
        
        red[r]++
        green[g]++
        blue[b]++
        
        // Calculate luminance (Rec. 709 formula)
        const lum = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b)
        luminance[lum]++
        
        totalR += r
        totalG += g
        totalB += b
        
        minR = Math.min(minR, r)
        minG = Math.min(minG, g)
        minB = Math.min(minB, b)
        maxR = Math.max(maxR, r)
        maxG = Math.max(maxG, g)
        maxB = Math.max(maxB, b)
    }
    
    return {
        red: Array.from(red),
        green: Array.from(green),
        blue: Array.from(blue),
        luminance: Array.from(luminance),
        stats: {
            avgR: Math.round(totalR / pixelCount),
            avgG: Math.round(totalG / pixelCount),
            avgB: Math.round(totalB / pixelCount),
            minR, minG, minB,
            maxR, maxG, maxB,
            pixelCount
        }
    }
}

/**
 * Get image data from canvas
 */
function getImageData() {
    if (!imageEditor || !imageEditor.canvas) return null
    
    const ctx = imageEditor.canvas.getContext('2d')
    return ctx.getImageData(0, 0, imageEditor.canvas.width, imageEditor.canvas.height)
}

/**
 * Create or update the histogram chart
 */
function updateChart(histogramData) {
    const canvas = document.getElementById('histogramCanvas')
    if (!canvas) return
    
    const ctx = canvas.getContext('2d')
    
    // Normalize data for display
    const maxValue = Math.max(
        ...histogramData.red,
        ...histogramData.green,
        ...histogramData.blue,
        ...histogramData.luminance
    )
    
    const normalize = (arr) => arr.map(v => (v / maxValue) * 100)
    
    const labels = Array.from({ length: 256 }, (_, i) => i)
    
    const datasets = []
    
    if (channelVisibility.red) {
        datasets.push({
            label: 'Red',
            data: normalize(histogramData.red),
            borderColor: 'rgba(239, 68, 68, 0.8)',
            backgroundColor: 'rgba(239, 68, 68, 0.2)',
            fill: true,
            tension: 0.1,
            pointRadius: 0,
            borderWidth: 1.5
        })
    }
    
    if (channelVisibility.green) {
        datasets.push({
            label: 'Green',
            data: normalize(histogramData.green),
            borderColor: 'rgba(34, 197, 94, 0.8)',
            backgroundColor: 'rgba(34, 197, 94, 0.2)',
            fill: true,
            tension: 0.1,
            pointRadius: 0,
            borderWidth: 1.5
        })
    }
    
    if (channelVisibility.blue) {
        datasets.push({
            label: 'Blue',
            data: normalize(histogramData.blue),
            borderColor: 'rgba(59, 130, 246, 0.8)',
            backgroundColor: 'rgba(59, 130, 246, 0.2)',
            fill: true,
            tension: 0.1,
            pointRadius: 0,
            borderWidth: 1.5
        })
    }
    
    if (channelVisibility.luminance) {
        datasets.push({
            label: 'Luminance',
            data: normalize(histogramData.luminance),
            borderColor: 'rgba(148, 163, 184, 0.8)',
            backgroundColor: 'rgba(148, 163, 184, 0.15)',
            fill: true,
            tension: 0.1,
            pointRadius: 0,
            borderWidth: 1.5
        })
    }
    
    if (histogramChart) {
        histogramChart.data.datasets = datasets
        histogramChart.update('none')
    } else {
        histogramChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                interaction: {
                    intersect: false,
                    mode: 'index'
                },
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        enabled: true,
                        backgroundColor: 'rgba(30, 41, 59, 0.95)',
                        titleColor: '#f1f5f9',
                        bodyColor: '#94a3b8',
                        borderColor: 'rgba(255, 255, 255, 0.1)',
                        borderWidth: 1,
                        padding: 10,
                        displayColors: true,
                        callbacks: {
                            title: (items) => `Value: ${items[0].label}`,
                            label: (item) => `${item.dataset.label}: ${item.raw.toFixed(1)}%`
                        }
                    }
                },
                scales: {
                    x: {
                        display: true,
                        grid: {
                            display: false
                        },
                        ticks: {
                            display: true,
                            color: '#64748b',
                            font: { size: 10 },
                            maxTicksLimit: 5,
                            callback: (value) => value
                        },
                        title: {
                            display: true,
                            text: 'Intensity',
                            color: '#94a3b8',
                            font: { size: 11 }
                        }
                    },
                    y: {
                        display: true,
                        grid: {
                            color: 'rgba(255, 255, 255, 0.05)'
                        },
                        ticks: {
                            display: false
                        },
                        min: 0,
                        max: 100
                    }
                }
            }
        })
    }
    
    // Update stats
    updateStats(histogramData.stats)
}

/**
 * Update statistics display
 */
function updateStats(stats) {
    const statsEl = document.getElementById('histogramStats')
    if (!statsEl) return
    
    statsEl.innerHTML = `
        <div class="hist-stat-row">
            <span class="hist-stat-label">Dimensions:</span>
            <span class="hist-stat-value">${imageEditor?.canvas?.width || 0} × ${imageEditor?.canvas?.height || 0}</span>
        </div>
        <div class="hist-stat-row">
            <span class="hist-stat-label">Pixels:</span>
            <span class="hist-stat-value">${stats.pixelCount.toLocaleString()}</span>
        </div>
        <div class="hist-stat-divider"></div>
        <div class="hist-stat-row">
            <span class="hist-stat-label hist-red">Red Avg:</span>
            <span class="hist-stat-value">${stats.avgR} <span class="hist-range">(${stats.minR}-${stats.maxR})</span></span>
        </div>
        <div class="hist-stat-row">
            <span class="hist-stat-label hist-green">Green Avg:</span>
            <span class="hist-stat-value">${stats.avgG} <span class="hist-range">(${stats.minG}-${stats.maxG})</span></span>
        </div>
        <div class="hist-stat-row">
            <span class="hist-stat-label hist-blue">Blue Avg:</span>
            <span class="hist-stat-value">${stats.avgB} <span class="hist-range">(${stats.minB}-${stats.maxB})</span></span>
        </div>
    `
}

/**
 * Toggle channel visibility
 */
function toggleChannel(channel) {
    channelVisibility[channel] = !channelVisibility[channel]
    
    // Update button state
    const btn = document.querySelector(`[data-channel="${channel}"]`)
    if (btn) {
        btn.classList.toggle('active', channelVisibility[channel])
    }
    
    // Refresh histogram
    refreshHistogram()
}

/**
 * Refresh histogram with current image
 */
export const refreshHistogram = debounce(() => {
    if (!histogramWindow || !imageEditor) return
    
    const imageData = getImageData()
    if (!imageData) return
    
    const histogramData = calculateHistogram(imageData)
    updateChart(histogramData)
}, 100)

/**
 * Queue a histogram update (called frequently during editing)
 */
export function queueHistogramUpdate() {
    if (!histogramWindow) return
    refreshHistogram()
}

/**
 * Create histogram window content
 */
function createHistogramContent() {
    const content = document.createElement('div')
    content.className = 'histogram-panel'
    content.innerHTML = `
        <div class="hist-controls">
            <button class="hist-channel-btn active" data-channel="red" title="Red Channel">
                <span class="color-dot red"></span> R
            </button>
            <button class="hist-channel-btn active" data-channel="green" title="Green Channel">
                <span class="color-dot green"></span> G
            </button>
            <button class="hist-channel-btn active" data-channel="blue" title="Blue Channel">
                <span class="color-dot blue"></span> B
            </button>
            <button class="hist-channel-btn active" data-channel="luminance" title="Luminance">
                <span class="color-dot lum"></span> L
            </button>
            <button class="hist-refresh-btn" id="refreshHistogram" title="Refresh">↻</button>
        </div>
        <div class="hist-chart-container">
            <canvas id="histogramCanvas"></canvas>
        </div>
        <div class="hist-stats" id="histogramStats">
            <div class="hist-stat-row">
                <span class="hist-stat-label">No image loaded</span>
            </div>
        </div>
    `
    
    // Add styles
    const style = document.createElement('style')
    style.textContent = `
        .histogram-panel {
            display: flex;
            flex-direction: column;
            height: 100%;
            gap: 8px;
        }
        
        .hist-controls {
            display: flex;
            gap: 6px;
            flex-wrap: wrap;
        }
        
        .hist-channel-btn {
            display: flex;
            align-items: center;
            gap: 4px;
            padding: 6px 10px;
            background: var(--bg-tertiary, #334155);
            border: 1px solid transparent;
            border-radius: 6px;
            color: var(--text-secondary, #94a3b8);
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.15s ease;
            opacity: 0.5;
        }
        
        .hist-channel-btn.active {
            opacity: 1;
            border-color: rgba(255, 255, 255, 0.1);
        }
        
        .hist-channel-btn:hover {
            background: var(--bg-primary, #0f172a);
        }
        
        .color-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
        }
        
        .color-dot.red { background: #ef4444; }
        .color-dot.green { background: #22c55e; }
        .color-dot.blue { background: #3b82f6; }
        .color-dot.lum { background: #94a3b8; }
        
        .hist-refresh-btn {
            margin-left: auto;
            padding: 6px 10px;
            background: var(--bg-tertiary, #334155);
            border: none;
            border-radius: 6px;
            color: var(--text-secondary, #94a3b8);
            font-size: 14px;
            cursor: pointer;
            transition: all 0.15s ease;
        }
        
        .hist-refresh-btn:hover {
            background: var(--accent, #6366f1);
            color: white;
        }
        
        .hist-chart-container {
            flex: 1;
            min-height: 120px;
            position: relative;
        }
        
        .hist-stats {
            background: var(--bg-tertiary, #334155);
            border-radius: 6px;
            padding: 10px;
        }
        
        .hist-stat-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 3px 0;
        }
        
        .hist-stat-label {
            font-size: 12px;
            color: var(--text-secondary, #94a3b8);
        }
        
        .hist-stat-label.hist-red { color: #ef4444; }
        .hist-stat-label.hist-green { color: #22c55e; }
        .hist-stat-label.hist-blue { color: #3b82f6; }
        
        .hist-stat-value {
            font-size: 12px;
            font-weight: 600;
            color: var(--text-primary, #f1f5f9);
            font-family: 'IBM Plex Mono', monospace;
        }
        
        .hist-range {
            color: var(--text-tertiary, #64748b);
            font-weight: 400;
        }
        
        .hist-stat-divider {
            height: 1px;
            background: rgba(255, 255, 255, 0.1);
            margin: 6px 0;
        }
    `
    document.head.appendChild(style)
    
    return content
}

/**
 * Open or focus histogram window
 */
export function openHistogramWindow(editor) {
    if (editor) {
        imageEditor = editor
    }
    
    if (histogramWindow) {
        histogramWindow.focus()
        histogramWindow.show()
        refreshHistogram()
        return histogramWindow
    }
    
    const content = createHistogramContent()
    
    histogramWindow = windowManager.createWindow({
        id: 'histogram-panel',
        title: 'Histogram',
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 3v18h18"></path>
            <rect x="7" y="10" width="3" height="8" rx="1"></rect>
            <rect x="12" y="6" width="3" height="12" rx="1"></rect>
            <rect x="17" y="12" width="3" height="6" rx="1"></rect>
        </svg>`,
        width: 380,
        height: 340,
        minWidth: 300,
        minHeight: 280,
        content,
        contentClass: 'no-padding',
        onClose: () => {
            histogramWindow = null
            if (histogramChart) {
                histogramChart.destroy()
                histogramChart = null
            }
        },
        onResize: () => {
            if (histogramChart) {
                histogramChart.resize()
            }
        },
        onCreate: (win) => {
            // Setup event handlers
            const contentEl = win.getContentElement()
            
            contentEl.querySelectorAll('.hist-channel-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const channel = btn.dataset.channel
                    toggleChannel(channel)
                })
            })
            
            contentEl.querySelector('#refreshHistogram')?.addEventListener('click', () => {
                refreshHistogram()
            })
            
            // Initial update
            setTimeout(refreshHistogram, 100)
        }
    })
    
    return histogramWindow
}

/**
 * Close histogram window
 */
export function closeHistogramWindow() {
    if (histogramWindow) {
        histogramWindow.close()
    }
}

/**
 * Check if histogram is open
 */
export function isHistogramOpen() {
    return histogramWindow !== null && histogramWindow.isVisible()
}
