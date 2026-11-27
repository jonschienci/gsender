'use strict';
const replace = (code, from, to) => {
    if (code.split(from).length !== 2) throw new Error('Android performance transform no longer matches upstream');
    return code.replace(from, to);
};
exports.transform = (code, id) => {
    if (id.endsWith('/pendant/src/components/Visualizer.tsx')) {
        const androidUi = id.slice(0, id.lastIndexOf('/src/pendant/')) + '/android-port/ui/';
        // The official WebGL viewer owns its on-demand rendering and touch controls.
        // Do not patch its prototype or run the former raster-preview worker.
        if (!code.includes('OfficialToolpathVisualizer')) throw new Error('Official renderer integration changed');
        code = 'import { watchVisualizer } from ' + JSON.stringify(androidUi + 'visualizer-benchmark.mjs') + ';\n' + code;
        code = replace(code, 'const wpos = useTypedSelector((s: RootState) => s.controller.wpos, shallowEqual);',
            `const wpos = useTypedSelector((s: RootState) => s.controller.wpos, shallowEqual);
    const benchmarkContext = useRef({workflowState, fileLoaded});
    benchmarkContext.current = {workflowState, fileLoaded};
    useEffect(() => {
        const svg = svgRef.current?.getSVGElement();
        if (svg?.parentElement) return watchVisualizer(svg.parentElement, () => benchmarkContext.current);
    }, []);`);
    } else if (id.endsWith('/pendant/src/components/ProgressAreaWrapper.tsx')) {
        const block = /const totalFromContent = useMemo\(\(\) => \{[\s\S]*?\}, \[fileContent\]\);/;
        if (!block.test(code)) throw new Error('Progress line count changed');
        code = 'import { useLineCount } from ' + JSON.stringify(id.slice(0, id.lastIndexOf('/src/pendant/')) + '/android-port/ui/use-line-count.ts') + ';\n' + code;
        code = code.replace(block, 'const totalFromContent = useLineCount(fileContent, fileTotal);');
    } else return null;
    return {code, map:null};
};
