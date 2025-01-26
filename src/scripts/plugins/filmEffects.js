export function filmEffects(image, parameters = {}) {
    let data = image.data
    
    const contrast = parameters.contrast ?? 1.0
    const colourPalette = parameters.colourPalette ?? 0

    for (let i = 0; i < data.length; i += 4) {
        for (let j = 0; j < 3; j++) {
            if (data[i + j] < contrast) {
                data[i + j] = 0;
            }
        }

        data[i] = data[i] + colourPalette;
        data[i + 1] = data[i + 1];
        data[i + 2] = data[i + 2] - colourPalette;
    }
}
