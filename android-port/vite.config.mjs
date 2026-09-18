import { defineConfig } from 'vite';
import connectionUi from './scripts/connection-ui.cjs';
import buildLabel from './scripts/build-label.cjs';
import xyPadUi from './scripts/xy-pad-ui.cjs';
import jogTouchUi from './scripts/jog-touch-ui.cjs';
import performanceUi from './scripts/performance-ui.cjs';
import path from 'node:path';
import {readFileSync} from 'node:fs';
const jogLayoutCss=readFileSync(new URL('./ui/jog-layout.css',import.meta.url),'utf8');
import react from '@vitejs/plugin-react';
import tailwindcss from 'tailwindcss';
import tsconfigPaths from 'vite-tsconfig-paths';
import { patchCssModules } from 'vite-css-modules';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
const root = path.resolve(import.meta.dirname, '..');
const pendant = process.env.GSENDER_ANDROID_UI === 'pendant';
const startup = `<script>try { const prefs = JSON.parse(localStorage.getItem('sienci') || '{}'); if (location.pathname === '/' && prefs.state?.workspace?.usePendantViewAsDefault) location.replace('/pendant/' + location.search); } catch {}<\/script>`;
export default defineConfig({
    root: path.join(root, pendant ? 'src/pendant' : 'src/app'), base: pendant ? '/pendant/' : '/',
    css: { postcss: { plugins: [tailwindcss(path.join(root, pendant ? 'src/pendant/tailwind.config.ts' : 'src/app/tailwind.config.ts'))] },
        preprocessorOptions: { stylus: { modules: true } },
        modules: { localsConvention: 'camelCaseOnly', generateScopedName: '[name]__[local]___[hash:base64:5]' } },
    plugins: [{name:'android-jog-touch',enforce:'pre',transform:jogTouchUi.transform}, { name: 'android-xy-pad', enforce: 'pre', transform: xyPadUi.transform }, { name: 'android-build-label', enforce: 'pre', transform: buildLabel.transform }, { name: 'android-performance', enforce: 'pre', transform: performanceUi.transform }, { name: 'android-connection-state', enforce: 'pre', transform: connectionUi.transform }, { name: 'android-jog-haptics', enforce: 'pre', transform(code, id) {
        if (!id.endsWith('/pendant/src/components/JoggingCard.tsx')) return;
        const start = 'onStart: () => {';
        if (code.split(start).length !== 2) throw new Error('Pendant jog press handler changed');
        return {code: code.replace(start, start + ' try { (window as any).AndroidHaptics?.jogPress(); } catch {}'), map:null};
    } }, { name: 'android-knob-connection-location', enforce: 'pre', transform(code, id) {
        // Pendant uses its own CNC knob drawer tab; retain the desktop launcher.
        if (!id.endsWith('/workspace/TopBar/index.tsx')) return;
        const marker = '<Connection />';
        if (!code.includes(marker)) throw new Error('Board connection component changed');
        code = code.replace(marker, '<div style={{display:"inline-flex", alignItems:"center", gap:16, flexWrap:"nowrap", flexShrink:0}}>' + marker + '<span id="android-usb-knob-anchor" style={{display:"inline-flex", flexShrink:0}} /></div>');
        return {code, map:null};
    } }, { name: 'android-tablet-viewport' , transformIndexHtml(html) {
        html=html.replace('<head>','<head><style id="android-jog-layout">'+jogLayoutCss+'</style>');
        html = html.replace(/(<meta[^>]*name="viewport"[^>]*content=")[^"]*/, '$1' + (pendant ? 'width=1280, user-scalable=no' : 'width=1280, user-scalable=no'));
        if (pendant) return html.replace('<head>', `<head><script>
            (() => {
                const orientation = matchMedia('(orientation: landscape)');
                const fit = () => document.querySelector('meta[name="viewport"]').setAttribute('content',
                    'width=' + (orientation.matches ? 1280 : 800) + ', user-scalable=no');
                document.addEventListener('DOMContentLoaded', fit, {once:true});
                orientation.addListener(fit);
            })();
        <\/script>`);
        return html.replace('<head>', '<head>' + startup);
    } }, tsconfigPaths(), react(), patchCssModules(), nodePolyfills({include:['process'],globals:{global:true,process:true}}),
        { name: 'android-local-telemetry', load(id) { if (/\/sentry-config\.[jt]s$/.test(id)) return 'export {};'; } }],
    resolve: { alias: { 'app-root': root, app: path.join(root, 'src/app/src'), '@': path.join(root, 'src/app/src') } },
    build: { commonjsOptions: { include: [/node_modules/, /android-port\/ui\/(pad-vector|tilt-session)\.cjs$/] }, target: 'chrome87', outDir: path.join(root,'android-port/build/payload', pendant ? 'pendant' : 'app'), emptyOutDir: true, sourcemap: false },
});
