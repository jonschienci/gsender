import { defineConfig } from 'vite';
import path from 'node:path';
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
    plugins: [{ name: 'android-jog-haptics', enforce: 'pre', transform(code, id) {
        if (!id.endsWith('/pendant/src/components/JoggingCard.tsx')) return;
        const start = 'onStart: () => {';
        if (code.split(start).length !== 2) throw new Error('Pendant jog press handler changed');
        return {code: code.replace(start, start + ' try { (window as any).AndroidHaptics?.jogPress(); } catch {}'), map:null};
    } }, { name: 'android-knob-connection-location', enforce: 'pre', transform(code, id) {
        const marker = id.endsWith('/components/PendantTopBar.tsx') ? '<ConnectionWidget />'
            : id.endsWith('/workspace/TopBar/index.tsx') ? '<Connection />' : null;
        if (!marker) return;
        if (!code.includes(marker)) throw new Error('Board connection component changed');
        code = code.replace(marker, '<div style={{display:"inline-flex", alignItems:"center", gap:16, flexWrap:"nowrap", flexShrink:0}}>' + marker + '<span id="android-usb-knob-anchor" style={{display:"inline-flex", flexShrink:0}} /></div>');
        if (id.endsWith('/components/PendantTopBar.tsx')) {
            code = code.replace('absolute left-1/2 -translate-x-1/2 pointer-events-none', 'relative pointer-events-none');
            code = code.replace('h-14 px-3 flex items-center gap-3', 'min-h-14 py-2 px-3 flex flex-wrap items-center gap-3');
        }
        return {code, map:null};
    } }, { name: 'android-tablet-viewport' , transformIndexHtml(html) {
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
    build: { target: 'chrome87', outDir: path.join(root,'android-port/build/payload', pendant ? 'pendant' : 'app'), emptyOutDir: true, sourcemap: false },
});
