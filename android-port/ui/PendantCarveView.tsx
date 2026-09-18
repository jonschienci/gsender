import { useLayoutEffect, useRef } from 'react';
import BottomDrawer from '../../src/pendant/src/components/BottomDrawer';
import DROCard from '../../src/pendant/src/components/DROCard';
import JoggingCard from '../../src/pendant/src/components/JoggingCard';
import VisualizerCard from '../../src/pendant/src/components/VisualizerCard';

export default function PendantCarveView({ drawerOpen, onDrawerOpenChange, drawerTab, onDrawerTabChange }: {
    drawerOpen: boolean;
    drawerTab: string;
    onDrawerTabChange: (tab: string) => void;
    onDrawerOpenChange: (open: boolean) => void;
}) {
    const grid = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
        const element = grid.current!;
        const observer = new ResizeObserver(() => {
            element.dataset.shortLandscape = String(element.clientHeight < 610);
            element.dataset.compactJog = String(element.clientHeight < 530);
            element.dataset.tightDro = String(element.clientHeight < 460);
        });
        observer.observe(element);
        return () => observer.disconnect();
    }, []);
    return <div className="android-carve-view">
        <div className="android-carve-grid" ref={grid}>
            <div className="android-visualizer-dock no-scrollbar">
                <VisualizerCard />
            </div>
            <div className="android-position-card"><DROCard /></div>
            <div className="android-jog-dock">
                <JoggingCard />
            </div>
        </div>
        <BottomDrawer open={drawerOpen} onOpenChange={onDrawerOpenChange} selectedTab={drawerTab} onTabChange={onDrawerTabChange} />
    </div>;
}
