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
    event.api.addPanel({ id: 'canvasPanel', component: 'canvasComponent', title: 'Canvas' });
    event.api.addPanel({ id: 'fillerPanel1', component: 'fillerComponent', title: 'Filler 1' });
    event.api.addPanel({ id: 'fillerPanel2', component: 'fillerComponent', title: 'Filler 2' });
    event.api.addPanel({ id: 'fillerPanel3', component: 'fillerComponent', title: 'Filler 3' });
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
          <div className="flex-1 flex h-full overflow-hidden p-4">
            <p>This is a filler panel.</p>
          </div>
        ),
      }}
      className="dockview-theme-replit h-full w-full"
    />
  );
};

export default DockviewExample;
