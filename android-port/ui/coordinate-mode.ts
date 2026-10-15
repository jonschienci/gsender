import {useSyncExternalStore} from 'react';
let mode: 'work'|'machine' = 'work';
const listeners=new Set<()=>void>();
export const coordinateMode=()=>mode;
export function setCoordinateMode(next:'work'|'machine') {
 mode=next;document.body.dataset.coordinateMode=next;
 listeners.forEach(fn=>fn());
 window.dispatchEvent(new CustomEvent('android-coordinate-mode'));
}
export function useCoordinateMode(){return useSyncExternalStore(fn=>{listeners.add(fn);return()=>{listeners.delete(fn);};},coordinateMode,()=> 'work' as const);}
