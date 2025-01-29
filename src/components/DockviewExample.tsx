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
    // Add the canvas panel
    event.api.addPanel({
      id: 'canvasPanel',
      component: 'canvasComponent',
      title: 'Canvas',
    });

    // Add a filler panel
    event.api.addPanel({
      id: 'fillerPanel1',
      component: 'fillerComponent',
      title: 'Filler 1',
    });

    // Add another filler panel
    event.api.addPanel({
      id: 'fillerPanel2',
      component: 'fillerComponent',
      title: 'Filler 2',
    });

    // Add yet another filler panel
    event.api.addPanel({
      id: 'fillerPanel3',
      component: 'fillerComponent',
      title: 'Filler 3',
    });
  };

  return (
    <DockviewReact
      onReady={onReady}
      components={{
        canvasComponent: () => {
          return (
            <div
              className="flex-1 flex h-full overflow-hidden cursor-grab active:cursor-grabbing"
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
        fillerComponent: () => {
          return (
            <div className="flex-1 flex h-full overflow-hidden bg-[var(--filler-background)] p-4">
              <p>This is a filler panel.</p>
            </div>
          );
        },
      }}
      className="dockview h-full w-full"
    />
  );
};

export default DockviewExample;