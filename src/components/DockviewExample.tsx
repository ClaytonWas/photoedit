import React, { useEffect, useRef } from 'react';
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
  const dockviewApiRef = useRef<any>(null);

  const calculatePanelWidth = () => {
    const oneThirdWidth = window.innerWidth / 3;
    return Math.min(oneThirdWidth, 500); // Cap the width at 800px
  };

  const onReady = (event: DockviewReadyEvent) => {
    dockviewApiRef.current = event.api;

    const panelWidth = calculatePanelWidth();

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
      initialWidth: panelWidth,
    });

    event.api.addPanel({
      id: 'layersPanel',
      component: 'fillerComponent',
      title: 'Layers',
      initialWidth: panelWidth,
    });
  };

  useEffect(() => {
    const handleResize = () => {
      if (dockviewApiRef.current) {
        const panelWidth = calculatePanelWidth();
        const detailsPanel = dockviewApiRef.current.getPanel('detailsPanel');
        const layersPanel = dockviewApiRef.current.getPanel('layersPanel');

        if (detailsPanel) {
          detailsPanel.api.setSize({ width: panelWidth });
        }
        if (layersPanel) {
          layersPanel.api.setSize({ width: panelWidth });
        }
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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