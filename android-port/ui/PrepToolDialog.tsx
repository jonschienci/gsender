import {lazy,Suspense,useEffect} from 'react';
import {createPortal} from 'react-dom';
import {MemoryRouter,Routes,Route} from 'react-router';
const Surfacing=lazy(()=>import('app/features/Surfacing'));
const RotarySurfacing=lazy(()=>import('app/features/Rotary/RotarySurfacing'));
function Done({onClose}:{onClose:()=>void}){useEffect(onClose,[]);return null;}
export default function PrepToolDialog({tool,onClose}:{tool:string;onClose:()=>void}){

 useEffect(()=>{const escape=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose();};window.addEventListener('keydown',escape);return()=>window.removeEventListener('keydown',escape);},[onClose]);
 return createPortal(<section className="android-prep-dialog" role="dialog" aria-label={tool}><header><strong>{tool}</strong><button type="button" onClick={onClose} aria-label="Close preparation tool">×</button></header><div><MemoryRouter initialEntries={['/tool']}><Routes><Route path="/tool" element={<Suspense fallback={<p>Loading tool…</p>}>{tool==='Surfacing'?<Surfacing/>:<RotarySurfacing/>}</Suspense>}/><Route path="*" element={<Done onClose={onClose}/>}/></Routes></MemoryRouter></div></section>,document.body);
}
