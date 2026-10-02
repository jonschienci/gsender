'use strict';
const fs=require('node:fs'),path=require('node:path');
exports.load=directory=>{
    const manifest=JSON.parse(fs.readFileSync(path.join(directory,'fixtures/manifest.json'),'utf8'));
    try {manifest.push(...JSON.parse(fs.readFileSync(path.join(directory,'fixtures/local/manifest.json'),'utf8')));}
    catch(error){if(error.code!=='ENOENT')throw error;}
    return manifest;
};

// A focused run uses a manifest ID, never an arbitrary file path.
exports.select=(manifest,profile)=>{
    const chosen=profile==='full'?manifest:profile==='quick'?manifest.filter(f=>f.id==='arcs-1m'):
        typeof profile==='string'&&profile.startsWith('fixture:')?manifest.filter(f=>f.profile==='local-real-job'&&f.id===profile.slice(8)):[];
    if(!chosen.length)throw Error('Unknown or unavailable benchmark suite');
    return chosen;
};
