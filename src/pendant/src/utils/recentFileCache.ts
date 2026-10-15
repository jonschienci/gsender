import type {GcodeFilePayload} from '../electron-bridge';
export const MAX_CACHED_BYTES=64*1024*1024;
export const CACHE_BUDGET_BYTES=96*1024*1024;
const keyFor=(name:string,path?:string)=>path?`path:${path}`:`name:${name}`;
const open=():Promise<IDBDatabase>=>new Promise((resolve,reject)=>{
 if(typeof indexedDB==='undefined'){reject(Error('Storage unavailable'));return;}
 const request=indexedDB.open('pendant-recent-gcode',2);
 request.onupgradeneeded=()=>{
  if(!request.result.objectStoreNames.contains('files'))request.result.createObjectStore('files');
  const metadata=request.result.createObjectStore('metadata',{keyPath:'key'});
  // Migrate only the small recent list, without cloning old cached G-code.
  try{for(const entry of JSON.parse(localStorage.getItem('pendant-recent-files')||'[]'))metadata.put({key:keyFor(entry.fileName,entry.filePath),bytes:Number(entry.fileSize)||0,savedAt:Number(entry.timeLoaded)||0});}catch{}
 };
 request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
});
export async function cacheRecentFile(payload:GcodeFilePayload):Promise<boolean>{
 if(payload.path?.startsWith('wireless:'))return false;
 const bytes=Number(payload.size)||new Blob([payload.content]).size;
 if(bytes>MAX_CACHED_BYTES)return false;
 let db:IDBDatabase|undefined;
 try{
  const blob=new Blob([payload.content],{type:'text/plain'});if(blob.size>MAX_CACHED_BYTES)return false;
  const {content,...info}=payload;db=await open();
  await new Promise<void>((resolve,reject)=>{
   const tx=db!.transaction(['files','metadata'],'readwrite'),files=tx.objectStore('files'),meta=tx.objectStore('metadata');
   const key=keyFor(payload.name,payload.path);files.put({payload:info,blob},key);meta.put({key,bytes:blob.size,savedAt:Date.now()});
   const request=meta.getAll();request.onsuccess=()=>{let count=0,total=0;for(const item of request.result.sort((a,b)=>b.savedAt-a.savedAt)){if(count>=5||total+item.bytes>CACHE_BUDGET_BYTES||item.bytes>MAX_CACHED_BYTES){files.delete(item.key);meta.delete(item.key);}else{count++;total+=item.bytes;}}};
   tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });return true;
 }catch{return false;}finally{db?.close();}
}
export async function readRecentFile(name:string,path?:string,size=0):Promise<GcodeFilePayload|undefined>{
 if(path?.startsWith('wireless:')){try{const response=await fetch('/api/android/wireless-files/library/'+encodeURIComponent(path.slice(9)));if(!response.ok)return;return {name,path,size,content:await response.text()};}catch{return;}}
 if(size>MAX_CACHED_BYTES)return;
 let db:IDBDatabase|undefined;
 try{
  db=await open();const item:any=await new Promise((resolve,reject)=>{const q=db!.transaction('files').objectStore('files').get(keyFor(name,path));q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});
  if(!item)return;
  if(item.blob){if(item.blob.size>MAX_CACHED_BYTES)return;return {...item.payload,content:await item.blob.text()};}
  if(item.payload?.size>MAX_CACHED_BYTES)return;
  return item.payload;
 }catch{return;}finally{db?.close();}
}

export function rememberRecentFile(file:Pick<GcodeFilePayload,'name'|'size'|'path'>){
 try{const old=JSON.parse(localStorage.getItem('pendant-recent-files')||'[]');const entry={fileName:file.name,fileSize:file.size,filePath:file.path,timeLoaded:Date.now()};
 localStorage.setItem('pendant-recent-files',JSON.stringify([entry,...(Array.isArray(old)?old:[]).filter(x=>keyFor(x.fileName,x.filePath)!==keyFor(file.name,file.path))].slice(0,5)));
 window.dispatchEvent(new Event('android-recent-files-changed'));}catch{}
}
