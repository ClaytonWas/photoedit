import React from 'react';
import { DockviewReact, DockviewReadyEvent, IDockviewPanelProps } from 'dockview';

const DockviewExample = () => {
    const onReady = (event: DockviewReadyEvent) => {
        // Add panels to the dockview
        event.api.addPanel({
            id: 'panel_1',
            component: 'default',
            title: 'Panel 1',
        });
    
        event.api.addPanel({
            id: 'panel_2',
            component: 'default',
            title: 'Panel 2',
        });
    
        event.api.addPanel({
            id: 'panel_3',
            component: 'default',
            title: 'Panel 3',
        });
    
        // You can customize the layout here
        event.api.addPanel({
            id: 'panel_4',
            component: 'default',
            title: 'Panel 4',
            position: { referencePanel: 'panel_1', direction: 'right' },
        });
    };
    

    const components = {
        default: (props: IDockviewPanelProps<{ title: string }>) => {
            return (
                <div style={{ padding: '20px', color: 'white' }}>
                    {props.params.title}
                </div>
            );
        },
    };

    return (
        <DockviewReact
            onReady={onReady}
            components={components}
            className="dockview-theme-abyss"
        />
    );
};

export default DockviewExample;