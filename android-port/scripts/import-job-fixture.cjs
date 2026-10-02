'use strict';
// Local machining files remain ignored by Git. Import into a future APK only
// through this explicitly requested local benchmark fixture, never a CNC port.
const fs=require('node:fs'),path=require('node:path'),{gzipSync}=require('node:zlib'),{createHash}=require('node:crypto');
const {canonical}=require('../benchmark/simulator.cjs');
const sha=b=>createHash('sha256').update(b).digest('hex');
function prepare(source, destination=path.resolve(__dirname,'../benchmark/fixtures/local')) {
    const original=fs.readFileSync(source),gcode=original.toString('utf8');
    const commands=gcode.split(/\r?\n/).map(canonical).filter(Boolean);
    if(!['M2','M30'].includes(commands.at(-1)))throw Error('Fixture must finish with M2 or M30');
    if(commands.some(s=>s==='G4P0.123'||/M0?6(?!\d)/.test(s)))throw Error('Fixture has a simulator marker or unsupported tool-change sequence');
    const payload=Buffer.from('(LOCAL REAL-JOB SIMULATION - NOT FOR PHYSICAL CNC)\nG4P0.123\n'+gcode);
    const canonicalCommands=['G4P0.123',...commands];
    const file='local/real-job-'+sha(original).slice(0,12)+'.nc';
    const entry={id:'real-job-'+sha(original).slice(0,12),file,profile:'local-real-job',label:'Actual job: '+path.basename(source)+' · '+(original.length/1048576).toFixed(2)+' MiB',full:true,
        bytes:payload.length,commands:canonicalCommands.length,sha256:sha(payload),command_sha256:sha(canonicalCommands.join('\n')+'\n'),
        source_file:path.basename(source),source_sha256:sha(original),source_bytes:original.length,
        modifications:['prepend simulator marker and explanatory comment; all original bytes retained'],all_original_motion_blocks_unchanged:true,
        scope:'Local user job, not published. Loopback throughput/viewport benchmark only; no physical motion, spindle or machining validation.'};
    fs.mkdirSync(destination,{recursive:true});fs.writeFileSync(path.join(destination,path.basename(file)+'.gz'),gzipSync(payload,{level:9}));
    fs.writeFileSync(path.join(destination,'manifest.json'),JSON.stringify([entry],null,2)+'\n');return entry;
}
if(require.main===module){if(!process.argv[2])throw Error('Usage: node import-job-fixture.cjs /path/to/job.nc [destination]');console.log(JSON.stringify(prepare(process.argv[2],process.argv[3]),null,2));}
module.exports={prepare};
