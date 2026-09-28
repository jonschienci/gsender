import React, { useEffect, useRef, useState } from 'react';

type Props = {
    value: number[];
    min: number;
    max: number;
    step: number;
    disabled?: boolean;
    unit?: string;
    'aria-label'?: string;
    onValueChange?: (values: number[]) => void;
    onValueCommit?: (values: number[]) => void;
    onEditValue?: () => void;
};

export default function VerticalWheel({value, min, max, step, disabled = false,
    unit = '%', onValueChange, onValueCommit, onEditValue, ...props}: Props) {
    const drag = useRef<{id: number; y: number; value: number; moved: boolean; selected: boolean} | null>(null);
    const current = useRef(value[0]);
    const [local, setLocal] = useState(value[0]);
    useEffect(() => {
        if (!drag.current) { current.current = value[0]; setLocal(value[0]); }
    }, [value[0]]);
    useEffect(() => {
        if (disabled) drag.current = null;
        const cancel = () => { drag.current = null; };
        window.addEventListener('blur', cancel);
        document.addEventListener('visibilitychange', cancel);
        return () => {
            drag.current = null;
            window.removeEventListener('blur', cancel);
            document.removeEventListener('visibilitychange', cancel);
        };
    }, [disabled]);
    const update = (value: number) => {
        const minor = step / 5;
        const next = Number(Math.min(max, Math.max(min, Math.round(value / minor) * minor)).toFixed(3));
        current.current = next;
        setLocal(next);
        onValueChange?.([next]);
    };
    const base = Math.floor(local / step) * step;
    const fraction = (local - base) / step;
    return <div className="android-speed-wheel" role="slider"
        aria-label={props['aria-label']} aria-valuemin={min} aria-valuemax={max}
        aria-valuenow={local} aria-valuetext={`${local} ${unit}`}
        aria-orientation="vertical" aria-disabled={disabled} tabIndex={disabled ? -1 : 0}
        style={{'--wheel-tick-offset': `${-fraction * 54}px`} as React.CSSProperties}
        onPointerDown={event => {
            if (disabled || event.button !== 0 || drag.current) return;
            event.preventDefault();
            const rect = event.currentTarget.getBoundingClientRect();
            drag.current = {id: event.pointerId, y: event.clientY, value: current.current,
                moved: false, selected: Math.abs(event.clientY - rect.top - rect.height / 2) <= 20};
            event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={event => {
            const gesture = drag.current;
            if (!gesture || gesture.id !== event.pointerId || disabled) return;
            if (Math.abs(gesture.y - event.clientY) > 5) {
                gesture.moved = true;
                update(gesture.value + (gesture.y - event.clientY) * step / 54);
            }
        }}
        onPointerUp={event => {
            const gesture = drag.current;
            if (!gesture || gesture.id !== event.pointerId) return;
            drag.current = null;
            if (disabled) return;
            if (!gesture.moved && gesture.selected) onEditValue?.();
            else if (gesture.moved) onValueCommit?.([current.current]);
        }}
        onPointerCancel={() => { drag.current = null; }}
        onLostPointerCapture={() => { drag.current = null; }}
        onKeyDown={event => {
            if (disabled) return;
            if (event.key === 'Enter') { event.preventDefault(); onEditValue?.(); return; }
            const delta = event.key === 'ArrowUp' ? step : event.key === 'ArrowDown' ? -step : 0;
            if (delta) { event.preventDefault(); update(current.current + delta); onValueCommit?.([current.current]); }
        }}>
        <div className="android-wheel-center" aria-hidden="true" />
        <div className="android-wheel-options" aria-hidden="true">
            {[-3,-2,-1,0,1,2,3].map(offset => {
                const number = base + offset * step;
                const distance = offset - fraction;
                return <div key={offset} className="android-wheel-scale-number" style={{
                    top: `calc(50% + ${distance * 54}px)`,
                    opacity: Math.abs(distance) < .65 ? 0 : Math.max(.12, 1 - Math.abs(distance) * .35),
                    transform: `translateY(-50%) rotateX(${distance * 20}deg)`
                }}>{number >= min && number <= max ? number : '\u00a0'}</div>;
            })}
            <div className="selected android-wheel-selected-value">{Number(local.toFixed(3))}</div>
        </div>
        <span className="android-wheel-unit">{unit}</span>
    </div>;
}
