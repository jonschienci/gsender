#!/usr/bin/env python3
"""Check a selected tablet/emulator APK without clearing user data or issuing CNC commands.
Run only with the controller disconnected. Omit --apk to check the current installation.
"""
import argparse,subprocess,json,time,re,hashlib
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--adb',default='adb');p.add_argument('--serial',required=True);p.add_argument('--apk',type=Path);p.add_argument('--output',type=Path,required=True);p.add_argument('--launches',type=int,default=2);p.add_argument('--defer-webview',choices=['true','false'],default='false');a=p.parse_args()
a.output.mkdir(parents=True,exist_ok=True)
base=[a.adb,'-s',a.serial];pkg='com.gsender.android'
def adb(*args):return subprocess.check_output(base+list(args),text=True,timeout=90).strip()
assert adb('get-state')=='device'
if a.apk:
 print(adb('install','-r',str(a.apk)),flush=True)
 installed=adb('shell','pm','path',pkg).removeprefix('package:')
 assert adb('shell','sha256sum',installed).split()[0]==hashlib.sha256(a.apk.read_bytes()).hexdigest()
# Per-tag logging avoids changing the tablet's global log-volume setting.
previous_log_level=adb('shell','getprop','log.tag.gSenderStartup')
adb('shell','setprop','log.tag.gSenderStartup','I')
try:
 results=[]
 for i in range(a.launches):
  adb('shell','am','force-stop',pkg)
  # The timestamp filter preserves other applications' logs.
  stamp=adb('shell',"date '+%m-%d %H:%M:%S.000'")
  launch=adb('shell','am','start','-W','-n',pkg+'/.MainActivity','--ez','defer_webview',a.defer_webview)
  assert 'Status: ok' in launch,launch
  logs=''
  for _ in range(60):
   time.sleep(1)
   pid=adb('shell','pidof',pkg).split()[0]
   logs=adb('logcat','-d','-T',stamp,'-v','brief','--pid='+pid)
   if re.search(r'FATAL EXCEPTION|Fatal signal|gSender stopped:|Backend stopped|Cannot find module|out of memory',logs,re.I):raise RuntimeError(logs[-4000:])
   if 'page_loaded t=' in logs and ('backend_ready t=' in logs):break
  else:raise RuntimeError('App did not load: '+logs[-3000:])
  (a.output/f'launch-{i+1}.log').write_text(logs)
  stages=[x for x in logs.splitlines() if 'gSenderStartup' in x or 'GSENDER_STARTUP' in x]
  results.append({'launch':i+1,'deferred':a.defer_webview=='true','stages':stages,'amStart':launch})
  print(json.dumps(results[-1]),flush=True)
 (a.output/'launches.json').write_text(json.dumps({'serial':a.serial,'model':adb('shell','getprop','ro.product.model'),'pageSize':adb('shell','getconf','PAGE_SIZE'),'package':adb('shell','dumpsys','package',pkg),'launches':results},indent=2))
 with (a.output/'screen.png').open('wb') as out:subprocess.run(base+['exec-out','screencap','-p'],stdout=out,check=True,timeout=20)
 print('PASS: install/hash (if supplied), startup, repeated launches and fatal-error checks; no machine commands sent')
finally:
 adb('shell','setprop','log.tag.gSenderStartup',previous_log_level or "''")
