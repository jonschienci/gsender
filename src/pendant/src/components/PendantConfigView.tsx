import { Config } from 'app/features/Config';
import { SettingsProvider } from 'app/features/Config/utils/SettingsContext';
import React, { useEffect, useRef } from 'react';
import controller from 'app/lib/controller';
import { store as reduxStore } from 'app/store/redux';
import { WORKFLOW_STATE_IDLE } from 'app/constants';
import { MemoryRouter } from 'react-router';

class ConfigErrorBoundary extends React.Component<
    { children: React.ReactNode },
    { error: Error | null }
> {
    constructor(props: { children: React.ReactNode }) {
        super(props);
        this.state = { error: null };
    }
    static getDerivedStateFromError(error: Error) {
        return { error };
    }
    render() {
        if (this.state.error) {
            return (
                <div className="p-6 text-red-400 font-mono text-sm overflow-auto h-full">
                    <p className="font-bold text-red-300 mb-2">
                        Config crashed:
                    </p>
                    <p className="mb-2">{this.state.error.message}</p>
                    <pre className="text-xs opacity-70 whitespace-pre-wrap">
                        {this.state.error.stack}
                    </pre>
                </div>
            );
        }
        return this.props.children;
    }
}

export default function PendantConfigView({ active = true }: { active?: boolean }) {
    const firstActivation = useRef(true);
    useEffect(() => {
        if (!active) return;
        if (firstActivation.current) { firstActivation.current = false; return; }
        const state = reduxStore.getState();
        if (state.connection.isConnected && state.controller.workflow.state === WORKFLOW_STATE_IDLE) {
            controller.command('gcode', ['$$']);
        }
    }, [active]);
    return (
        <div className={active ? "flex-1 flex flex-col min-h-0 overflow-hidden" : "hidden"}>
            <ConfigErrorBoundary>
                <MemoryRouter>
                    <SettingsProvider>
                        <div className="pendant-config flex-1 overflow-hidden [&>div>div:first-child]:!hidden">
                            <Config />
                        </div>
                    </SettingsProvider>
                </MemoryRouter>
            </ConfigErrorBoundary>
        </div>
    );
}
