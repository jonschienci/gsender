import { useEffect, useRef, useState, type ButtonHTMLAttributes } from 'react';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { onActivate: () => void; actionKey: string; activation?: 'hold' | 'tap' };

export default function HoldAxisButton({ onActivate, actionKey, disabled, children, activation = 'hold', ...props }: Props) {
    const [holding, setHolding] = useState(false);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const action = useRef(onActivate);
    action.current = onActivate;
    const cancel = () => {
        if (timer.current !== null) clearTimeout(timer.current);
        timer.current = null;
        setHolding(false);
    };
    const begin = () => {
        if (activation === 'tap' || disabled || timer.current !== null) return;
        setHolding(true);
        timer.current = setTimeout(() => {
            timer.current = null;
            setHolding(false);
            action.current();
        }, 500);
    };
    useEffect(() => { cancel(); }, [disabled, actionKey, activation]);
    useEffect(() => {
        window.addEventListener('blur', cancel);
        document.addEventListener('visibilitychange', cancel);
        return () => {
            if (timer.current !== null) clearTimeout(timer.current);
            window.removeEventListener('blur', cancel);
            document.removeEventListener('visibilitychange', cancel);
        };
    }, []);
    return <button {...props} type="button" disabled={disabled}
        data-axis-holding={holding ? 'true' : undefined}
        onPointerDown={event => { if (event.button === 0) begin(); }}
        onPointerUp={cancel} onPointerLeave={cancel} onPointerCancel={cancel} onBlur={cancel}
        onKeyDown={event => {
            if (activation === 'tap') return;
            if (event.key === ' ' || event.key === 'Enter') {
                event.preventDefault();
                if (!event.repeat) begin();
            } else if (event.key === 'Escape') cancel();
        }}
        onKeyUp={cancel}
        onContextMenu={event => event.preventDefault()}
        onClick={event => { event.preventDefault(); if (activation === 'tap' && !disabled) action.current(); }}
    >{children}</button>;
}
