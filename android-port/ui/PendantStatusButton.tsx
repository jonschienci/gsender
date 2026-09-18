import { ChevronDown } from 'lucide-react';

type Props = { open: boolean; onToggle: () => void };

export default function PendantStatusButton({ open, onToggle }: Props) {
    return (
        <button
            id="android-status-toggle"
            type="button"
            className="android-status-toggle no-drag"
            aria-expanded={open}
            aria-controls="android-machine-status"
            onClick={onToggle}
            onKeyDown={event => {
                if (open && event.key === 'Escape') {
                    event.preventDefault();
                    onToggle();
                }
            }}
        >
            Status
            <ChevronDown size={14} aria-hidden style={{ transform: open ? 'rotate(180deg)' : undefined }} />
        </button>
    );
}
