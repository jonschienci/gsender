'use strict';
// Compatible with the official desktop Send to Pendant upload protocol.
// This optional LAN listener exposes file receiving only, never CNC commands.
const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const express = require('express');
const multer = require('multer');
const EXT = /\.(gcode|nc|tap|cnc|g|gc)$/i;
const MAX_BYTES = 200 * 1024 * 1024;
const html = `<!doctype html><meta name="viewport" content="width=device-width"><title>Send to gSender</title><style>body{font:18px system-ui;max-width:640px;margin:40px auto;padding:20px;background:#111827;color:white}input,button{font:inherit;padding:12px;margin:8px 0}progress{width:100%}</style><h1>Send files to gSender</h1><p>Files are saved to the tablet library. They will not load or run automatically.</p><form><label>Pairing code <input name="code" inputmode="numeric" maxlength="6" required></label><p><input name="files" type="file" multiple accept=".gcode,.nc,.tap,.cnc,.g,.gc" required></p><button>Send files</button></form><progress value="0" max="100"></progress><p role="status"></p><script>const form=document.querySelector('form'),status=document.querySelector('[role=status]'),bar=document.querySelector('progress');form.onsubmit=async e=>{e.preventDefault();const button=form.querySelector('button');button.disabled=true;try{for(const file of form.files.files){status.textContent='Sending '+file.name;await new Promise((resolve,reject)=>{const x=new XMLHttpRequest();x.open('POST','/pendant/file');x.setRequestHeader('X-Pendant-Token',form.code.value);x.setRequestHeader('X-Pendant-Filename',encodeURIComponent(file.name));x.upload.onprogress=e=>{if(e.lengthComputable)bar.value=e.loaded/e.total*100};x.onerror=()=>reject(Error('Connection lost'));x.onload=()=>x.status===200?resolve():reject(Error(x.responseText));const data=new FormData();data.append('gcode',file);data.append('mode','library');x.send(data)})}status.textContent='Files saved. Open Wireless files on the tablet to load one.'}catch(e){status.textContent=e.message}finally{button.disabled=false}};</script>`;

function createReceiver({dir, port = 8010, maxBytes = MAX_BYTES, host = '0.0.0.0'} = {}) {
    dir ||= path.join(process.env.GSENDER_USER_DATA, 'incoming');
    const temp = path.join(dir, '.partial');
    let server = null, enabled = false, token = '', receiving = false, lastPoll = 0;
    let transfer = null;
    let lastChanged = 0;
    const failures = new Map();
    const settingsFile = path.join(dir, '.settings.json');
    const prepare = () => fsp.mkdir(temp, {recursive:true});
    const addresses = () => Object.values(os.networkInterfaces()).flat().filter(x=>x && !x.internal && x.family==='IPv4' && !x.address.startsWith('169.254.')).map(x=>x.address);
    const saveSettings = () => fsp.writeFile(settingsFile,JSON.stringify({enabled}),{mode:0o600});
    const state = () => ({enabled,port,token:enabled?token:null,addresses:enabled?addresses():[],transfer,lastChanged,maxBytes});
    const safe = name => typeof name==='string' && name===path.basename(name) && /^[a-f0-9-]{36}--/.test(name) && EXT.test(name);
    const diskPath = name => {if(!safe(name))throw Object.assign(Error('Invalid file'),{status:400});return path.join(dir,name);};
    async function list() {
        await prepare();
        const files=await fsp.readdir(dir);
        const result=[];
        for(const savedName of files){if(!safe(savedName))continue;const stat=await fsp.stat(diskPath(savedName));if(stat.isFile())result.push({savedName,name:savedName.slice(38),size:stat.size,receivedAt:stat.mtimeMs});}
        return result.sort((a,b)=>b.receivedAt-a.receivedAt);
    }
    async function start() {
        if(server)return state();
        await prepare();token=crypto.randomInt(0,1_000_000).toString().padStart(6,'0');
        const app=express();app.disable('x-powered-by');
        app.use((req,res,next)=>{res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Headers','X-Pendant-Token, X-Pendant-Filename, Content-Type');if(req.method==='OPTIONS')return res.sendStatus(204);next();});
        app.get('/',(_req,res)=>res.type('html').send(html));
        app.get('/pendant/status',(_req,res)=>res.json({status:'ready'}));
        const upload=multer({storage:multer.diskStorage({destination:temp,filename:(_req,_file,cb)=>cb(null,crypto.randomUUID())}),limits:{fileSize:maxBytes,files:1,fields:2},fileFilter:(_req,file,cb)=>cb(EXT.test(file.originalname)?null:Error('Select a G-code file'),EXT.test(file.originalname))}).single('gcode');
        app.post('/pendant/file',(req,res,next)=>{
            const ip=req.socket.remoteAddress;const now=Date.now();
            if(failures.size>256)for(const [key,item] of failures)if(now-item.since>60_000)failures.delete(key);
            const item=failures.get(ip);
            if(item && now-item.since<60_000 && item.count>=20)return res.status(429).json({msg:'Too many attempts. Wait one minute.'});
            const provided=req.get('X-Pendant-Token')||'';
            if(!/^\d{6}$/.test(provided)||provided.length!==token.length||!crypto.timingSafeEqual(Buffer.from(provided),Buffer.from(token))){failures.set(ip,{since:item&&now-item.since<60_000?item.since:now,count:item&&now-item.since<60_000?item.count+1:1});return res.status(401).json({msg:'Invalid pairing code'});}
            if(receiving)return res.status(409).json({msg:'Another transfer is in progress'});
            receiving=true;let name='G-code';try{name=decodeURIComponent(req.get('X-Pendant-Filename')||name);}catch{}
            transfer={name,status:'receiving',percent:0};lastPoll=0;
            const total=Number(req.get('Content-Length'))||0;let bytes=0;
            req.on('data',chunk=>{bytes+=chunk.length;if(Date.now()-lastPoll>=150){transfer={...transfer,percent:total?Math.min(99,Math.floor(bytes/total*100)):0};lastPoll=Date.now();}});
            const fail=error=>{transfer={name,status:'error',message:error.message,percent:0};};
            req.on('aborted',()=>{fail(Error('Transfer interrupted'));});
            upload(req,res,async error=>{
                try{
                    if(error)throw error;
                    if(!req.file)throw Error('No G-code file received');
                    if(req.body.mode && req.body.mode!=='library')throw Error('Choose Send to library; loading an active job remotely is disabled.');
                    const clean=path.basename(req.file.originalname).replace(/[\x00-\x1f\x7f/\\]/g,'_').slice(-180);
                    if(!EXT.test(clean))throw Error('Unsupported G-code extension');
                    const savedName=crypto.randomUUID()+'--'+clean;
                    await fsp.rename(req.file.path,path.join(dir,savedName));
                    lastChanged=Date.now();transfer={name:clean,status:'complete',percent:100};
                    res.json({msg:'Added to tablet library',mode:'library',savedName});
                }catch(e){fail(e);if(req.file?.path)await fsp.unlink(req.file.path).catch(()=>{});if(!res.headersSent&&!res.destroyed)res.status(400).json({msg:e.code==='LIMIT_FILE_SIZE'?'File exceeds 200 MiB':e.message});}
                finally{receiving=false;}
            });
        });
        const candidate=app.listen(port,host);
        await new Promise((resolve,reject)=>{candidate.once('listening',resolve);candidate.once('error',reject);});
        server=candidate;port=server.address().port;enabled=true;
        candidate.on('error',()=>{enabled=false;server=null;});
        await saveSettings();return state();
    }
    async function stop(){const old=server;server=null;enabled=false;if(old){old.close();old.closeIdleConnections?.();}await prepare();await saveSettings();return state();}
    function installRoutes(app){
        const route=(fn)=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(e=>res.status(e.status||500).json({msg:e.message}));
        app.get('/api/android/wireless-files',(_req,res)=>res.json(state()));
        app.put('/api/android/wireless-files',express.json({limit:'2kb'}),route(async(req,res)=>res.json(await(req.body.enabled?start():stop()))));
        app.post('/api/android/wireless-files/code',(_req,res)=>{token=crypto.randomInt(0,1_000_000).toString().padStart(6,'0');res.json(state());});
        app.get('/api/android/wireless-files/library',route(async(_req,res)=>res.json({files:await list()})));
        app.get('/api/android/wireless-files/library/:name',route(async(req,res)=>{const file=diskPath(req.params.name);await fsp.access(file);res.type('text/plain').sendFile(file);}));
        app.delete('/api/android/wireless-files/library/:name',route(async(req,res)=>{await fsp.unlink(diskPath(req.params.name));lastChanged=Date.now();res.json({deleted:true});}));
        prepare().then(async()=>{for(const name of await fsp.readdir(temp))await fsp.unlink(path.join(temp,name)).catch(()=>{});const saved=JSON.parse(await fsp.readFile(settingsFile,'utf8').catch(()=>'{}'));if(saved.enabled)await start();}).catch(()=>{});
    }
    return {installRoutes,start,stop,state,list};
}
let instance;
module.exports={createReceiver,installRoutes(app){instance ||= createReceiver();instance.installRoutes(app);}};
