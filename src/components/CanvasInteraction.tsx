import { useState, useRef, useEffect } from 'react';

export function CanvasInteraction() {
  const [isPanning, setIsPanning] = useState(false);
  const [startPoint, setStartPoint] = useState({ x: 0, y: 0 });
  const [currentTranslate, setCurrentTranslate] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const canvasDivRef = useRef<HTMLDivElement>(null); // Specify the type here

  const handleMouseDown = (event: React.MouseEvent) => {
    console.log("Mouse down - isPanning set to true");
    setIsPanning(true);
    setStartPoint({
      x: event.clientX - currentTranslate.x,
      y: event.clientY - currentTranslate.y,
    });
  };
  
  const handleMouseMove = (event: React.MouseEvent) => {
    if (!isPanning) {
      console.log("Mouse move ignored - isPanning is false");
      return;
    }
    console.log("Mouse move - updating translation");
    setCurrentTranslate({
      x: event.clientX - startPoint.x,
      y: event.clientY - startPoint.y,
    });
    updateTransform();
  };
  
  const handleMouseUpOrLeave = () => {
    console.log("Mouse up or leave - isPanning set to false");
    setIsPanning(false);
  };

  const updateTransform = () => {
    if (canvasDivRef.current) {
      canvasDivRef.current.style.transform = 
        `translate(${currentTranslate.x}px, ${currentTranslate.y}px) scale(${scale})`;
    }
  };

  const handleWheel = (event: WheelEvent) => {
    event.preventDefault();
    const rect = canvasDivRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    const beforeTransformX = (mouseX - currentTranslate.x) / scale;
    const beforeTransformY = (mouseY - currentTranslate.y) / scale;
    const newScale = event.deltaY < 0 ? scale * 1.1 : scale * 0.9;
    setScale(Math.min(Math.max(0.1, newScale), 20));
    const afterTransformX = (mouseX - currentTranslate.x) / newScale;
    const afterTransformY = (mouseY - currentTranslate.y) / newScale;
    setCurrentTranslate((prev) => ({
      x: prev.x + (afterTransformX - beforeTransformX) * newScale,
      y: prev.y + (afterTransformY - beforeTransformY) * newScale,
    }));
    updateTransform();
  };

  useEffect(() => {
    const element = canvasDivRef.current;
    if (element) {
      element.addEventListener("wheel", handleWheel, { passive: false });
      return () => {
        element.removeEventListener("wheel", handleWheel);
      };
    }
  }, [handleWheel]);

  return {
    canvasDivRef,
    isPanning,
    currentTranslate,
    scale,
    handleMouseDown,
    handleMouseMove,
    handleMouseUpOrLeave,
  };
}
