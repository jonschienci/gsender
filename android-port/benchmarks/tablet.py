"""ADB setup, passive telemetry and phase markers for an unchanged gSender APK."""
import argparse, csv, json, re, subprocess, time
from pathlib import Path
PACKAGE='com.gsender.android'
def memory(text):
    def number(label):
        m=re.search(label+r':\s*(\d+)',text);return int(m.group(1)) if m else None
    return {'pss_kib':number('TOTAL PSS'),'rss_kib':number('TOTAL RSS'),'swap_pss_kib':number('TOTAL SWAP PSS')}
def available(text):
    m=re.search(r'MemAvailable:\s+(\d+)',text);return int(m.group(1)) if m else None

def main(a):
    out=Path(a.out);out.mkdir(parents=True,exist_ok=True)
    def adb(*args,timeout=8):
        try:
            p=subprocess.run([a.adb,'-s',a.serial,*args],capture_output=True,text=True,timeout=timeout)
            if p.returncode:raise RuntimeError(p.stderr.strip() or p.stdout.strip())
            return p.stdout
        except subprocess.TimeoutExpired:raise RuntimeError('ADB timed out: '+' '.join(args[:4]))
    def save(name,*args):
        try:content=adb(*args)
        except RuntimeError as e:content=str(e)
        (out/name).write_text(content);return content
    if a.command=='mark':
        with (out/'phases.jsonl').open('a') as f:f.write(json.dumps({'time':time.time(),'case':a.case,'phase':a.phase})+'\n')
        return
    if a.command=='prepare':
        adb('reverse','--no-rebind','tcp:2323','tcp:18823')
        if a.fixtures:
            adb('shell','mkdir','-p','/sdcard/Download/gSender-benchmark')
            for f in sorted(Path(a.fixtures).glob('*.nc')):adb('push',str(f),'/sdcard/Download/gSender-benchmark/'+f.name,timeout=120)
        print('In gSender connect to Ethernet IP 127.0.0.1, port 2323. This reaches ONLY the local simulator through ADB.')
        return
    if a.command=='cleanup':
        adb('reverse','--remove','tcp:2323');print('Removed only the benchmark reverse tunnel.');return
    save('device.txt','shell','getprop');save('package.txt','shell','dumpsys','package',PACKAGE)
    save('exit-before.txt','shell','dumpsys','activity','exit-info',PACKAGE)
    save('gfx-before.txt','shell','dumpsys','gfxinfo',PACKAGE,'framestats')
    save('usb-before.txt','shell','dumpsys','usb')
    # Preserve existing logs: never clear the tablet's logcat buffers.
    crash=(out/'logcat.txt').open('w')
    log=subprocess.Popen([a.adb,'-s',a.serial,'logcat','-v','epoch','-T','1'],stdout=crash,stderr=subprocess.STDOUT,text=True)
    rows=[]; start=time.monotonic(); consecutive_bad=0; stop_reason="duration_complete"
    previous_cpu={}
    try: ticks_per_second=int(adb('shell','getconf','CLK_TCK').strip())
    except (ValueError,RuntimeError): ticks_per_second=None
    try:
        with (out/'samples.jsonl').open('w') as samples:
            while time.monotonic()-start<a.seconds:
                tick=time.monotonic();row={'time':time.time(),'elapsed_s':round(tick-start,3)}
                try:
                    row.update(memory(adb('shell','dumpsys','-t','3','meminfo',PACKAGE)))
                    row['available_kib']=available(adb('shell','cat','/proc/meminfo'))
                    row['pid']=adb('shell','pidof',PACKAGE).strip()
                    if ticks_per_second:
                        try:
                            stat=adb('shell','cat','/proc/'+row['pid']+'/stat').rpartition(') ')[2].split()
                            ticks=int(stat[11])+int(stat[12]); stamp=time.monotonic(); previous=previous_cpu.get(row['pid'])
                            row['cpu_percent_one_core']=None if previous is None else round(100*(ticks-previous[0])/ticks_per_second/(stamp-previous[1]),2)
                            previous_cpu[row['pid']]=(ticks,stamp)
                        except (ValueError,IndexError,RuntimeError):row['cpu_percent_one_core']=None
                    cpu=adb('shell','dumpsys','cpuinfo');m=re.search(r'([\d.]+)%\s+\d+/com\.gsender\.android:',cpu)
                    row['cpu_percent_system_window']=float(m.group(1)) if m else None
                    row['cpu_reported_window']=next((line.strip() for line in cpu.splitlines() if 'CPU usage from' in line),None)
                    battery=adb('shell','dumpsys','battery');m=re.search(r'temperature:\s+(\d+)',battery)
                    row['battery_c']=int(m.group(1))/10 if m else None
                    # Isolated WebView renderers can belong to other apps. Record
                    # candidates separately; never silently add them to app PSS.
                    ps=adb('shell','ps','-A','-o','PID,NAME')
                    candidates=[]
                    for line in ps.splitlines():
                        if 'webview' in line and 'sandboxed_process' in line:
                            pid=line.split()[0];m=memory(adb('shell','dumpsys','-t','3','meminfo',pid));candidates.append({'pid':pid,**m})
                    row['webview_candidates']=candidates
                    if row['pss_kib'] is None:row['error']='App process unavailable'
                except RuntimeError as error:row['error']=str(error)
                row['sample_duration_s']=round(time.monotonic()-tick,3)
                samples.write(json.dumps(row)+'\n');samples.flush();rows.append(row)
                print(json.dumps(row),flush=True)
                danger=(row.get('available_kib') is not None and row['available_kib']<a.min_available_mib*1024) or (row.get('pss_kib') or 0)>a.max_app_mib*1024
                consecutive_bad=consecutive_bad+1 if row.get('error') else 0
                if danger or consecutive_bad>=3:
                    stop_reason='memory_guard' if danger else 'telemetry_failure'
                    print('BENCHMARK STOP: '+stop_reason+'; do not start a larger case.',flush=True)
                    if a.stop_app_on_limit:
                        # Explicit flag is reserved for the isolated, simulated run.
                        try:adb('shell','am','force-stop',PACKAGE)
                        except RuntimeError:pass
                    break
                time.sleep(max(0,a.interval-(time.monotonic()-tick)))
    except KeyboardInterrupt:stop_reason="interrupted"
    finally:
        log.terminate()
        try:log.wait(timeout=3)
        except subprocess.TimeoutExpired:log.kill();log.wait()
        crash.close()
        save('exit-after.txt','shell','dumpsys','activity','exit-info',PACKAGE)
        save('gfx-after.txt','shell','dumpsys','gfxinfo',PACKAGE,'framestats')
        save('thermal-after.txt','shell','dumpsys','thermalservice')
        keys=['time','elapsed_s','pid','pss_kib','rss_kib','swap_pss_kib','available_kib','cpu_percent_one_core','cpu_percent_system_window','battery_c','sample_duration_s','error']
        with (out/'samples.csv').open('w') as f:
            writer=csv.DictWriter(f,fieldnames=keys,extrasaction='ignore');writer.writeheader();writer.writerows(rows)
        valid=[r for r in rows if r.get('pss_kib') is not None]
        report={'stop_reason':stop_reason,'samples':len(rows),'valid_app_samples':len(valid),'errors':sum(bool(r.get('error')) for r in rows),
                'app_peak_pss_mib':max((r['pss_kib']/1024 for r in valid),default=None),
                'app_initial_pss_mib':valid[0]['pss_kib']/1024 if valid else None,'app_final_pss_mib':valid[-1]['pss_kib']/1024 if valid else None,
                'minimum_available_mib':min((r['available_kib']/1024 for r in rows if r.get('available_kib') is not None),default=None),
                'scope':'App process (embedded Node + Android host); WebView candidates separate. cpu_percent_one_core uses /proc interval counters where permitted (100% = one core); cpu_percent_system_window is Android system separate window. Frame stats do not measure all WebView JavaScript work.'}
        (out/'summary.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--adb',default='adb');p.add_argument('--serial',required=True);p.add_argument('--out',required=True)
    sub=p.add_subparsers(dest='command',required=True)
    prep=sub.add_parser('prepare');prep.add_argument('--fixtures')
    sub.add_parser('cleanup')
    mark=sub.add_parser('mark');mark.add_argument('case');mark.add_argument('phase',choices=['load-start','load-ready','run-start','run-finished','pause','resume','unload','settled',
        'visualizer-idle-start','visualizer-idle-end','visualizer-run-start','visualizer-run-end','run-static-start','run-static-end'])
    rec=sub.add_parser('record');rec.add_argument('--seconds',type=int,default=300);rec.add_argument('--interval',type=float,default=3);rec.add_argument('--min-available-mib',type=int,default=512);rec.add_argument('--max-app-mib',type=int,default=1024);rec.add_argument('--stop-app-on-limit',action='store_true',help='Force-stop only gSender if guard trips; use ONLY with simulated controller and no physical CNC')
    a=p.parse_args()
    if a.command=='record' and (a.seconds<=0 or a.interval<1):p.error('positive duration and interval >=1 second required')
    main(a)
