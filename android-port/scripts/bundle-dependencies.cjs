'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {builtinModules, createRequire} = require('node:module');
const esbuild = require('esbuild');
module.exports = async function bundleDependencies(root, payload) {
    const deps = path.join(root, 'android-port/runtime-deps');
    const resolve = createRequire(path.join(deps, 'package.json'));
    const builtins = new Set(builtinModules.flatMap(x => [x, 'node:' + x]));
    const packages = new Set();
    const debug = path.join(root, 'android-port/build/backend-debug');
    fs.mkdirSync(debug, {recursive:true});
    const entries = ['server.cjs', 'job-recording.cjs', 'benchmark/service.cjs'];
    for (const entry of entries) {
        const input = path.join(payload, entry);
        const result = await esbuild.build({entryPoints:[input], outfile:input, allowOverwrite:true,
            bundle:true, platform:'node', target:'node18', format:'cjs', minify:true, keepNames:true,
            sourcemap:'external', metafile:true, write:false, legalComments:'eof',
            plugins:[{name:'pinned-runtime-dependencies', setup(build) {
                build.onResolve({filter:/.*/}, args => {
                    if (args.kind === 'entry-point') return;
                    if (builtins.has(args.path) || args.path.startsWith('node:')) return {path:args.path, external:true};
                    // Keep our native/session adapters as shared modules with their own __dirname.
                    if (args.path.startsWith('.') && args.importer.startsWith(payload + path.sep)) return {path:args.path, external:true};
                    if (/[\\/]consolidate[\\/]/.test(args.importer) && !args.path.startsWith('.') && !['fs','path','bluebird','hogan.js'].includes(args.path)) return {path:args.path,external:true};
                    if (['bufferutil','utf-8-validate'].includes(args.path)) return {path:args.path, external:true};
                    if (args.path.startsWith('.') || path.isAbsolute(args.path)) return;
                    const resolved = (args.importer.includes('/node_modules/') ? createRequire(args.importer) : resolve).resolve(args.path);
                    if (resolved.endsWith('.node')) throw new Error('Unexpected native dependency: '+args.path);
                    return {path:resolved};
                });
            }}]});
        for (const output of result.outputFiles) {
            const destination = output.path.endsWith('.map') ? path.join(debug,entry.replaceAll('/','-')+'.map') : output.path;
            fs.writeFileSync(destination,output.contents);
        }
        fs.writeFileSync(path.join(debug,entry.replaceAll('/','-')+'.meta.json'),JSON.stringify(result.metafile));
        for (const inputFile of Object.keys(result.metafile.inputs)) {
            let dir=path.dirname(path.resolve(root,inputFile));
            while (dir!==path.dirname(dir)) {
                if (fs.existsSync(path.join(dir,'package.json'))) {packages.add(dir);break;}
                dir=path.dirname(dir);
            }
        }
    }
    const notices = path.join(payload,'dependency-notices');
    fs.rmSync(notices,{recursive:true,force:true});fs.mkdirSync(notices,{recursive:true});
    for (const dir of packages) {
        const pkg=JSON.parse(fs.readFileSync(path.join(dir,'package.json'),'utf8'));
        if (!pkg.name) continue;
        const dest=path.join(notices,pkg.name.replaceAll('/','_'));fs.mkdirSync(dest,{recursive:true});
        fs.writeFileSync(path.join(dest,'package.json'),JSON.stringify({name:pkg.name,version:pkg.version,license:pkg.license},null,2));
        for(const name of fs.readdirSync(dir)) if(/^(licen[cs]e|copying|notice)/i.test(name)&&fs.statSync(path.join(dir,name)).isFile()) fs.copyFileSync(path.join(dir,name),path.join(dest,name));
    }
    fs.cpSync(path.join(deps,'node_modules/errorhandler/public'),path.join(payload,'public'),{recursive:true});
    fs.writeFileSync(path.join(payload,'bundled-dependencies.json'),JSON.stringify({entries,packages:packages.size}));
};
