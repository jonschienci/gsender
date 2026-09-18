import { ChevronDown, ChevronUp } from 'lucide-react';

export default function PendantDrawerButton({ open, onToggle }: {
    open: boolean;
    onToggle: () => void;
}) {
    const Icon = open ? ChevronDown : ChevronUp;
    const label = open ? 'Hide control panels' : 'Show control panels';
    return (
        <button
            type="button"
            className={`android-drawer-toggle flex flex-col items-center justify-center gap-1 transition-colors ${open
                ? 'bg-robin-100 text-robin-700 border-t-2 border-robin-500 shadow-[inset_0_2px_4px_rgba(0,0,0,0.07)] dark:bg-robin-600/20 dark:text-robin-400 dark:border-robin-400 dark:shadow-[inset_0_2px_4px_rgba(0,0,0,0.22)]'
                : 'text-gray-400 hover:text-gray-600 dark:text-content-muted dark:hover:text-content-secondary dark:hover:bg-surface-hover'}`}
            aria-label={label}
            title={label}
            aria-expanded={open}
            aria-controls="android-drawer-panel"
            onClick={onToggle}
        >
            <Icon size={22} aria-hidden="true" />
        </button>
    );
}
