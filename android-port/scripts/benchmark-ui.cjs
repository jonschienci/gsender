'use strict';
const replace=(s,a,b)=>{if(s.split(a).length!==2)throw Error('Benchmark UI transform changed: '+a);return s.replace(a,b);};
exports.transform=(code,id)=>{
 if(id.endsWith('/PendantShell.tsx')){
  const module=id.slice(0,id.lastIndexOf('/src/pendant/'))+'/android-port/ui/Benchmark.tsx';
  code='import Benchmark from '+JSON.stringify(module)+';\nimport JobLogs from '+JSON.stringify(module.replace('Benchmark.tsx','JobLogs.tsx'))+';\n'+code;
  code=replace(code,"const [activeTab, setActiveTab] = useState<NavTab>('carve');","const [activeTab, setActiveTab] = useState<NavTab>('carve'); const [benchmarkActive, setBenchmarkActive] = useState(false);");
  code=replace(code,'<JobCompletionAlert />','{!benchmarkActive && <JobCompletionAlert />}<Benchmark onCarve={() => setActiveTab("carve")} onActive={setBenchmarkActive} /><JobLogs />');
 }else if(id.endsWith('/PendantToolsView.tsx')||id.endsWith('/react-routes.tsx')){
  const jobAction=id.endsWith('/PendantToolsView.tsx')?"window.dispatchEvent(new Event('gsender-job-logs-open'))":"window.location.assign('/pendant/?joblogs=1')";
  const first=code.indexOf('<ToolCard');if(first<0)throw Error('Tools cards missing');
  code=code.slice(0,first)+'<ToolCard title="Job logs & Benchmark" description="Review recorded jobs, run offline benchmarks, and export reports" onClick={() => '+jobAction+'} />\n'+code.slice(first);
 }else return null;
 return {code,map:null};
};
