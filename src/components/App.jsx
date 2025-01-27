"use client";
import { useEffect, useRef, useState } from "react";
import ImageEditor from "@/scripts/core/imageEditor";
import { CanvasInteraction } from "@/components/CanvasInteraction";
import Navbar from "@/components/Navbar";

function PhotoEditor() {
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const [imageEditor, setImageEditor] = useState(null);
  const { canvasDivRef, handleMouseDown, handleMouseMove, handleMouseUpOrLeave } = CanvasInteraction();

  const uploadImage = async () => {
    fileInputRef.current?.click();

    const file = fileInputRef.current?.files[0];
    if (!file) return;

    if (imageEditor) {
      setImageEditor(null);
    }

    const reader = new FileReader();
    const image = new Image();

    const name = file.name.substring(0, file.name.lastIndexOf("."));
    const type = file.type;
    const extension = type.slice(6);
    const canvas = canvasRef.current;

    reader.onload = () => {
      image.src = reader.result;
    };

    image.onload = () => {
      const editor = new ImageEditor(image, name, type, extension, canvas);
      setImageEditor(editor);
      window.imageEditor = editor;

      const imageEditorInstantiationEvent = new CustomEvent("imageEditorReady", {
        detail: { instance: editor },
      });
      window.dispatchEvent(imageEditorInstantiationEvent);
      editor.loadImage();
    };

    reader.readAsDataURL(file);
  };

  const quickExport = () => {
    if (!imageEditor || !imageEditor.canvas) {
      console.error("No image to export!");
      return;
    }
  
    const exportAnchor = document.createElement("a");
    exportAnchor.href = imageEditor.canvas.toDataURL(imageEditor.type);
    exportAnchor.download = `${imageEditor.name}_PhotoEditsExport.${imageEditor.extension}`;
    exportAnchor.click();
  };

  const setHSV = () => {
    if (!imageEditor || !imageEditor.context) {
      console.error("No image to modify HSV!");
      return;
    }
    imageEditor.changeCanvasHSV(25, 100, 100);
  };
  
  const setSepia = (intensity) => {
    if (!imageEditor || !imageEditor.context || !imageEditor.canvas) {
      console.error("No image to apply the sepia filter!");
      return;
    }
    imageEditor.changeCanvasSepia(intensity);
  };

  const setRotate = (degrees) => {
    if (!imageEditor || !imageEditor.context) {
      console.error("No image to rotate!");
      return;
    }
    imageEditor.rotate(degrees);
  };

  const setGrayscale = (intensity) => {
    if (!imageEditor || !imageEditor.context) {
      console.error("No image to rotate!");
      return;
    }
    imageEditor.changeCanvasGrayscale(intensity);
  };

  return (
    <main className="flex flex-col h-screen">
      <Navbar
        onUpload={uploadImage}
        onExport={quickExport}
        onRotate={setRotate}
        onHSV={setHSV}
        onSepia={setSepia}
        onGrayscale={setGrayscale}
      />

      <input
        type="file"
        ref={fileInputRef}
        style={{ display: "none" }}
        accept="image/*"
        onChange={uploadImage}
      />

      <div
        className="flex-1 flex justify-center items-center overflow-hidden bg-[var(--canvas-background)] cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUpOrLeave}
        onMouseLeave={handleMouseUpOrLeave}
      >
        <div
          ref={canvasDivRef}
          className="relative w-full h-full max-w-full max-h-full"
          style={{ display: "flex", justifyContent: "center", alignItems: "center" }}
        >
          <canvas
            ref={canvasRef}
            id="imageCanvas"
            className="max-w-full max-h-full object-contain"
          ></canvas>
        </div>
      </div>
    </main>
  );
}

export default PhotoEditor;