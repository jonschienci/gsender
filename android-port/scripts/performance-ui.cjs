'use strict';
const replace = (code, from, to) => {
    if (code.split(from).length !== 2) throw new Error('Android performance transform no longer matches upstream');
    return code.replace(from, to);
};
exports.transform = (code, id) => {
    if (id.endsWith('/pendant/src/components/Visualizer.tsx')) {
        const androidUi = id.slice(0, id.lastIndexOf('/src/pendant/')) + '/android-port/ui/';
        code = 'import { GCodeSVGRenderer as AndroidSvgRenderer } from "@sienci/gviewer/viewer";\n'
            + 'import { installSvgInteractions } from ' + JSON.stringify(androidUi + 'svg-interactions.mjs') + ';\n'
            + 'import { installRasterPreview } from ' + JSON.stringify(androidUi + 'raster-preview.mjs') + ';\n'
            + 'import { watchVisualizer } from ' + JSON.stringify(androidUi + 'visualizer-benchmark.mjs') + ';\n'
            + 'installRasterPreview(AndroidSvgRenderer); installSvgInteractions(AndroidSvgRenderer);\n' + code;
        code = replace(code, 'const wpos = useTypedSelector((s: RootState) => s.controller.wpos);',
            `const wpos = useTypedSelector((s: RootState) => s.controller.wpos);
    const benchmarkContext = useRef({workflowState, fileLoaded});
    benchmarkContext.current = {workflowState, fileLoaded};
    useEffect(() => {
        const svg = svgRef.current?.getSVGElement();
        if (svg) return watchVisualizer(svg, () => benchmarkContext.current);
    }, []);`);
        // The gviewer React wrapper calls setOptions when this prop changes;
        // setOptions rebuilds every toolpath. Position updates need overlays only.
        const options = /options=\{\{([\s\S]*?)\}\}/;
        const match = code.match(options);
        if (!match || code.match(/options=\{\{/g).length !== 1) throw new Error('Visualizer options changed');
        code = code.replace(options, 'options={ANDROID_SVG_OPTIONS}');
        code = replace(code, 'export default function Visualizer()', 'const ANDROID_SVG_OPTIONS = {' + match[1] + '} as const;\nexport default function Visualizer()');
    } else if (id.endsWith('/pendant/src/components/ProgressAreaWrapper.tsx')) {
        const block = /const totalFromContent = useMemo\(\(\) => \{[\s\S]*?\}, \[fileContent\]\);/;
        if (!block.test(code)) throw new Error('Progress line count changed');
        code = 'import { useLineCount } from ' + JSON.stringify(id.slice(0, id.lastIndexOf('/src/pendant/')) + '/android-port/ui/use-line-count.ts') + ';\n' + code;
        code = code.replace(block, 'const totalFromContent = useLineCount(fileContent, fileTotal);');
    } else return null;
    return {code, map:null};
};
