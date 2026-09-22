'use strict';
// Classify animations against simulator timestamps, not delayed UI polling.
exports.enrich=({summary,events})=>{
 const measurements=(summary.fixtures||[]).map(f=>{
  const start=events.find(e=>e.event==='job_started'&&e.case===f.id);
  const end=events.find(e=>e.event==='job_completed'&&e.case===f.id);
  const idle=end&&events.find(e=>e.event==='workflow_changed'&&e.workflow==='idle'&&e.time>=end.time);
  const viewports=events.filter(e=>e.event==='viewport'&&e.label?.startsWith(f.id+':')).map(e=>{
   const begin=e.startedAt,finish=e.endedAt||e.time;
   const overlap=start&&Number.isFinite(begin)?Math.max(0,Math.min(finish,end?.time||Infinity)-Math.max(begin,start.time)):null;
   return {...e,actualStreamingOverlapMs:overlap,classification:overlap===null?'unknown':overlap===0?'not-streaming':overlap<finish-begin?'mixed':'streaming'};
  });
  return {fixture:f.id,stream:end||null,load:events.find(e=>e.event==='load_ready'&&e.fixture===f.id)||null,
   completionDisplayDelayMs:idle?idle.time-end.time:null,viewports};
 });
 return {summary,measurements,events};
};
