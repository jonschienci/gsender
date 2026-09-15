const path = require('node:path');
const fs = require('node:fs');
const esbuild = require('esbuild');
const root = path.resolve(__dirname, '../..');
const out = path.join(root, 'android-port/build/payload');
const runtime = path.join(root, 'android-port/runtime');
const replace = (source, from, to) => {
    if (!source.includes(from)) throw new Error('Upstream source changed: ' + from);
    return source.replace(from, to);
};
(async () => {
    fs.mkdirSync(out, {recursive:true});
    await esbuild.build({entryPoints:[path.join(root,'src/server/index.js')],outfile:path.join(out,'server.cjs'),
        bundle:true,platform:'node',target:'node18',packages:'external',sourcemap:false,
        define:{'global.NODE_ENV':'"production"','global.PUBLIC_PATH':'""','global.BUILD_VERSION':'"1.7.0-dev-android.24-prototype"','global.METRICS_ENDPOINT':'""'},
        plugins:[require('../usb/js/esbuild-plugin.cjs')('./android-usb/serialport.cjs'),{
            name:'android-platform', setup(build) {
                const aliases={electron:'electron.cjs','electron-log':'log.cjs'};
                build.onResolve({filter:/^android-slb-autoconnect$/},()=>({path:path.join(runtime,'slb-autoconnect.cjs')}));
                build.onResolve({filter:/^android-usb-pendant$/},()=>({path:path.join(root,'android-port/pendant/service.cjs')}));
                build.onResolve({filter:/^(electron|electron-log)$/}, args=>({path:path.join(runtime,aliases[args.path])}));
                build.onResolve({filter:/(DFUFlasher|firmwareflashing)$/},()=>({path:path.join(runtime,'disabled-flash.cjs')}));
                build.onResolve({filter:/^\.\/local-access\.cjs$/},()=>({path:path.join(runtime,'local-access.cjs')}));
                build.onResolve({filter:/^\.\/vite-server$/},()=>({path:path.join(runtime,'vite-server.cjs')}));
                build.onResolve({filter:/^(server|app)\//},args=>({path:require.resolve(path.join(root,'src',args.path))}));
                build.onLoad({filter:/src\/server\/.*\.js$/},args=>{
                    let s=fs.readFileSync(args.path,'utf8');
                    if(args.path.endsWith('lib/logger.js')) s=replace(s, 'acc[level] = (...args) => {', 'acc[level] = (...args) => { if (!logger.isLevelEnabled(level)) return;');
                    if(args.path.endsWith('lib/Connection.js')) s=replace(s, 'path: port,', 'path: port, requestPermission: options.requestPermission !== false,');
                    if(args.path.endsWith('lib/SerialConnection.js')) s=replace(s, 'this.port.write(Buffer.from(data));',
                        'if (context?.usbPendant === true) { const port = this.port; port.writeBounded(Buffer.from(data), err => { if (err) port.destroy(err); }); } else this.port.write(Buffer.from(data));');
                    if(args.path.endsWith('server/app.js')) s=replace(s, 'res.setHeader("Cache-Control", "no-cache");', 'res.setHeader("Cache-Control", "no-store");');
                    if(args.path.endsWith('server/app.js')) s=replace(s, 'const app = express();', "const app = express(); require('./local-access.cjs').install(app); require('android-usb-pendant').installRoutes(app);");
                    if(args.path.endsWith('settings.base.js')) {
                        s=replace(s,'const getUserHome = () => os.homedir();','const getUserHome = () => process.env.GSENDER_USER_DATA;');
                        s=replace(s,'path.resolve(__dirname, "..", "i18n",', "path.resolve(process.env.GSENDER_BUNDLE_DIR, 'i18n',");
                    }
                    if(args.path.endsWith('server/index.js')) {
                        s=replace(s,'remoteSettings.headlessStatus &&','false && remoteSettings.headlessStatus &&');
                        s='import { start as startUsbPendant } from "android-usb-pendant";\nimport pendantStore from "./store";\nimport { SerialPort as PendantSerialPort } from "serialport";\n'+s;
                        s=replace(s, 'const address = server.address().address;', 'startUsbPendant({ SerialPort: PendantSerialPort, getControllers: () => pendantStore.get("controllers") });\nconst address = server.address().address;');
                    }
                    if(args.path.endsWith('CNCEngine.js')) {
                        s=replace(s, 'socket.on("open", (port, options, callback) => {', 'const openUsbPort = (port, options, callback) => {');
                        s=replace(s, '});\n\n\t\t\t// Close serial port', '};\n            socket.on("open", require("android-slb-autoconnect").attach(this, socket, { SerialPort, open: openUsbPort }));\n\n            // Close serial port');
                        s=replace(s, 'this.emit("serialport:close", options, received);', 'require("android-slb-autoconnect").disconnected(this, options?.port); this.emit("serialport:close", options, received);');
                        s=replace(s, 'stop() {', 'stop() { require("android-slb-autoconnect").stop(this);');
                        s=replace(s, 'this.io.on("connection", (socket) => {', "this.io.on('connection', (socket) => { require('./local-access.cjs').report('UI connected to backend'); socket.on('disconnect', () => require('./local-access.cjs').report('UI disconnected from backend')); ");
                        s=replace(s, "serveClient: true,", "serveClient: false, allowRequest: (req, cb) => { const access = require('./local-access.cjs'); const allowed = access.authorized(req); if (!allowed) access.report('UI connection rejected: session credential expired'); cb(null, allowed); },");
                        const flash = /socket\.on\(\s*"flash:start",[\s\S]*?=> \{/;
                        if (!flash.test(s)) throw new Error('Flash handler changed');
                        s=s.replace(flash, match => match + " socket.emit('flash:message', {type:'Error', content:'Firmware flashing is not supported on Android.'}); socket.emit('flash:end'); return;");
                    }
                    return {contents:s,loader:'js'};
                });
            }
        }]});
    fs.copyFileSync(path.join(runtime,'bootstrap.cjs'),path.join(out,'bootstrap.cjs'));
    fs.cpSync(path.join(root,'android-port/usb/js'),path.join(out,'android-usb'),{recursive:true});
    fs.mkdirSync(path.join(out,'usb-pendant'),{recursive:true});
    for (const name of ['panel.html','panel.js','launcher.js','adaptive-mode.js']) fs.copyFileSync(path.join(root,'android-port/pendant',name),path.join(out,'usb-pendant',name));
    fs.cpSync(path.join(root,'src/server/i18n'),path.join(out,'i18n'),{recursive:true});
    fs.cpSync(path.join(root,'src/server/views'),path.join(out,'views'),{recursive:true});
    fs.copyFileSync(path.join(root,'LICENSE'),path.join(out,'LICENSE'));
    console.log('Android backend compiled.');
})().catch(err=>{console.error(err);process.exitCode=1;});
