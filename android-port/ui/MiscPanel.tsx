import React from 'react';
import preferences from 'app/store';
import {useTypedSelector} from 'app/hooks/useTypedSelector';
import useRotaryEnabled from '../../src/pendant/src/components/useRotaryEnabled';
import useAtcControls from './useAtcControls';
export default function MiscPanel(){
 const laser=useTypedSelector(s=>Number(s.controller.settings?.settings?.$32)===1);
 const available=useTypedSelector(s=>s.connection.isConnected&&s.controller.workflow.state==='idle'&&s.controller.state.status?.activeState==='Idle');
 const rotary=useRotaryEnabled(),atc=useAtcControls();
 const toggle=(name:string,value:boolean)=>{
  if(name==='Rotary')preferences.set('widgets.rotary.tab.show',value);
  else if(name==='ATC'){preferences.set('android.atcControls',value);preferences.set('workspace.atcEnabled',value);}
  else if(available)window.dispatchEvent(new CustomEvent('android-set-laser-mode',{detail:{enabled:value}}));
 };
 return <div className="android-misc-switches">{[['Laser',laser],['Rotary',rotary],['ATC',atc]].map(([name,value])=><label key={String(name)}><span>{name}</span><button type="button" role="switch" aria-label={String(name)} aria-checked={Boolean(value)} disabled={name==='Laser'&&!available} title={name==='ATC'?'Show ATC controls; controller capability is detected separately':undefined} onClick={()=>toggle(String(name),!value)}><span/></button></label>)}</div>;
}
