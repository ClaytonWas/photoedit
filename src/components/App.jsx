"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CanvasInteraction } from "./CanvasInteraction";
import ImageEditor from "../scripts/core/imageEditor";
import Dropdown from "./TaskbarDropdown";

function PhotoEditor() {
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null); // Reference for file input
  const [imageEditor, setImageEditor] = useState(null);
  const { canvasDivRef, handleMouseDown, handleMouseMove, handleMouseUpOrLeave } = CanvasInteraction();

  const uploadImage = async () => {
    fileInputRef.current?.click();

    const file = fileInputRef.current?.files[0]; // Access the file input
    if (!file) return;

    // Reset editor (if needed)
    if (imageEditor) {
      setImageEditor(null);
    }

    const reader = new FileReader();
    const image = new Image();

    // Extract metadata from the file
    const name = file.name.substring(0, file.name.lastIndexOf("."));
    const type = file.type;
    const extension = type.slice(6);
    const canvas = canvasRef.current;

    // Load image data into the Image instance
    reader.onload = () => {
      image.src = reader.result;
    };

    image.onload = () => {
      const editor = new ImageEditor(image, name, type, extension, canvas);
      setImageEditor(editor); // Save the instance to state
      window.imageEditor = editor; // Optional: Expose globally for debugging

      // Dispatch a custom event for ImageEditor readiness
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
    exportAnchor.href = imageEditor.canvas.toDataURL(imageEditor.type); // Access the canvas and type from imageEditor
    exportAnchor.download = `${imageEditor.name}_PhotoEditsExport.${imageEditor.extension}`;
    exportAnchor.click();
  };
  

  const setHSV = () => {
    if (!imageEditor || !imageEditor.context) {
      console.error("No image to modify HSV!");
      return;
    }

    imageEditor.changeCanvasHSV(25, 100, 100)
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
      {/* Taskbar */}
      <div className="flex justify-between bg-[var(--background)] w-full px-2 pt-1 text-lg border-b border-[var(--accent)]">
        <nav className="flex">
          <Dropdown
            title="File"
            items={[
              { label: "Open", onClick: uploadImage },
              { label: "Export", onClick: quickExport },
            ]}
          />
          <Dropdown
            title="Image"
            items={[
              { label: "Rotate 90", onClick: () => setRotate(90) },
              { label: "Rotate 180", onClick: () => setRotate(180) },
            ]}
          />
          <Dropdown
            title="Filters"
            items={[
              { label: "HSV", onClick: setHSV },
              { label: "Sepia", onClick: () => setSepia(100) },
              { label: "Grayscale", onClick: () => setGrayscale(100) },
            ]}
          />
        </nav>

        <Link href="/about" className="border border-[var(--accent)] border-b-transparent text-[var(--text)] text-xs rounded-t md:text-base bg-[var(--taskbar-indent)] hover:bg-[var(--taskbar-hover)] px-2">About</Link>
      </div>

      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: "none" }} // Hide the input
        accept="image/*"
        onChange={uploadImage} // Trigger image upload
      />

      {/* Canvas Area */}
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
