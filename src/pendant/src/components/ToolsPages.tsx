import { Children, type ReactNode, useLayoutEffect, useRef, useState } from 'react';

export default function ToolsPages({ children }: { children: ReactNode }) {
    const tools = Children.toArray(children);
    const pages = Math.ceil(tools.length / 15);
    const [page, setPage] = useState(0);
    const current = Math.min(page, Math.max(0, pages - 1));
    const host = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
        const element = host.current!;
        const resize = () => {
            const landscape = window.innerWidth > window.innerHeight;
            const columns = landscape ? 5 : 3;
            const rows = landscape ? 3 : 5;
            const size = Math.floor(Math.min((element.clientWidth - (columns - 1) * 10) / columns, (element.clientHeight - (rows - 1) * 10) / rows));
            element.style.setProperty('--tool-size', `${Math.max(1, size)}px`);
        };
        const observer = new ResizeObserver(resize);
        observer.observe(element);
        window.addEventListener('resize', resize);
        resize();
        return () => { observer.disconnect(); window.removeEventListener('resize', resize); };
    }, []);
    return <div className="android-tools-pages">
        <div ref={host} className="android-tools-page-space">
            <div className="android-tools-grid">
                {tools.slice(current * 15, (current + 1) * 15)}
            </div>
        </div>
        <nav className="android-tools-pagination" aria-label="Tools pages">
            {pages > 1 && <>
            {Array.from({ length: Math.max(3, pages) }, (_, index) => <button
                key={index} type="button" disabled={index >= pages}
                aria-label={`Tools page ${index + 1}`} aria-current={index === current ? 'page' : undefined}
                onClick={() => setPage(index)}><span /></button>)}
            </>}
        </nav>
    </div>;
}
