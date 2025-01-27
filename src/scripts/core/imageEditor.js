import { LayerManager } from './layers.js';

export default class ImageEditor {
    constructor(image, name, type, extension, canvas) {
        this.IMAGE = image
        /* this.IMAGE
        This is the Image() element that stores the original image:
          If anything bad happens to an image type, revert to this.
          This is your guiding light in the abyss.
          Do not overwrite this.
          Maintain in memory always.
          It's not inefficient, it's good redundancy.
          Affirm!
        */

        this.NAME = name 
        this.EXTENSION = extension                   
        this.TYPE = type
        /* this.XXXX
        Variables that are passed in from the larger File type that maps onto the class.
            Example Structure:
                Name:           squirrel
                Extension:      png
                Type:           image/png 
        */
 


        
        this.image = this.IMAGE                     // Used to resize images from from the original image dimensions while allowing overwrites.
        this.type = this.TYPE
        this.name = this.NAME
        this.extension = this.EXTENSION

        this.canvas = canvas
        this.context = canvas.getContext("2d")

        // Created Image Data
        this.modifiedImage = this.image
        this.layerManager = new LayerManager()
        this.canvas.width = this.IMAGE.width
        this.canvas.height = this.IMAGE.height
    }

    // loadImage loads a canvas with the original image data.
    loadImage() {
        this.context.drawImage(this.IMAGE, 0, 0)
    }

    //  resetImage() sets canvas and image to this.IMAGE
    resetImage() {
        this.image = this.IMAGE
        this.canvas.width = this.IMAGE.width
        this.canvas.height = this.IMAGE.height
    }

    quickExport() {
        let exportAnchor = document.createElement('a')
        exportAnchor.href = this.canvas.toDataURL(this.type)
        exportAnchor.download = `${this.name}_PhotoEditsExport.${this.extension}`
        exportAnchor.click()
    }

    setType(type) {
        this.type = type
    }

    setName(name) {
        this.name = name
    }

    setExtension(extension) {
        this.extension = extension
    }

    changeFileType(name, extension) {
        this.setName(name)
        this.setExtenstion(extension)
        this.setType(`image/${extension}`)
    }

    renderImage() {
        this.modifiedImage = this.image
        this.context.drawImage(this.modifiedImage, 0, 0)
        const imageData = this.context.getImageData(0, 0, this.canvas.width, this.canvas.height)
        
        this.layerManager.applyLayerEffects(imageData)

        this.context.putImageData(imageData, 0, 0)
    }

    //bilinearInterpolation(newWidth, newHeight) {}

    //nearestNeighbourInterpolation(newWidth, newHeight) {}

    // Uses the browsers default setting for context.drawImage() calls
    defaultInterpolation(newWidth, newHeight) {
        const tempCanvas = document.createElement('canvas');
        const tempContext = tempCanvas.getContext('2d');

        tempCanvas.width = newWidth;
        tempCanvas.height = newHeight;

        //Currently this is doing lininterp.
        tempContext.drawImage(this.image, 0, 0, newWidth, newHeight); // Make a linear interpolation that works with this new data type.

        // Create new Image from the tempCanvas Context
        let resizedImage = new Image();
        resizedImage.src = tempCanvas.toDataURL(this.TYPE);
        resizedImage.onload = () => {
            this.image = resizedImage;
            this.context.drawImage(resizedImage, 0, 0);
            this.canvas.width = newWidth;
            this.canvas.height = newHeight;
            this.renderImage()
        };

        tempCanvas.remove()
    }

    resizeCanvas(newHeight, newWidth, maintainAspectRatio, interpolationType) {
        console.log('Passing through: ', newHeight, newWidth, maintainAspectRatio, interpolationType)
        if (interpolationType === "Default") {
            console.log("Default Interpolation Chosen")
            this.defaultInterpolation(newWidth, newHeight)
        } else if (interpolationType === "Nearest Neighbour") {
            console.log("Nearest Neighbour Interpolation Chosen")
            this.nearestNeighbourInterpolation(newWidth, newHeight)
        } else if (interpolationType === "Bilinear") {
            console.log("Bilinear Interpolation Chosen")
            this.bilinearInterpolation(newWidth, newHeight)
        }
        this.renderImage()
    }

    toggleVisibility(index) {
        this.layerManager.toggleVisibility(index)
        this.renderImage()
    }

    addLayer() {
        this.layerManager.addLayer()
    }

    deleteLayer(index) {
        this.layerManager.deleteLayer(index)
        this.renderImage()
    }

    setSelectedIndex(index) {
        if(index == null) {
            this.layerManager.selectedLayerIndex = null
        } else if (this.layerManager.layers[index]) {
            this.layerManager.selectedLayerIndex = index
        } else {
            console.log(`Layer at index ${index} does not exist. Selected index not updated.`)
        }
    }

    getSelectedIndex() {
        return this.layerManager.selectedLayerIndex
    }

    changeCanvasHSV(hue, saturate, brightness) {
        // Reset canvas and reapply base image
        this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.context.drawImage(this.image, 0, 0);
    
        // Apply filter
        this.context.filter = `
            hue-rotate(${hue}deg)
            saturate(${saturate}%)
            brightness(${brightness}%)
        `;
        this.context.drawImage(this.image, 0, 0);
    
        // Reset the filter
        this.context.filter = "none";
    
        // Update the modified image state
        this.image = new Image();
        this.image.src = this.canvas.toDataURL(this.TYPE);
    }

    changeCanvasSepia(intensity) {
        // Reset canvas and reapply base image
        this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.context.drawImage(this.image, 0, 0);
    
        // Apply filter
        this.context.filter = `
            sepia(${intensity}%)
        `;
        this.context.drawImage(this.image, 0, 0);
    
        // Reset the filter
        this.context.filter = "none";
    
        // Update the modified image state
        this.image = new Image();
        this.image.src = this.canvas.toDataURL(this.TYPE);
    }

    changeCanvasGrayscale(intensity) {
        // Reset canvas and reapply base image
        this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.context.drawImage(this.image, 0, 0);
    
        // Apply filter
        this.context.filter = `
            grayscale(${intensity}%)
        `;
        this.context.drawImage(this.image, 0, 0);
    
        // Reset the filter
        this.context.filter = "none";
    
        // Update the modified image state
        this.image = new Image();
        this.image.src = this.canvas.toDataURL(this.TYPE);
    }

    crop(originHeight, originWidth, endHeight, endWidth) {
        let newHeight = Math.abs(endHeight - originHeight);
        let newWidth = Math.abs(endWidth - originWidth);
      
        this.canvas.width = newWidth;
        this.canvas.height = newHeight;
      
        this.context.drawImage(this.image, originWidth, originHeight, newWidth, newHeight, 0, 0, newWidth, newHeight);
      
        this.image = new Image();
        this.image.src = this.canvas.toDataURL(this.TYPE)
    }

    
    rotate(angle) {
        return new Promise((resolve) => {
            const radians = (angle * Math.PI) / 180;
    
            // Determine if width and height need to be swapped
            const isRightAngle = angle % 90 === 0;
            const swap = (angle % 180 !== 0) && isRightAngle;
            const newWidth = swap ? this.canvas.height : this.canvas.width;
            const newHeight = swap ? this.canvas.width : this.canvas.height;
    
            // Update canvas dimensions and center transform
            this.canvas.width = newWidth;
            this.canvas.height = newHeight;
            this.context.setTransform(1, 0, 0, 1, newWidth / 2, newHeight / 2);
            this.context.rotate(radians);
    
            // Draw the rotated image
            this.context.drawImage(this.image, -this.image.width / 2, -this.image.height / 2);
    
            // Reset transform
            this.context.setTransform(1, 0, 0, 1, 0, 0);
    
            // Update the modified image state
            const rotatedImage = new Image();
            rotatedImage.src = this.canvas.toDataURL(this.TYPE);
            rotatedImage.onload = () => {
                this.image = rotatedImage;
    
                // Render layers and resolve the promise
                this.renderImage();
                resolve();
            };
        });
    }
}