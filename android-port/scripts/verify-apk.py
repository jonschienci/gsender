from pathlib import Path
import zipfile, hashlib, io
root = Path(__file__).resolve().parents[1]
apk = root/'app/build/outputs/apk/debug/app-debug.apk'
with zipfile.ZipFile(apk) as zip:
    for abi in ('arm64-v8a', 'armeabi-v7a'):
        for library in ('libnode.so', 'libgsender_bridge.so', 'libc++_shared.so'):
            assert f'lib/{abi}/{library}' in zip.namelist(), f'Missing {abi}/{library}'
    payload = zip.read('assets/payload.zip')
    assert hashlib.sha256(payload).hexdigest() == zip.read('assets/payload.sha256').decode().strip()
    with zipfile.ZipFile(io.BytesIO(payload)) as contents:
        assert 'GSENDER_LOCAL_TOKEN' in contents.read('bootstrap.cjs').decode()
        assert 'application.css' not in contents.read('app/index.html').decode()
        assert not any(name.startswith('test/') for name in contents.namelist())
print(f'APK payload and native libraries verified ({apk.stat().st_size/1024/1024:.1f} MiB).')
