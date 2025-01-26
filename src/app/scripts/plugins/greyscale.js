export function greyscale(image) {
    let data = image.data
    
    let opacity = 1
    for (let i = 0; i < data.length; i += 4) {
        const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
        
        data[i] = data[i] * (1 - opacity) + avg;
        data[i + 1] = data[i + 1] * (1 - opacity) + avg * opacity;
        data[i + 2] = data[i + 2] * (1 - opacity) + avg * opacity;
    }
}