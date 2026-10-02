import {useWorkspaceState} from 'app/hooks/useWorkspaceState';
import {coordinateCommandValue} from '../../../../android-port/ui/readout-value.mjs';
import HoldAxisButton from './HoldAxisButton';
import type { CSSProperties } from 'react';
import useRotaryEnabled from './useRotaryEnabled';
import {
    GRBL_ACTIVE_STATE_ALARM,
    GRBL_ACTIVE_STATE_IDLE,
    GRBL_ACTIVE_STATE_JOG,
    WORKFLOW_STATE_RUNNING,
} from 'app/constants';
import {
    gotoZero,
    goXYAxes,
    homeMachine,
    homeAxis,
    zeroAllAxes,
    zeroWCS,
} from 'app/features/DRO/utils/DRO';
import { useTypedSelector } from 'app/hooks/useTypedSelector';
import type { RootState } from 'app/store/redux';
import cn from 'classnames';
import get from 'lodash/get';
import { Crosshair, Home, Target } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

const AXES = [
    {
        label: 'X',
        color: 'bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-400',
    },
    {
        label: 'Y',
        color: 'bg-green-100 text-green-600 dark:bg-green-500/20 dark:text-green-400',
    },
    {
        label: 'Z',
        color: 'bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400',
    },
    {
        label: 'A',
        color: 'bg-purple-100 text-purple-600 dark:bg-purple-500/20 dark:text-purple-400',
    },
] as const;

function formatAxisValue(value: unknown): string {
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed.toFixed(3) : '0.000';
}

export default function DROCard() {
    const rotaryEnabled = useRotaryEnabled();
    const [mode, setMode] = useState<'work' | 'machine'>('work');
    const isConnected = useTypedSelector(
        (s: RootState) => s.connection.isConnected,
    );
    const workflowState = useTypedSelector(
        (s: RootState) => s.controller.workflow.state,
    );
    const activeState = useTypedSelector(
        (s: RootState) => s.controller.state.status?.activeState ?? '',
    );
    const homingEnabled = useTypedSelector(
        (s: RootState) =>
            Number(get(s, 'controller.settings.settings.$22', 0)) > 0,
    );
    const wpos = useTypedSelector((s: RootState) => s.controller.wpos);
    const mpos = useTypedSelector((s: RootState) => s.controller.mpos);
    const activePos = !isConnected
        ? { x: 0, y: 0, z: 0, a: 0 }
        : mode === 'machine'
          ? mpos
          : wpos;
    const alarmCode = useTypedSelector(
        (s: RootState) => s.controller.state.status?.alarmCode ?? 0,
    ) as string | number;
    const isHomingAlarm =
        activeState === GRBL_ACTIVE_STATE_ALARM &&
        (alarmCode === 11 || alarmCode === 'Homing');
    const canZero =
        isConnected &&
        workflowState !== WORKFLOW_STATE_RUNNING &&
        (activeState === GRBL_ACTIVE_STATE_IDLE ||
            activeState === GRBL_ACTIVE_STATE_JOG);
    const {units:coordinateUnits}=useWorkspaceState();
    const controllerUnits=useTypedSelector(s=>s.controller.modal.units);
    const canGoTo = canZero;
    const canHome = isConnected && workflowState !== WORKFLOW_STATE_RUNNING && homingEnabled && (activeState === GRBL_ACTIVE_STATE_IDLE || isHomingAlarm);
    const [goXYHolding, setGoXYHolding] = useState(false);
    const goXYTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const cancelGoXYHold = () => {
        if (goXYTimer.current !== null) clearTimeout(goXYTimer.current);
        goXYTimer.current = null;
        setGoXYHolding(false);
    };
    const beginGoXYHold = () => {
        if (!canGoTo || goXYTimer.current !== null) return;
        setGoXYHolding(true);
        goXYTimer.current = setTimeout(() => {
            goXYTimer.current = null;
            setGoXYHolding(false);
            goXYAxes();
        }, 500);
    };
    useEffect(() => {
        if (!canGoTo) cancelGoXYHold();
    }, [canGoTo]);
    useEffect(() => {
        const cancel = () => cancelGoXYHold();
        window.addEventListener('blur', cancel);
        document.addEventListener('visibilitychange', cancel);
        return () => {
            if (goXYTimer.current !== null) clearTimeout(goXYTimer.current);
            window.removeEventListener('blur', cancel);
            document.removeEventListener('visibilitychange', cancel);
        };
    }, []);


    const [editingAxis, setEditingAxis] = useState<string | null>(null);
    const [axisValue, setAxisValue] = useState('');
    const changeMode = (next: 'work' | 'machine') => { setEditingAxis(null); setMode(next); };
    useEffect(() => {
        if (!editingAxis) return;
        const dismiss = (event: PointerEvent) => {
            if (!(event.target instanceof Element) || !event.target.closest('[data-dro-editor]')) setEditingAxis(null);
        };
        document.addEventListener('pointerdown', dismiss, true);
        return () => document.removeEventListener('pointerdown', dismiss, true);
    }, [editingAxis]);
    useEffect(() => { if (!rotaryEnabled && editingAxis === 'A') setEditingAxis(null); }, [rotaryEnabled, editingAxis]);
    const [homeMenuOpen, setHomeMenuOpen] = useState(false);
    const [homeHolding, setHomeHolding] = useState(false);
    const cardRef = useRef<HTMLDivElement>(null);
    const [homeFrame, setHomeFrame] = useState<{left:number;top:number;width:number;height:number} | null>(null);
    useLayoutEffect(() => {
        if (!homeMenuOpen || !cardRef.current) { setHomeFrame(null); return; }
        const card = cardRef.current;
        const update = () => {
            const buttons = Array.from(card.querySelectorAll<HTMLElement>('[data-home-axis], [data-home-trigger]'));
            const box = card.getBoundingClientRect();
            const scaleX = box.width / card.offsetWidth;
            const scaleY = box.height / card.offsetHeight;
            const rects = buttons.map(button => button.getBoundingClientRect());
            if (!rects.length || !scaleX || !scaleY) return;
            const left = (Math.min(...rects.map(r => r.left)) - box.left) / scaleX - card.clientLeft;
            const top = (Math.min(...rects.map(r => r.top)) - box.top) / scaleY - card.clientTop;
            const right = (Math.max(...rects.map(r => r.right)) - box.left) / scaleX - card.clientLeft;
            const bottom = (Math.max(...rects.map(r => r.bottom)) - box.top) / scaleY - card.clientTop;
            setHomeFrame({left:left-7,top:top-7,width:right-left+14,height:bottom-top+14});
        };
        const observer = new ResizeObserver(update);
        observer.observe(card);
        card.querySelectorAll('[data-home-axis], [data-home-trigger]').forEach(button => observer.observe(button));
        update();
        return () => observer.disconnect();
    }, [homeMenuOpen, rotaryEnabled]);
    const homeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const homeHeld = useRef(false);
    const cancelHomeHold = () => {
        if (homeTimer.current !== null) clearTimeout(homeTimer.current);
        homeTimer.current = null;
        setHomeHolding(false);
    };
    useEffect(() => () => cancelHomeHold(), []);
    useEffect(() => {
        if (!canHome) setHomeMenuOpen(false);
        if (canHome) return;
        cancelHomeHold();
        homeHeld.current = true;
    }, [canHome]);
    useEffect(() => {
        const cancel = () => { cancelHomeHold(); homeHeld.current = true; setHomeMenuOpen(false); };
        window.addEventListener('blur', cancel);
        document.addEventListener('visibilitychange', cancel);
        return () => { window.removeEventListener('blur', cancel); document.removeEventListener('visibilitychange', cancel); };
    }, []);
    useEffect(() => {
        if (!homeMenuOpen) return;
        const dismiss = (event: PointerEvent) => {
            if (!(event.target instanceof Element) || !event.target.closest('[data-home-axis], [data-home-trigger]')) setHomeMenuOpen(false);
        };
        const escape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setHomeMenuOpen(false);
        };
        document.addEventListener('pointerdown', dismiss, true);
        document.addEventListener('keydown', escape);
        return () => {
            document.removeEventListener('pointerdown', dismiss, true);
            document.removeEventListener('keydown', escape);
        };
    }, [homeMenuOpen, rotaryEnabled]);

    return (
        <div ref={cardRef} style={{ position: 'relative', '--dro-axis-count': rotaryEnabled ? 4 : 3 } as CSSProperties} className="rounded-xl bg-white border border-gray-300 dark:bg-surface-raised dark:border-outline p-2 flex flex-col gap-2">
            {homeMenuOpen && homeFrame && <div aria-hidden="true" className="android-home-connected-frame" style={homeFrame} />}
            {/* Work / Machine toggle */}
            <div className="flex gap-1 self-end">
                {(['work', 'machine'] as const).map((m) => (
                    <button
                        key={m}
                        onClick={() => changeMode(m)}
                        className={`px-3 py-1 rounded text-xs font-semibold uppercase tracking-wide transition-colors ${
                            mode === m
                                ? 'bg-robin-500 text-white'
                                : 'text-gray-400 hover:text-gray-600 dark:text-content-muted dark:hover:text-content-secondary'
                        }`}
                    >
                        {m}
                    </button>
                ))}
            </div>

            {/* Axis rows */}
            <div className="flex flex-col gap-1.5">
                {AXES.filter(axis => axis.label !== 'A' || rotaryEnabled).map(({ label, color }) => (
                    <div
                        key={label}
                        className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-gray-50 dark:bg-surface-elevated"
                    >
                        <HoldAxisButton
                            key={`${homeMenuOpen ? 'home' : 'goto'}-${label}`}
                            type="button"
                            aria-label={homeMenuOpen ? `Home ${label} axis` : `Go to ${label} axis`}
                            data-home-axis={homeMenuOpen ? label : undefined}
                            actionKey={`${homeMenuOpen ? 'home' : 'goto'}-${label}`}
                            activation={homeMenuOpen ? 'tap' : 'hold'}
                            onActivate={() => {
                                if (homeMenuOpen) { setHomeMenuOpen(false); if (canHome) homeAxis(label); }
                                else gotoZero(label);
                            }}
                            disabled={homeMenuOpen ? !canHome : !canGoTo}
                            className={`w-9 h-9 rounded flex items-center justify-center text-base font-bold shrink-0 transition-colors ${
                                canGoTo
                                    ? `hover:brightness-95 active:brightness-90 ${color}`
                                    : 'bg-gray-200 text-gray-400 dark:bg-surface-disabled dark:text-content-disabled cursor-default'
                            }`}
                        >
                            {homeMenuOpen ? <span className="android-home-axis-label"><span>Home</span><span>{label}</span></span> : label}
                        </HoldAxisButton>
                        <span
                            role="button"
                            tabIndex={0}
                            aria-label={`Edit ${label} coordinate`}
                            onClick={(event) => { event.stopPropagation(); setHomeMenuOpen(false); setAxisValue(formatAxisValue(activePos?.[label.toLowerCase() as 'x' | 'y' | 'z' | 'a'])); setEditingAxis(label); }}
                            onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); setHomeMenuOpen(false); setAxisValue(formatAxisValue(activePos?.[label.toLowerCase() as 'x' | 'y' | 'z' | 'a'])); setEditingAxis(label); } }}
                            className={cn(
                                'flex-1 min-w-0 text-right font-mono text-[2rem] tabular-nums leading-tight',
                                mode === 'work'
                                    ? 'text-blue-500'
                                    : 'text-gray-400 dark:text-content-muted',
                            )}
                        >
                            {formatAxisValue(
                                activePos?.[
                                    label.toLowerCase() as 'x' | 'y' | 'z' | 'a'
                                ],
                            )}
                        </span>
                        <HoldAxisButton
                            actionKey={`zero-${label}`}
                            aria-label={`Zero ${label} axis`}
                            onActivate={() => zeroWCS(label, 0)}
                            disabled={!canZero}
                            className={`text-sm font-semibold border-[3px] border-gray-400 dark:border-outline rounded-md px-3 py-1.5 shrink-0 transition-colors ${
                                canZero
                                    ? 'text-gray-500 hover:text-gray-700 dark:text-content-muted dark:hover:text-content-secondary'
                                    : 'text-gray-400 dark:text-content-muted cursor-default'
                            }`}
                        >
                            ZERO
                        </HoldAxisButton>
                        {editingAxis === label && <form data-dro-editor onClick={event => event.stopPropagation()} className="android-dro-value-editor" aria-label={mode === 'work' ? `Set ${label} work coordinate` : `${label} machine coordinate`}
                            onSubmit={(event) => { event.preventDefault(); const value = Number(axisValue); if (canZero && mode === 'work' && axisValue.trim() && Number.isFinite(value)) { zeroWCS(label, coordinateCommandValue(value,label,coordinateUnits,controllerUnits)); setEditingAxis(null); } }}>
                            <input key={mode} autoFocus readOnly={mode === 'machine'} aria-label={`${label} coordinate value`} inputMode="decimal" value={axisValue} onChange={event => setAxisValue(event.target.value)} onKeyDown={event => { if (event.key === 'Escape') setEditingAxis(null); }} />
                            {mode === 'machine' ? <>
                                <span className="android-dro-readonly-label">Machine</span>
                                <button type="button" className="android-dro-edit-work" onClick={() => { setAxisValue(formatAxisValue(wpos?.[label.toLowerCase() as 'x' | 'y' | 'z' | 'a'])); setMode('work'); }}>Edit Work</button>
                            </> : <>
                            <button type="button" aria-label={`Decrease ${label} coordinate`} onClick={() => setAxisValue((Number(axisValue || 0) - 1).toFixed(3))}>−</button>
                            <button type="button" aria-label={`Increase ${label} coordinate`} onClick={() => setAxisValue((Number(axisValue || 0) + 1).toFixed(3))}>+</button>
                            <button type="submit" aria-label={`Set ${label} coordinate`} disabled={!canZero || mode !== 'work' || !axisValue.trim() || !Number.isFinite(Number(axisValue))}>Set</button>
                            </>}
                        </form>}
                    </div>
                ))}
            </div>

            {/* Action buttons */}
            <div className="grid grid-cols-3 gap-2 pt-1">
                {[
                    { icon: Home, label: 'Home', primary: true },
                    { icon: Target, label: 'Go to XY', primary: true },
                    { icon: Crosshair, label: 'Zero All', primary: false },
                ].map(({ icon: Icon, label, primary }) => (
                    <button
                        key={label}
                        data-home-trigger={label === 'Home' ? 'true' : undefined}
                        data-home-holding={(label === 'Home' && homeHolding) || (label === 'Go to XY' && goXYHolding) ? 'true' : undefined}
                        aria-expanded={label === 'Home' ? homeMenuOpen : undefined}
                        onPointerDown={label === 'Go to XY' ? (event) => { if (event.button === 0) beginGoXYHold(); } : label === 'Home' ? (event) => {
                            if (homeMenuOpen) { homeHeld.current = true; setHomeMenuOpen(false); return; }
                            if (event.button !== 0 || !canHome) return;
                            cancelHomeHold();
                            homeHeld.current = false;
                            setHomeHolding(true);
                            homeTimer.current = setTimeout(() => {
                                homeHeld.current = true;
                                setHomeMenuOpen(true);
                                homeTimer.current = null;
                            }, 500);
                        } : undefined}
                        onPointerUp={label === 'Go to XY' ? cancelGoXYHold : label === 'Home' ? cancelHomeHold : undefined}
                        onPointerLeave={label === 'Go to XY' ? cancelGoXYHold : label === 'Home' ? cancelHomeHold : undefined}
                        onPointerCancel={label === 'Go to XY' ? cancelGoXYHold : label === 'Home' ? () => { cancelHomeHold(); homeHeld.current = true; } : undefined}
                        onKeyUp={label === 'Go to XY' ? cancelGoXYHold : undefined}
                        onBlur={label === 'Go to XY' ? cancelGoXYHold : undefined}
                        onKeyDown={label === 'Go to XY' ? (event) => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); if (!event.repeat) beginGoXYHold(); } } : label === 'Home' ? (event) => {
                            if (event.key === 'ArrowUp' && canHome) { event.preventDefault(); setHomeMenuOpen(true); }
                        } : undefined}
                        onContextMenu={label === 'Home' || label === 'Go to XY' ? (event) => event.preventDefault() : undefined}
                        onClick={
                            label === 'Home'
                                ? () => { if (!homeHeld.current) { if (homeMenuOpen) setHomeMenuOpen(false); else homeMachine(); } homeHeld.current = false; }
                                : label === 'Zero All'
                                  ? zeroAllAxes
                                  : label === 'Go to XY'
                                    ? (event) => event.preventDefault()
                                    : undefined
                        }
                        disabled={
                            label === 'Home'
                                ? !canHome
                                : label === 'Go to XY'
                                  ? !canGoTo
                                  : primary
                                    ? !isConnected
                                    : !canZero
                        }
                        className={`flex items-center justify-center gap-2 rounded-lg h-12 text-sm transition-colors ${
                            primary
                                ? (
                                      label === 'Home'
                                          ? canHome
                                          : label === 'Go to XY'
                                            ? canGoTo
                                            : isConnected
                                  )
                                    ? 'border border-blue-500 bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white'
                                    : 'border border-gray-200 dark:border-outline bg-gray-200 text-gray-400 dark:bg-surface-disabled dark:text-content-disabled'
                                : canZero
                                  ? 'border-[3px] border-gray-400 dark:border-outline text-gray-600 dark:text-content-secondary hover:bg-gray-50 dark:hover:bg-surface-hover hover:text-gray-900 dark:hover:text-content-primary'
                                  : 'border-[3px] border-gray-400 dark:border-outline text-gray-400 dark:text-content-muted bg-gray-100 dark:bg-surface-elevated cursor-default'
                        }`}
                    >
                        <Icon size={16} />
                        {label}
                    </button>
                ))}
            </div>
        </div>
    );
}
