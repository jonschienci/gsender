import {useEffect,useState} from 'react';
import preferences from 'app/store';
import {useTypedSelector} from 'app/hooks/useTypedSelector';
export default function useAtcControls(){
 const reported=useTypedSelector(s=>s.controller.settings?.info?.NEWOPT?.ATC==='1');
 const read=()=>preferences.get('android.atcControls',preferences.get('workspace.atcEnabled',false)||reported);
 const [enabled,setEnabled]=useState(read);
 useEffect(()=>{const sync=()=>setEnabled(Boolean(read()));sync();preferences.on('change',sync);return()=>preferences.removeListener('change',sync);},[reported]);
 return enabled;
}
