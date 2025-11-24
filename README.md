# WebappPhotoedits
[website](https://photoedit.ca)


Photo manipulation software using JavaScript inspired by applications like Photoshop and Photopea.
Provding filter and image transformations. <br >

# Current Stage
A webapp that serves a photo manipulation user interface to a front-end user using Node.js and Express.js. 

This code is built on a programatic ImageEditor class instance, that handles front end interaction and performs image manipulations with context provided by an imagefile and HTML canvas. If no canvas is provided, it creates one internally. 

Currently in development.

### Showcase
[Version 0.2 Showcase](https://youtu.be/yxHyBOE9t0Q) This is not meant to be a comprehensive overview. <br >

### Instance
[On Render](https://webappphotoedits.onrender.com/) <br >
This may require some time open to reawaken the render instance as we are using the free tier.

### Installation
1. Install packages (built using Node v20.15.1):
   ```bash
   npm ci
   ```
2. Run local server:
   ```bash
   node server.js
   ```

### Images
Overview.
![Overview](./public/images/Example4.jpg)

Image imports working with front end users local storage.
![File Imports](./public/images/fileImportsOnUI.png)

Front end visualization of image.
![Image Import](./public/images/RosesOnImport.jpg)

Taskbar interaction that manipulates the image mapped to the canvas.
![Greyscaling](./public/images/RosesGreyscaleOnTaskbar.jpg)

#### Resulting Examples
![Gif2](./public/images/gif2.gif)

![Gif1](./public/images/vectors.gif)

![TheMajesticIbis](./public/images/IbisPaintedEdges.jpeg)


### TODO:
1. Finish interpolation types for resize module.
2. Get the plugins system to load into the handler on instantiation.
3. MASKS

