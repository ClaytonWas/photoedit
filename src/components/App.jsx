"use client";
import { useEffect, useRef, useState } from "react";
import ImageEditor from "@/scripts/core/imageEditor";
import { CanvasInteraction } from "@/components/CanvasInteraction";
import Navbar from "@/components/Navbar";

function PhotoEditor() {
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const resizerRef = useRef(null);
  const [imageEditor, setImageEditor] = useState(null);
  const [detailsWidth, setDetailsWidth] = useState(300); // Initial width of "Image Details"
  const [isResizing, setIsResizing] = useState(false);
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

  const handleMouseDownResize = (e) => {
    setIsResizing(true);
  
    // Add a CSS class to visually indicate resizing if necessary
    document.body.style.cursor = "col-resize";
  };
  
  const handleMouseMoveResize = (e) => {
    if (!isResizing) return;
  
    // Calculate the new width based on the mouse movement
    const newWidth = window.innerWidth - e.clientX;
    setDetailsWidth(Math.max(0, Math.min(newWidth, 1000))); // Constrain width between 0 and 1000px
  };
  
  const handleMouseUpResize = () => {
    setIsResizing(false);
  
    // Reset the cursor style
    document.body.style.cursor = "default";
  
    // Collapse the sidebar if it’s below a certain width
    if (detailsWidth < 200) setDetailsWidth(0);
  };
  
  useEffect(() => {
    // Add global mousemove and mouseup listeners for resizing
    window.addEventListener("mousemove", handleMouseMoveResize);
    window.addEventListener("mouseup", handleMouseUpResize);
  
    return () => {
      window.removeEventListener("mousemove", handleMouseMoveResize);
      window.removeEventListener("mouseup", handleMouseUpResize);
    };
  }, [isResizing, detailsWidth]);
  

  return (
    <main className="flex flex-col h-screen">
      <Navbar
        onUpload={uploadImage}
        onExport={quickExport}
      />

      <input
        type="file"
        ref={fileInputRef}
        style={{ display: "none" }}
        accept="image/*"
        onChange={uploadImage}
      />

      <div className="flex-1 flex">
        <div
          className="flex-1 justify-center items-center overflow-hidden bg-[var(--canvas-background)] cursor-grab active:cursor-grabbing"
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

        <div
          className="relative bg-[var(--background)] border-l-2 border-[var(--accent)] transition-all"
          style={{ width: `${detailsWidth}px` }}
        >
          <div
            ref={resizerRef}
            className="absolute left-0 top-0 h-full w-1 cursor-col-resize bg-[var(--taskbar-indent)]"
            onMouseDown={handleMouseDownResize}
          ></div>
          {detailsWidth > 0 && (
            <p className="text-[var(--text)] pl-4">Layers/Data Here</p>
          )}
        </div>
      </div>
    </main>
  );
}

export default PhotoEditor;
