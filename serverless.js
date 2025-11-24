let imageEditor = new ImageEditor('./images/IbisPaintedEdges.jpeg', 'Ibis', 'image/jpeg', 'jpeg')

imageEditor.defaultInterpolation(500, 500)
imageEditor.changeCanvasHSV(200, 100, 100)

imageEditor.quickExport()