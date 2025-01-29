import React from 'react';
import { DockviewReact, DockviewReadyEvent } from 'dockview';

interface DockviewExampleProps {
  canvasRef: React.RefObject<HTMLCanvasElement>;
  canvasDivRef: React.RefObject<HTMLDivElement>;
  handleMouseDown: React.MouseEventHandler<HTMLDivElement>;
  handleMouseMove: React.MouseEventHandler<HTMLDivElement>;
  handleMouseUpOrLeave: React.MouseEventHandler<HTMLDivElement>;
}

const DockviewExample: React.FC<DockviewExampleProps> = ({
  canvasRef,
  canvasDivRef,
  handleMouseDown,
  handleMouseMove,
  handleMouseUpOrLeave,
}) => {
  const onReady = (event: DockviewReadyEvent) => {
    const isMobile = window.innerWidth <= 768; // Adjust breakpoint as needed

    event.api.addPanel({
      id: 'canvasPanel',
      component: 'canvasComponent',
      title: 'Canvas',
    });

    event.api.addPanel({
      id: 'detailsPanel',
      component: 'fillerComponent',
      title: 'Details',
      position: { referencePanel: 'canvasPanel', direction: 'right' },
      initialWidth: isMobile ? 150 : 600, // Smaller width on mobile
    });

    event.api.addPanel({
      id: 'layersPanel',
      component: 'fillerComponent',
      title: 'Layers',
      initialWidth: isMobile ? 150 : 600, // Smaller width on mobile
    });
  };

  return (
    <DockviewReact
      onReady={onReady}
      components={{
        canvasComponent: () => (
          <div
            className="flex-1 flex bg-[var(--canvas-background)] h-full overflow-hidden cursor-grab active:cursor-grabbing"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUpOrLeave}
            onMouseLeave={handleMouseUpOrLeave}
          >
            <div
              ref={canvasDivRef}
              className="relative w-full h-full max-w-full max-h-full flex justify-center items-center"
            >
              <canvas ref={canvasRef} id="imageCanvas" className="max-w-full max-h-full object-contain"></canvas>
            </div>
          </div>
        ),
        fillerComponent: () => (
          <div className="flex-1 flex h-full overflow-hidden p-4 bg-[var(--panel-background)] text-[var(--text)]">
            <p>This is a filler panel.</p>
          </div>
        ),
      }}
      className="dockview-theme-replit h-full w-full"
    />
  );
};

export default DockviewExample;
