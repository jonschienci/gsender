import { Children, type ReactNode, useEffect, useRef, useState } from 'react';

export default function MacroPages({ children }: { children: ReactNode }) {
    const host = useRef<HTMLDivElement>(null);
    const [layout, setLayout] = useState({ columns: 1, rows: 1 });
    const [page, setPage] = useState(0);
    const items = Children.toArray(children);
    useEffect(() => {
        const element = host.current;
        if (!element) return;
        const observer = new ResizeObserver(() => {
            const { width, height } = element.getBoundingClientRect();
            if (!width || !height) return;
            const columns = Math.max(1, Math.floor((width + 8) / 208));
            const rows = Math.max(1, Math.floor((height - 28 + 8) / 80));
            setLayout(previous => previous.columns === columns && previous.rows === rows ? previous : { columns, rows });
        });
        observer.observe(element);
        return () => observer.disconnect();
    }, []);
    const capacity = layout.columns * layout.rows;
    const count = Math.max(1, Math.ceil(items.length / capacity));
    const current = Math.min(page, count - 1);
    useEffect(() => { setPage(0); }, [capacity]);
    useEffect(() => { setPage(previous => Math.min(previous, count - 1)); }, [count]);
    return (
        <div ref={host} className="android-macro-pages">
            <div className="android-macro-page-grid" style={{ gridTemplateColumns: `repeat(${layout.columns}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${layout.rows}, minmax(0, 1fr))` }}>
                {items.slice(current * capacity, (current + 1) * capacity)}
            </div>
            <nav className="android-macro-page-dots" aria-label="Macro pages">
                {count > 1 && Array.from({ length: count }, (_, index) => (
                    <button key={index} type="button" aria-label={`Macro page ${index + 1}`} aria-current={index === current ? 'page' : undefined} onClick={() => setPage(index)}><span /></button>
                ))}
            </nav>
        </div>
    );
}
