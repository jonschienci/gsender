import {rememberRecentFile} from '../../src/pendant/src/utils/recentFileCache';
import {useCallback,useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {useTypedSelector} from 'app/hooks/useTypedSelector';
import {applyGcodeFile} from '../../src/pendant/src/utils/fileLoader';
import {Confirm} from 'app/components/ConfirmationDialog/ConfirmationDialogLib';
import './wireless-files.css';

const API='/api/android/wireless-files';
type ReceiverState={enabled:boolean;port:number;token:string|null;addresses:string[];lastChanged:number;transfer:null|{name:string;status:string;percent:number;message?:string}};
type LibraryFile={savedName:string;name:string;size:number;receivedAt:number};
let saved:ReceiverState|null=null;
const listeners=new Set<(value:ReceiverState)=>void>();
export async function receiverRequest(path='',method='GET',body?:unknown){
 const response=await fetch(API+path,{method,headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});
 if(!response.ok){const error=await response.json().catch(()=>({msg:response.statusText}));throw Error(error.msg);}
 return response.json();
}
function publish(value:ReceiverState){saved=value;listeners.forEach(fn=>fn(value));}
function useReceiver(){const [state,setState]=useState(saved);useEffect(()=>{listeners.add(setState);return()=>{listeners.delete(setState);};},[]);return state;}
function openReceiver(){(window as any).__openWirelessFiles=true;window.dispatchEvent(new Event('android-open-wireless-files'));}
export function WirelessTransferNotice(){
 const state=useReceiver();const [canvas,setCanvas]=useState<Element|null>(null);const [now,setNow]=useState(Date.now());
 useEffect(()=>{setCanvas(document.querySelector('.android-visualizer-canvas'));let stopped=false,timer:ReturnType<typeof setTimeout>;
  const poll=async()=>{if(stopped)return;try{const next=await receiverRequest();publish(next);setNow(Date.now());}catch{}if(!stopped&&saved?.enabled&&!document.hidden)timer=setTimeout(poll,saved?.transfer?.status==='receiving'?350:2000);};void poll();
  const changed=()=>{clearTimeout(timer);void poll();};window.addEventListener('android-wireless-files-changed',changed);document.addEventListener('visibilitychange',changed);
  return()=>{stopped=true;clearTimeout(timer);window.removeEventListener('android-wireless-files-changed',changed);document.removeEventListener('visibilitychange',changed);};
 },[]);
 const transfer=state?.transfer;
 if(!canvas||!state?.enabled||!transfer||transfer.status==='complete'&&now-state.lastChanged>8000)return null;
 return createPortal(<button type="button" className="android-wireless-notice" onClick={openReceiver} title={transfer.name} aria-label="Open wireless file transfers"><span aria-hidden="true">↧</span><span>{transfer.status==='receiving'?`Receiving ${transfer.percent}%`:transfer.status==='complete'?'File received':'Transfer interrupted'}</span></button>,canvas);
}
const size=(n:number)=>n<1048576?`${Math.ceil(n/1024)} KB`:`${(n/1048576).toFixed(1)} MB`;
export default function WirelessFiles({onClose}:{onClose:()=>void}){
 const shared=useReceiver();const [state,setState]=useState(shared);const [files,setFiles]=useState<LibraryFile[]>([]);const [error,setError]=useState('');const [busy,setBusy]=useState(false);const alive=useRef(true);
 const running=useTypedSelector(s=>s.controller.workflow.state==='running'||['Run','Jog','Home','Hold','Tool'].some(v=>String(s.controller.state.status?.activeState||'').startsWith(v)));
 const processing=useTypedSelector(s=>s.file.fileProcessing);
 const motionBlocked=useRef(false);motionBlocked.current=running||Boolean(processing);
 const refresh=useCallback(async()=>{try{const [status,library]=await Promise.all([receiverRequest(),receiverRequest('/library')]);if(alive.current){setState(status);publish(status);setFiles(library.files);}}catch(e){if(alive.current)setError(String((e as Error).message));}},[]);
 useEffect(()=>{alive.current=true;void refresh();return()=>{alive.current=false;};},[refresh]);
 useEffect(()=>{if(shared){setState(shared);if(shared.lastChanged)void receiverRequest('/library').then(x=>{if(alive.current)setFiles(x.files);}).catch(()=>{});}},[shared?.lastChanged]);
 const action=async(fn:()=>Promise<unknown>)=>{setBusy(true);setError('');try{await fn();await refresh();window.dispatchEvent(new Event('android-wireless-files-changed'));}catch(e){setError((e as Error).message);}finally{if(alive.current)setBusy(false);}};
 const load=async(file:LibraryFile)=>{if(running||processing)return;await action(async()=>{const response=await fetch(API+'/library/'+encodeURIComponent(file.savedName));if(!response.ok)throw Error('Unable to open file');const content=await response.text();if(motionBlocked.current)throw Error('Wait for the machine to be idle before loading.');const payload={content,name:file.name,size:file.size,path:`wireless:${file.savedName}`};await applyGcodeFile(payload);rememberRecentFile(payload);});};
 return <section className="android-wireless-panel" aria-label="Wireless files"><header><h2>Wireless files</h2><button type="button" onClick={onClose}>Return</button></header>
 <div className="android-wireless-pair"><label><input type="checkbox" role="switch" checked={Boolean(state?.enabled)} disabled={busy} onChange={e=>void action(()=>receiverRequest('','PUT',{enabled:e.target.checked}))}/>Receive files over Wi-Fi</label>
 {state?.enabled?<><div className="android-wireless-code"><span>Pairing code</span><strong>{state.token}</strong><button type="button" disabled={busy} onClick={()=>void action(()=>receiverRequest('/code','POST'))}>New code</button></div><p>On your computer, open {state.addresses.map(ip=><code key={ip}>http://{ip}:{state.port}</code>)}{state.addresses.length===0&&'the tablet’s Wi-Fi address'}. You can also use desktop gSender’s Send to Pendant → Library.</p><p>Files are saved here. They never load or run automatically.</p></>:<p>Turn receiving on, then send files from a browser or desktop gSender on the same Wi-Fi. No account required.</p>}
 </div>{shared?.transfer?.status==='receiving'&&<p role="status">Receiving {shared.transfer.name} · {shared.transfer.percent}%</p>}
 {error&&<p role="alert">{error}</p>}
 <div className="android-wireless-library"><h3>Received files</h3>{files.length===0?<p>No received files yet.</p>:<ul>{files.map(file=><li key={file.savedName}><div><strong title={file.name}>{file.name}</strong><span>{size(file.size)}</span></div><button type="button" disabled={busy||running||processing} onClick={()=>void load(file)}>Load</button><button type="button" disabled={busy} onClick={()=>Confirm({title:'Delete received file?',content:file.name,confirmLabel:'Delete',onConfirm:()=>void action(()=>receiverRequest('/library/'+encodeURIComponent(file.savedName),'DELETE'))})}>Delete</button></li>)}</ul>}</div>
 {running&&<p>Loading is unavailable while the machine is moving, held, homing or changing tools. Receiving files remains available.</p>}
 </section>;
}
