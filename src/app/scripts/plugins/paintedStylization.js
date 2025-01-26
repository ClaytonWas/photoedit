export function paintedStylization(image, parameters = {}) {
    const strokeWidth = parameters.width ?? 5
    const strokeLength = parameters.length ?? 5
    const distanceBetweenSamples = parameters.sampling * 4 ?? 40
    const edgeThreshold = parameters.edgeThreshold ?? 100
    const overwritePixels = parameters.overwritePixels ?? false
    const overwriteEdges = parameters.overwriteEdges ?? false
    
    const degrees = parameters.angle ?? 45
    const radians = degrees * (Math.PI / 180)

    // Map of edges with intensity values.
    const edgeMap = calculateEdgeMap(image)
    
    // Set consisting of sampled points.
    const samplePoints = new Set()
    for (let i = 0; i < image.data.length; i += distanceBetweenSamples) {
        const x = (i / 4) % image.width
        const y = Math.floor((i / 4) / image.width)
        samplePoints.add(`${x},${y}`)
    }

    // Process each sample point
    for (let i = 0; i < image.data.length; i += distanceBetweenSamples) {
        const currentPixel = i / 4
        const x = currentPixel % image.width
        const y = Math.floor(currentPixel / image.width)

        const originalPixelValues = {
            r: image.data[i],
            g: image.data[i + 1],
            b: image.data[i + 2]
        }

        strokeDrawing: {
            for (let currentLengthValueOfLine = 0; currentLengthValueOfLine < strokeLength; currentLengthValueOfLine += 0.5) {
                for (let currentWidthValueOfLine = -strokeWidth / 2; currentWidthValueOfLine < strokeWidth / 2; currentWidthValueOfLine += 0.5) {
                    const vectorX = Math.floor(x + Math.cos(radians) * currentLengthValueOfLine + Math.cos(radians + Math.PI / 2) * currentWidthValueOfLine)
                    const vectorY = Math.floor(y + Math.sin(radians) * currentLengthValueOfLine + Math.sin(radians + Math.PI / 2) * currentWidthValueOfLine)
                    
                    const dataIndex = (vectorY * image.width + vectorX) * 4;

                    // If 'continue', point is skipped if it is a future sample point to prevent recasting the same colour.
                    if (samplePoints.has(`${vectorX},${vectorY}`) && !overwritePixels) continue

                    // Check for edge presence
                    const edgeIndex = vectorY * image.width + vectorX
                    if (edgeMap[edgeIndex] > edgeThreshold && !overwriteEdges) break strokeDrawing

                    // Draw pixel if within bounds
                    if (vectorX >= 0 && vectorX < image.width && vectorY >= 0 && dataIndex < image.data.length - 2) {
                        image.data[dataIndex] = originalPixelValues.r
                        image.data[dataIndex + 1] = originalPixelValues.g
                        image.data[dataIndex + 2] = originalPixelValues.b
                        image.data[dataIndex + 3] = 255
                    }
                }
            }
        }
    }

    return image.data;
}

// Helper function to calculate edge map using a specific kernel.
function calculateEdgeMap(image) {
    const edgeMap = new Uint8Array(image.data)

    // Currently Sobel Kernel
    const kernelXFilter = [-1, 0, 1,
                            -2, 0, 2,
                            -1, 0, 1]
    const kernelYFilter = [-1, -2, -1, 
                            0, 0, 0,
                            1, 2, 1]

    // Pixel Processing
    for (let y = 0; y < image.height; y++) {
        for (let x = 0; x < image.width; x++) {
            let gradientX = 0
            let gradientY = 0

            // Apply Sobel operator
            for (let kernelY = -1; kernelY <= 1; kernelY++) {
                for (let kernelX = -1; kernelX <= 1; kernelX++) {
                    // Calculate neighbor pixel position
                    const neighbourX = x + kernelX
                    const neighbourY = y + kernelY

                    // Logic to handle neighbour pixels not existing at image borders.
                    const validX = Math.max(0, Math.min(image.width - 1, neighbourX))
                    const validY = Math.max(0, Math.min(image.height - 1, neighbourY))

                    let i = (validY * image.width + validX) * 4
                    const pixelIntensity = (image.data[i] + image.data[i + 1] + image.data[i + 2]) / 3
                    const kernelIndex = (kernelY + 1) * 3 + (kernelX + 1)
                    
                    gradientX += pixelIntensity * kernelXFilter[kernelIndex]
                    gradientY += pixelIntensity * kernelYFilter[kernelIndex]
                }
            }

            // Calculate gradient magnitude
            const magnitude = Math.sqrt(Math.pow(gradientX, 2) + Math.pow(gradientY, 2))
            edgeMap[y * image.width + x] = Math.min(255, magnitude)
        }
    }

    return edgeMap
}


export function pointsInSpace(image, parameters = {}) {
    let data = image.data

    const distanceBetweenSamples = parameters.sampling * 4 ?? 40        // Distance between pixels to be sampled. Multiplied by 4 because [R, G, B, A] = 4

    // Get the points you want to sample from.
    for (let i = 0; i < data.length; i += distanceBetweenSamples) {        
        data[i] = 255
        data[i+1] = 255
        data[i+2] = 255
    }

    console.log(data)
}

export function vectorsInSpace(image, parameters = {}) {
    const strokeWidth = parameters.width ?? 1
    const strokeLength = parameters.length ?? 3
    const distanceBetweenSamples = parameters.sampling * 4 ?? 40        
    const r = parameters.R ?? 255
    const g = parameters.G ?? 255
    const b = parameters.B ?? 255
    const a = parameters.A ?? 255

    const degrees = parameters.angle ?? 90
    const radians = (degrees * Math.PI) / 180

    for (let i = 0; i < image.data.length; i += distanceBetweenSamples) {
        const currentPixel = (i/4)
        const x = currentPixel % image.width
        const y = Math.floor(currentPixel / image.width)

        // Currently steps by 0.5 instead of 1 because of issues with some angles.
        for (let currentLengthValueOfLine = 0; currentLengthValueOfLine < strokeLength; currentLengthValueOfLine += 0.5) {
            for (let currentWidthValueOfLine = -strokeWidth/2; currentWidthValueOfLine < strokeWidth/2; currentWidthValueOfLine += 0.5) {
                const vectorX = Math.floor(x + Math.cos(radians) * currentLengthValueOfLine + Math.cos(radians + Math.PI / 2) * currentWidthValueOfLine)
                const vectorY = Math.floor(y + Math.sin(radians) * currentLengthValueOfLine + Math.sin(radians + Math.PI / 2) * currentWidthValueOfLine)
    
                const currentDrawIndex = (vectorY * image.width + vectorX) * 4
    
                if (vectorX >= 0 && vectorX < image.width && vectorY >= 0 && currentDrawIndex < image.data.length - 2) {
                    image.data[currentDrawIndex] = r
                    image.data[currentDrawIndex + 1] = g
                    image.data[currentDrawIndex + 2] = b
                    image.data[currentDrawIndex + 3] = a
                }
            }
        }
    }


    return image.data
}

export function sobelEdges(image, parameters = {}) {
    const referenceImageData = new Uint8ClampedArray(image.data)
    const edgeThreshold = parameters.edgeThreshold ?? 100
    const blackoutBackground = parameters.blackoutBackground ?? true
    const transparentBackground = parameters.transparentBackground ?? false
    
    // Kernels
    const sobelX = [-1, 0, 1,
                    -2, 0, 2,
                    -1, 0, 1]

    const sobelY = [-1, -2, -1, 
                     0, 0, 0,
                     1, 2, 1]

    if (blackoutBackground && !transparentBackground) {
        // Set image to black rectangle.
        for (let i = 0; i < image.data.length; i += 4) {
            image.data[i] = 0
            image.data[i + 1] = 0
            image.data[i + 2] = 0
            image.data[i + 3] = 255
        }   
    }

    // Pixel Processing
    for (let y = 0; y < image.height; y++) {
        for (let x = 0; x < image.width; x++) {
            let gradientX = 0
            let gradientY = 0

            // Apply Sobel operator
            for (let kernelY = -1; kernelY <= 1; kernelY++) {
                for (let kernelX = -1; kernelX <= 1; kernelX++) {
                    // Calculate neighbor pixel position
                    const neighbourX = x + kernelX
                    const neighbourY = y + kernelY

                    // Logic to handle neighbour pixels not existing at image borders.
                    const validX = Math.max(0, Math.min(image.width - 1, neighbourX))
                    const validY = Math.max(0, Math.min(image.height - 1, neighbourY))

                    let i = (validY * image.width + validX) * 4
                    const pixelIntensity = (referenceImageData[i] + referenceImageData[i + 1] + referenceImageData[i + 2]) / 3
                    const kernelIndex = (kernelY + 1) * 3 + (kernelX + 1)
                    
                    gradientX += pixelIntensity * sobelX[kernelIndex]
                    gradientY += pixelIntensity * sobelY[kernelIndex]
                }
            }

            // Calculate gradient magnitude.
            // magnitude = √[(∂f/∂x)² + (∂f/∂y)²]
            const magnitude = Math.sqrt(Math.pow(gradientX, 2) + Math.pow(gradientY, 2))
            
            // Draw white if the magnitude of intesntiy change in both directions is above the selected threshold.
            if (magnitude > edgeThreshold) {
                let i = (y * image.width + x) * 4

                image.data[i] = 255
                image.data[i + 1] = 255
                image.data[i + 2] = 255
            } else if (transparentBackground) {
                image.data[(y*image.width + x)*4 + 3] = 0
            }
        }
    }

    return image.data
}

export function sobelEdgesColouredDirections(image, parameters = {}) {
    const referenceImageData = new Uint8ClampedArray(image.data)
    const edgeThreshold = parameters.edgeThreshold ?? 100
    const blackoutBackground = parameters.blackoutBackground ?? true
    const transparentBackground = parameters.transparentBackground ?? false
    
    // Kernels
    const sobelX = [-1, 0, 1,
                    -2, 0, 2,
                    -1, 0, 1]

    const sobelY = [-1, -2, -1, 
                     0, 0, 0,
                     1, 2, 1]

    if (blackoutBackground && !transparentBackground) {
        // Set image to black rectangle.
        for (let i = 0; i < image.data.length; i += 4) {
            image.data[i] = 0
            image.data[i + 1] = 0
            image.data[i + 2] = 0
            image.data[i + 3] = 255
        }   
    }

    // Pixel Processing
    for (let y = 0; y < image.height; y++) {
        for (let x = 0; x < image.width; x++) {
            let gradientX = 0
            let gradientY = 0

            // Apply Sobel operator
            for (let kernelY = -1; kernelY <= 1; kernelY++) {
                for (let kernelX = -1; kernelX <= 1; kernelX++) {
                    // Calculate neighbor pixel position
                    const neighbourX = x + kernelX
                    const neighbourY = y + kernelY

                    // Logic to handle neighbour pixels not existing at image borders.
                    const validX = Math.max(0, Math.min(image.width - 1, neighbourX))
                    const validY = Math.max(0, Math.min(image.height - 1, neighbourY))

                    let i = (validY * image.width + validX) * 4
                    const pixelIntensity = (referenceImageData[i] + referenceImageData[i + 1] + referenceImageData[i + 2]) / 3
                    const kernelIndex = (kernelY + 1) * 3 + (kernelX + 1)
                    
                    gradientX += pixelIntensity * sobelX[kernelIndex]
                    gradientY += pixelIntensity * sobelY[kernelIndex]
                }
            }

            // Calculate gradient magnitude.
            // magnitude = √[(∂f/∂x)² + (∂f/∂y)²]
            const magnitude = Math.sqrt(Math.pow(gradientX, 2) + Math.pow(gradientY, 2))
            
            // Draw white if the magnitude of intesntiy change in both directions is above the selected threshold.
            if (magnitude > edgeThreshold) {
                let i = (y * image.width + x) * 4

                // Normalize gradients to [0, 1] range
                const normalizedX = Math.abs(gradientX) / magnitude
                const normalizedY = Math.abs(gradientY) / magnitude
                
                // Calculate color components:
                // Red: horizontal edges (x gradient)
                // Green: vertical edges (y gradient)
                // Blue: diagonal edges (combined x+y)
                image.data[i] = Math.floor(normalizedX * 255)
                image.data[i + 1] = Math.floor(normalizedY * 255)
                image.data[i + 2] = Math.floor(normalizedX * normalizedY * 255)
            } else if (transparentBackground) {
                image.data[(y*image.width + x)*4 + 3] = 0
            }
        }
    }

    return image.data
}

export function prewireEdges(image, parameters = {}) {
    const referenceImageData = new Uint8ClampedArray(image.data)
    const edgeThreshold = parameters.edgeThreshold ?? 100
    const blackoutBackground = parameters.blackoutBackground ?? true
    const transparentBackground = parameters.transparentBackground ?? false
    
    // Kernels
    const prewireX = [-1, 0, 1,
                    -1, 0, 1,
                    -1, 0, 1]

    const prewireY = [1, 1, 1, 
                     0, 0, 0,
                     -1, -1, -1]

    if (blackoutBackground && !transparentBackground) {
        // Set image to black rectangle.
        for (let i = 0; i < image.data.length; i += 4) {
            image.data[i] = 0
            image.data[i + 1] = 0
            image.data[i + 2] = 0
            image.data[i + 3] = 255
        }   
    }


    // Pixel Processing
    for (let y = 0; y < image.height; y++) {
        for (let x = 0; x < image.width; x++) {
            let gradientX = 0
            let gradientY = 0

            // Apply Sobel operator
            for (let kernelY = -1; kernelY <= 1; kernelY++) {
                for (let kernelX = -1; kernelX <= 1; kernelX++) {
                    // Calculate neighbor pixel position
                    const neighbourX = x + kernelX
                    const neighbourY = y + kernelY

                    // Logic to handle neighbour pixels not existing at image borders.
                    const validX = Math.max(0, Math.min(image.width - 1, neighbourX))
                    const validY = Math.max(0, Math.min(image.height - 1, neighbourY))

                    let i = (validY * image.width + validX) * 4
                    const pixelIntensity = (referenceImageData[i] + referenceImageData[i + 1] + referenceImageData[i + 2]) / 3
                    const kernelIndex = (kernelY + 1) * 3 + (kernelX + 1)
                    
                    gradientX += pixelIntensity * prewireX[kernelIndex]
                    gradientY += pixelIntensity * prewireY[kernelIndex]
                }
            }

            // Calculate gradient magnitude.
            // magnitude = √[(∂f/∂x)² + (∂f/∂y)²]
            const magnitude = Math.sqrt(Math.pow(gradientX, 2) + Math.pow(gradientY, 2))
            
            // Draw white if the magnitude of intesntiy change in both directions is above the selected threshold.
            let i = (y * image.width + x) * 4
            if (magnitude > edgeThreshold) {
                image.data[i] = 255
                image.data[i + 1] = 255
                image.data[i + 2] = 255
            } else if (transparentBackground) {
                image.data[(y*image.width + x)*4 + 3] = 0
            }
        }
    }

    return image.data
}

export function prewireEdgesColouredDirections(image, parameters = {}) {
    const referenceImageData = new Uint8ClampedArray(image.data)
    const edgeThreshold = parameters.edgeThreshold ?? 100
    const blackoutBackground = parameters.blackoutBackground ?? true
    const transparentBackground = parameters.transparentBackground ?? false
    
    // Kernels
    const prewireX = [-1, 0, 1,
                    -1, 0, 1,
                    -1, 0, 1]

    const prewireY = [1, 1, 1, 
                    0, 0, 0,
                    -1, -1, -1]

    if (blackoutBackground && !transparentBackground) {
        // Set image to black rectangle.
        for (let i = 0; i < image.data.length; i += 4) {
            image.data[i] = 0
            image.data[i + 1] = 0
            image.data[i + 2] = 0
            image.data[i + 3] = 255
        }   
    }

    // Pixel Processing
    for (let y = 0; y < image.height; y++) {
        for (let x = 0; x < image.width; x++) {
            let gradientX = 0
            let gradientY = 0

            // Apply Sobel operator
            for (let kernelY = -1; kernelY <= 1; kernelY++) {
                for (let kernelX = -1; kernelX <= 1; kernelX++) {
                    // Calculate neighbor pixel position
                    const neighbourX = x + kernelX
                    const neighbourY = y + kernelY

                    // Logic to handle neighbour pixels not existing at image borders.
                    const validX = Math.max(0, Math.min(image.width - 1, neighbourX))
                    const validY = Math.max(0, Math.min(image.height - 1, neighbourY))

                    let i = (validY * image.width + validX) * 4
                    const pixelIntensity = (referenceImageData[i] + referenceImageData[i + 1] + referenceImageData[i + 2]) / 3
                    const kernelIndex = (kernelY + 1) * 3 + (kernelX + 1)
                    
                    gradientX += pixelIntensity * prewireX[kernelIndex]
                    gradientY += pixelIntensity * prewireY[kernelIndex]
                }
            }

            // Calculate gradient magnitude.
            // magnitude = √[(∂f/∂x)² + (∂f/∂y)²]
            const magnitude = Math.sqrt(Math.pow(gradientX, 2) + Math.pow(gradientY, 2))
            
            if (magnitude > edgeThreshold) {
                let i = (y * image.width + x) * 4

                // Normalize gradients to [0, 1] range
                const normalizedX = Math.abs(gradientX) / magnitude
                const normalizedY = Math.abs(gradientY) / magnitude
                
                // Calculate color components:
                // Red: horizontal edges (x gradient)
                // Green: vertical edges (y gradient)
                // Blue: diagonal edges (combined x+y)
                image.data[i] = Math.floor(normalizedX * 255)
                image.data[i + 1] = Math.floor(normalizedY * 255)
                image.data[i + 2] = Math.floor(normalizedX * normalizedY * 255)
            } else if (transparentBackground) {
                image.data[(y*image.width + x)*4 + 3] = 0
            }
        }
    }

    return image.data
}