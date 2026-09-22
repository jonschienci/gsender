export function previewDiagnostic(stage, detail = {}) {
    const record = {stage, ...detail, time:Date.now()};
    globalThis.__gsenderPreviewDiagnostic = record;
    if (globalThis.__gsenderBenchmarkActive && typeof document !== 'undefined') {
        document.dispatchEvent(new CustomEvent('gsender-preview-diagnostic', {detail:record}));
    }
}
