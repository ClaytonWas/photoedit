function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max)
}

function rgbToHsv(r, g, b) {
    r /= 255
    g /= 255
    b /= 255

    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const delta = max - min

    let h = 0
    if (delta !== 0) {
        switch (max) {
            case r:
                h = ((g - b) / delta) % 6
                break
            case g:
                h = (b - r) / delta + 2
                break
            default:
                h = (r - g) / delta + 4
        }
        h *= 60
        if (h < 0) h += 360
    }

    const s = max === 0 ? 0 : delta / max
    const v = max
    return { h, s, v }
}

function hsvToRgb({ h, s, v }) {
    const c = v * s
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
    const m = v - c

    let r = 0, g = 0, b = 0

    if (0 <= h && h < 60) {
        r = c; g = x; b = 0
    } else if (60 <= h && h < 120) {
        r = x; g = c; b = 0
    } else if (120 <= h && h < 180) {
        r = 0; g = c; b = x
    } else if (180 <= h && h < 240) {
        r = 0; g = x; b = c
    } else if (240 <= h && h < 300) {
        r = x; g = 0; b = c
    } else {
        r = c; g = 0; b = x
    }

    return {
        r: Math.round((r + m) * 255),
        g: Math.round((g + m) * 255),
        b: Math.round((b + m) * 255)
    }
}

export function hsvAdjustment(image, parameters = {}) {
    const hueShift = Number(parameters.hue ?? 0)
    const saturationScale = Number(parameters.saturation ?? 100) / 100
    const brightnessScale = Number(parameters.brightness ?? 100) / 100

    const data = image.data
    for (let i = 0; i < data.length; i += 4) {
        const { h, s, v } = rgbToHsv(data[i], data[i + 1], data[i + 2])

        const shiftedHue = (h + hueShift + 360) % 360
        const scaledSaturation = clamp(s * saturationScale, 0, 1)
        const scaledValue = clamp(v * brightnessScale, 0, 1)

        const { r, g, b } = hsvToRgb({
            h: shiftedHue,
            s: scaledSaturation,
            v: scaledValue
        })

        data[i] = r
        data[i + 1] = g
        data[i + 2] = b
    }

    return image
}

