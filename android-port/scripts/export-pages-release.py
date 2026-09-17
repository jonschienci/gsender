"""Export Build 27 and its incremental source patch; never accesses hardware."""
import argparse,hashlib,io,json,subprocess,zipfile
from pathlib import Path
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--output',type=Path,required=True);p.add_argument('--baseline-apk',type=Path,required=True)
args=p.parse_args();root=Path(__file__).resolve().parents[2]
apk=root/'android-port/app/build/outputs/apk/release/app-release.apk'
sha=lambda b:hashlib.sha256(b).hexdigest()
with zipfile.ZipFile(apk) as current,zipfile.ZipFile(args.baseline_apk) as previous:
    assert current.read('lib/armeabi-v7a/libnode.so')==previous.read('lib/armeabi-v7a/libnode.so')
    with zipfile.ZipFile(io.BytesIO(current.read('assets/payload.zip'))) as payload,\
         zipfile.ZipFile(io.BytesIO(previous.read('assets/payload.zip'))) as old:
        ui=[n for n in old.namelist() if n.startswith(('app/','pendant/')) and not n.endswith('/')]
        assert all(payload.read(n)==old.read(n) for n in ui),'Unexpected main/pendant frontend change'
        for name in ['launcher.js','panel.html','panel.js','adaptive-mode.js']:
            assert payload.read('usb-pendant/'+name)==(root/'android-port/pendant'/name).read_bytes()
        assert payload.read('android-usb/index.cjs')==(root/'android-port/usb/js/index.cjs').read_bytes()
        server=payload.read('server.cjs')
        for marker in [b'Invalid pad vector/event',b'Touch jog cancellation not confirmed',b'VPAD_ARMED',b'P2 PCAP ',b'Wi-Fi page cannot jog']:
            assert marker in server,marker

def git(*v):return subprocess.check_output(['git',*v],cwd=root)
tracked=git('diff','HEAD','--name-only').decode().splitlines()
new=git('ls-files','--others','--exclude-standard').decode().splitlines()
names=sorted(set(tracked+new));assert all(n.startswith('android-port/') for n in names)
patch=git('diff','--binary','HEAD')
for name in new:
    r=subprocess.run(['git','diff','--no-index','--binary','--','/dev/null',name],cwd=root,capture_output=True)
    assert r.returncode==1;patch+=r.stdout
subprocess.run(['git','apply','--reverse','--check','-'],input=patch,cwd=root,check=True)
artifacts={'gSender-Android-build-27.apk':apk.read_bytes(),'gSender-Android-build-27-pages.patch':patch,
           'gSender-Android-build-27-mapping.txt':(root/'android-port/app/build/outputs/mapping/release/mapping.txt').read_bytes()}
report={'base_shared_head':git('rev-parse','HEAD').decode().strip(),'source_checkout':str(root),
        'shared_checkout_modified':True,'installed':False,'cnc_motion_tested':False,
        'physical_knob_touch_tested':False,'physical_display_tested':False,
        'libnode_matches_build26':True,'unchanged_frontend_files':len(ui),
        'files':[{'path':n,'sha256':sha((root/n).read_bytes())} for n in names],
        'artifacts':[{'path':str(args.output/n),'bytes':len(b),'sha256':sha(b)} for n,b in artifacts.items()]}
artifacts['gSender-Android-build-27-manifest.json']=(json.dumps(report,indent=2)+'\n').encode()
args.output.mkdir(parents=True,exist_ok=True)
for n in artifacts:
    if(args.output/n).exists():raise SystemExit('Refusing to overwrite '+n)
for n,b in artifacts.items():
    with(args.output/n).open('xb') as f:f.write(b)
for a in report['artifacts']:print(json.dumps(a))
