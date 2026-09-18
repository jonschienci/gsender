from pathlib import Path
import zipfile, hashlib, io, argparse, json
parser = argparse.ArgumentParser()
parser.add_argument("--abi", action="append")
parser.add_argument("--apk", type=Path)
parser.add_argument("--runtime-version")
args = parser.parse_args()
abis = args.abi or ["arm64-v8a", "armeabi-v7a"]
root = Path(__file__).resolve().parents[1]
apk = args.apk or root/'app/build/outputs/apk/debug/app-debug.apk'
with zipfile.ZipFile(apk) as zip:
    packaged_abis = {name.split('/')[1] for name in zip.namelist() if name.startswith('lib/') and name.endswith('.so')}
    assert packaged_abis == set(abis), f'Unexpected APK architectures: {packaged_abis}'
    if args.runtime_version:
        info = json.loads(zip.read('assets/node-runtime/build-info.json'))
        assert info['version'] == args.runtime_version
        assert zip.read('assets/node-runtime/LICENSE')
        for abi in abis:
            library = zip.read(f'lib/{abi}/libnode.so')
            assert ('v' + args.runtime_version).encode() in library, 'Runtime version not found in native library'
            # Gradle strips native debug symbols; source provenance hashes the unstripped input.
            provenance = info.get('runtimes', {}).get(abi, info)
            assert provenance['abi'] == abi, 'Runtime provenance architecture mismatch'
            assert provenance['version'] == info['version'], 'Mixed Node versions'
            elf_class, machine = {'armeabi-v7a': (1, 40), 'arm64-v8a': (2, 183)}[abi]
            assert library[:4] == b'\x7fELF' and library[4] == elf_class and library[5] == 1
            assert int.from_bytes(library[18:20], 'little') == machine, 'Native library architecture mismatch'
    for abi in abis:
        for library in ('libnode.so', 'libgsender_bridge.so', 'libc++_shared.so'):
            assert f'lib/{abi}/{library}' in zip.namelist(), f'Missing {abi}/{library}'
    payload = zip.read('assets/payload.zip')
    assert hashlib.sha256(payload).hexdigest() == zip.read('assets/payload.sha256').decode().strip()
    with zipfile.ZipFile(io.BytesIO(payload)) as contents:
        assert 'GSENDER_LOCAL_TOKEN' in contents.read('bootstrap.cjs').decode()
        assert 'application.css' not in contents.read('app/index.html').decode()
        assert not any(name.startswith('test/') for name in contents.namelist())
print(f'APK payload and native libraries verified ({apk.stat().st_size/1024/1024:.1f} MiB).')
