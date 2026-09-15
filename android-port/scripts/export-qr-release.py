"""Export this isolated QR candidate; never installs an APK or accesses a device."""
from pathlib import Path
import hashlib, io, json, subprocess, zipfile

root = Path(__file__).resolve().parents[2]
out = root.parent.parent / 'outputs'
apk = root / 'android-port/app/build/outputs/apk/release/app-release.apk'
previous = out / 'gSender-Android-build-25.apk'
digest = lambda data: hashlib.sha256(data).hexdigest()
with zipfile.ZipFile(apk) as archive, zipfile.ZipFile(previous) as old:
    assert archive.read('lib/armeabi-v7a/libnode.so') == old.read('lib/armeabi-v7a/libnode.so')
    assert archive.read('assets/qr-decoder/LICENSE') and archive.read('assets/qr-decoder/NOTICE')
    with zipfile.ZipFile(io.BytesIO(archive.read('assets/payload.zip'))) as payload:
        for name in ['launcher.js','panel.html','panel.js','adaptive-mode.js']:
            assert payload.read('usb-pendant/'+name) == (root/'android-port/pendant'/name).read_bytes()
        server = payload.read('server.cjs')
        assert b'scan-begin' in server and b'scan-commit' in server and b'GSK1:' in server
        assert b'0{64}' in server

changed = subprocess.check_output(['git','diff','HEAD','--name-only'],cwd=root,text=True).splitlines()
artifacts = {
    'gSender-Android-build-26.apk':apk.read_bytes(),
    'gSender-Android-build-26-qr.patch':subprocess.check_output(['git','diff','--binary','HEAD'],cwd=root),
    'gSender-Android-build-26-mapping.txt':(root/'android-port/app/build/outputs/mapping/release/mapping.txt').read_bytes(),
}
report = {'base_snapshot':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),
    'base_shared_head':'f27a99367ecd09a8df81596ab350be9b07d2eadd',
    'base_includes':'Build25 Wi-Fi uncommitted shared changes',
    'candidate':str(root),'shared_checkout_modified':False,'installed':False,'hardware_camera_tested':False,
    'libnode_matches_build25':True,
    'files':[{'path':name,'sha256':digest((root/name).read_bytes())} for name in changed],
    'artifacts':[{'path':str(out/name),'bytes':len(data),'sha256':digest(data)} for name,data in artifacts.items()]}
artifacts['gSender-Android-build-26-manifest.json']=(json.dumps(report,indent=2)+'\n').encode()
for name in artifacts:
    if (out/name).exists(): raise SystemExit('Refusing to overwrite existing artifact: '+name)
for name,data in artifacts.items():
    with (out/name).open('xb') as file: file.write(data)
for item in report['artifacts']: print(json.dumps(item))
