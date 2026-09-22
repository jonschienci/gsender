import { useLayoutEffect, useRef, type ReactNode } from 'react';

// The available WebView height varies with Android's system bars. Fit the
// existing square controls to their actual row without changing jog handlers.
export default function JogAreaFit({ children, xyPad }: { children: ReactNode; xyPad: boolean }) {
    const host = useRef<HTMLDivElement>(null);
    const content = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
        const outer = host.current!, inner = content.current!;
        const orientation = matchMedia('(orientation: landscape)');
        const fit = () => {
            inner.style.width = '';
            if (!orientation.matches || !outer.clientHeight) return;
            const main = inner.querySelector<HTMLElement>('.android-jog-main');
            const style = getComputedStyle(inner);
            const verticalPadding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
            // Fixed-size Z/A controls cannot be made shorter by narrowing the XY
            // column. Measure only the controls whose height changes with width.
            const fits = () => (main?.getBoundingClientRect().height ?? inner.getBoundingClientRect().height) + verticalPadding <= outer.clientHeight;
            let low = Math.min(212, outer.clientWidth), high = outer.clientWidth;
            // Keep a usable minimum on exceptionally short windows; the host
            // scrolls as a fallback instead of allowing hit areas to overlap.
            if (fits()) return;
            for (let i = 0; i < 9; i++) {
                const width = (low + high) / 2;
                inner.style.width = `${width}px`;
                if (fits()) low = width;
                else high = width;
            }
            inner.style.width = `${Math.floor(low)}px`;
        };
        const observer = new ResizeObserver(fit);
        observer.observe(outer);
        orientation.addListener(fit);
        fit();
        return () => { observer.disconnect(); orientation.removeListener(fit); };
    }, [xyPad]);
    return <div className="android-jog-fit" ref={host}>
        <div className="android-jog-area" ref={content}>{children}</div>
    </div>;
}
