import { store as reduxStore } from 'app/store/redux';
import { unloadFileInfo } from 'app/store/redux/slices/fileInfo.slice';
import { cancelGcodeProcessing } from '../utils/gcodeProcessing';
import { useEffect, useState } from 'react';
import { WORKFLOW_STATE_RUNNING, WORKFLOW_STATE_PAUSED } from 'app/constants';
import { useTypedSelector } from 'app/hooks/useTypedSelector';
import type { RootState } from 'app/store/redux';
import GcodeEditor from 'app/features/Visualizer/GcodeEditor';
import { FileCode2 } from 'lucide-react';
import FeedOverrideWrapper from './FeedOverrideWrapper';
import FileLoadingOverlay from './FileLoadingOverlay';
import JobControls from './JobControls';
import ProgressAreaWrapper from './ProgressAreaWrapper';
import Visualizer from './Visualizer';
import WorkspaceSelector from './WorkspaceSelector';

export default function VisualizerCard() {
    const [filesOpen, setFilesOpen] = useState(false);
    const [editorOpen, setEditorOpen] = useState(false);
    const fileLoaded = useTypedSelector((s: RootState) => s.file.fileLoaded);
    const workflowState = useTypedSelector((s: RootState) => s.controller.workflow.state);
    const showJobControls = fileLoaded ||
        workflowState === WORKFLOW_STATE_RUNNING ||
        workflowState === WORKFLOW_STATE_PAUSED;
    const fileProcessing = useTypedSelector(
        (s: RootState) => s.file.fileProcessing,
    );
    const processingName = useTypedSelector(
        (s: RootState) => s.file.processingName ?? '',
    );
    const processingProgress = useTypedSelector(
        (s: RootState) => s.file.processingProgress ?? 0,
    );
    const fileName = useTypedSelector((s: RootState) =>
        s.file.fileProcessing
            ? s.file.processingName || s.file.name || ''
            : s.file.name || '',
    );

    useEffect(() => { if (fileProcessing) setFilesOpen(false); }, [fileProcessing]);

    return (
        <div className="flex flex-col gap-3" data-show-job-controls={showJobControls}>
            {/* Visualizer canvas */}
            <div className="rounded-xl border border-gray-300 dark:border-outline dark:bg-surface-raised flex flex-col">
                {/* Top toolbar */}
                <div className="flex items-center px-3 py-2 bg-gray-100 dark:bg-surface-raised border-b border-gray-200 dark:border-outline rounded-t-xl">
                    <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-content-muted flex-1">
                        <span className="flex items-center gap-1">
                            <span
                                className="w-2 h-2 rounded-full inline-block"
                                style={{ backgroundColor: '#3F85C7' }}
                            />
                            Cut
                        </span>
                        <span className="flex items-center gap-1">
                            <span
                                className="w-2 h-2 rounded-full inline-block"
                                style={{ backgroundColor: '#059669' }}
                            />
                            Rapid
                        </span>
                        <span className="flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-gray-400 inline-block" />
                            Bounds
                        </span>
                    </div>
                    {fileLoaded && <button type="button" className="android-load-file" aria-expanded={editorOpen} onClick={() => { setFilesOpen(false); setEditorOpen(value => !value); }}>
                        {editorOpen ? 'Close Editor' : 'G-code Editor'}
                    </button>}
                    <button type="button" className="android-load-file" aria-expanded={filesOpen} onClick={() => { setEditorOpen(false); setFilesOpen(value => !value); }}>
                        <FileCode2 size={16} /> {filesOpen ? 'Close Files' : 'Load File'}
                    </button>
                    {fileLoaded && <button type="button" className="android-load-file"
                        disabled={workflowState === WORKFLOW_STATE_RUNNING || workflowState === WORKFLOW_STATE_PAUSED}
                        onClick={() => { cancelGcodeProcessing(); reduxStore.dispatch(unloadFileInfo()); setEditorOpen(false); setFilesOpen(false); }}>
                        Close File
                    </button>}
                    <WorkspaceSelector />
                </div>

                <div className="relative h-56 overflow-hidden rounded-b-xl dark:bg-surface-sunken">
                    <Visualizer />
                    <div id="android-job-summary-host" />
                    {editorOpen && fileLoaded && <section className="android-visualizer-editor" aria-label="G-code editor"><GcodeEditor onClose={() => setEditorOpen(false)} /></section>}
                    <section id="android-visualizer-files" aria-label="G-code files" hidden={!filesOpen} />
                    {fileProcessing && (
                        <div className="absolute inset-0 flex items-center justify-center p-3 bg-dark-darker/95">
                            <FileLoadingOverlay
                                fileName={processingName || fileName}
                                progress={processingProgress}
                            />
                        </div>
                    )}
                    {!fileLoaded && !fileProcessing && (
                        <button
                            type="button"
                            onClick={() => setFilesOpen(true)}
                            className="absolute inset-2 rounded-lg flex flex-col items-center justify-center gap-2 bg-gray-100 dark:bg-transparent border border-dashed border-gray-300 dark:border-white/25 cursor-pointer"
                            aria-label="Open G-code file"
                        >
                            <FileCode2
                                size={44}
                                className="text-gray-400/60 dark:text-blue-300/30"
                            />
                            <span className="text-[13px] font-medium text-gray-400 dark:text-content-muted">
                                No file loaded
                            </span>
                            <span className="text-[11px] text-gray-500 dark:text-content-muted">
                                Tap here to open a G-code file
                            </span>
                        </button>
                    )}
                </div>
            </div>

            {/* Job controls */}
            {showJobControls && <JobControls />}

            <ProgressAreaWrapper />

            {/* Override sliders */}
            <FeedOverrideWrapper />
        </div>
    );
}
