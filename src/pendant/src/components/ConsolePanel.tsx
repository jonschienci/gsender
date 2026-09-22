import { useTypedSelector } from 'app/hooks/useTypedSelector';
import controller from 'app/lib/controller';
import type { RootState } from 'app/store/redux';
import { store } from 'app/store/redux';
import {
    addToInputHistory,
    clearHistory,
} from 'app/store/redux/slices/console.slice';
import ConsoleList from './upstream-console/components/ConsoleList';
import type { ConsoleMessage } from './upstream-console/definitions';
import './upstream-console/styles.css';
import { KeyboardEvent, useMemo, useState } from 'react';

type Props = {
    className?: string;
    isActive?: boolean;
};

const EMPTY_HISTORY: string[] = [];

export default function ConsolePanel({ className = '', isActive = true }: Props) {
    const history = useTypedSelector((s: RootState) => isActive ? s.console.history : EMPTY_HISTORY);
    const [input, setInput] = useState('');
    const messages = useMemo<ConsoleMessage[]>(() => history.map((message, index) => ({
        id: `${index}:${message}`,
        message,
        type: /ALARM:/i.test(message) ? 'alarm' : /error:/i.test(message) ? 'error' : 'response',
    })), [history]);

    const send = () => {
        const cmd = input.trim();
        if (!cmd) return;
        controller.writeln(cmd);
        store.dispatch(addToInputHistory(cmd));
        setInput('');
    };

    const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') send();
    };

    const clear = () => store.dispatch(clearHistory());

    return (
        <div className={`android-pendant-console relative flex flex-col h-full ${className}`}>
            <div className="dark relative flex-1 min-h-0" data-theme="dark">
                <ConsoleList messages={messages} isActive={isActive} />
            </div>

            {/* Input row */}
            <div className="android-console-command-row flex items-center gap-2 px-3 py-2 shrink-0">
                <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={onKey}
                    placeholder="Send command…"
                    className="flex-1 min-w-0 bg-transparent font-mono text-xs text-gray-800 dark:text-content-primary placeholder:text-gray-400 dark:placeholder:text-gray-500 outline-none"
                />
                <button
                    onClick={send}
                    disabled={!input.trim()}
                    className="shrink-0 px-3 py-1 text-xs font-medium rounded bg-robin-500 text-white disabled:opacity-40 disabled:cursor-default"
                >
                    Send
                </button>
                <button
                    onClick={clear}
                    className="shrink-0 px-2 py-1 text-xs font-medium rounded text-gray-500 dark:text-content-muted hover:text-gray-700 dark:hover:text-gray-200"
                >
                    Clear
                </button>
            </div>
        </div>
    );
}
