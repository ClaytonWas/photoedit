import React, { RefObject } from 'react';
import { DockviewReact, DockviewReadyEvent } from 'dockview';

interface DockviewExampleProps {
  canvasRef: RefObject<HTMLCanvasElement>;
  canvasDivRef: RefObject<HTMLDivElement>;
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
    const canvasPanel = event.api.addPanel({
      id: 'canvasPanel',
      component: 'canvasComponent',
      title: 'Canvas',
    });
  };

  return (
    <DockviewReact
      onReady={onReady}
      components={{
        canvasComponent: () => {
          return (
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
                style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}
              >
                <canvas
                  ref={canvasRef}
                  id="imageCanvas"
                  className="max-w-full max-h-full object-contain"
                ></canvas>
              </div>
            </div>
          );
        },
      }}
      className="dockview-theme-light dark:dockview-theme-abyss h-full w-full"
    />
  );
};

export default DockviewExample;
