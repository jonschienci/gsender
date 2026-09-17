from pathlib import Path
import shutil, hashlib, zipfile, re
root = Path(__file__).resolve().parents[2]
payload = root / 'android-port/build/payload'
shutil.rmtree(payload / 'node_modules', ignore_errors=True)
shutil.copytree(root / 'android-port/runtime-deps/node_modules', payload / 'node_modules', dirs_exist_ok=True)
for name in ('images', 'assets'):
    shutil.copytree(root / 'src/app' / name, payload / 'app' / name, dirs_exist_ok=True)
shutil.copyfile(root / 'src/app/favicon.ico', payload / 'app/favicon.ico')
# application.css is the duplicate generated Tailwind entry; index.css is built by Vite.
html = payload / 'app/index.html'
html.write_text(re.sub(r'(<meta[^>]*name="viewport"[^>]*content=")[^"]*', r'\g<1>width=1280, user-scalable=no', html.read_text()))
import re
html.write_text(re.sub(r'<link\b[^>]*href="\.?/src/application.css"[^>]*>', '', html.read_text()))
# Read the APK's single build-number source every time the payload is packaged,
# including releases that reuse the previously compiled frontend.
version = re.search(r'^\s*versionCode\s+([1-9][0-9]*)\s*$',
                    (root / 'android-port/app/build.gradle').read_text(), re.MULTILINE)
if not version:
    raise RuntimeError('Cannot find Android versionCode for the in-app build label')
build_label = ('<script id="android-build-number">window.__gsenderAndroidBuildNumber='
               + version.group(1) + ';</script>')
for entry in (payload / 'app/index.html', payload / 'pendant/index.html'):
    page = entry.read_text()
    page = re.sub(r'<script id="android-build-number">[^<]*</script>', '', page)
    if '<head>' not in page:
        raise RuntimeError(f'Cannot insert Android build label into {entry}')
    page = page.replace('<head>', '<head>' + build_label, 1)
    entry.write_text(page)
    if '/usb-pendant/launcher.js' not in page:
        entry.write_text(page.replace('</body>', '<script defer src="/usb-pendant/launcher.js"></script></body>'))
native = list(payload.rglob('*.node'))
if native: raise RuntimeError(f'Desktop native modules in payload: {native}')
assets = root / 'android-port/app/src/main/assets'
assets.mkdir(parents=True, exist_ok=True)
archive = assets / 'payload.zip'
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as zip:
    for file in sorted(payload.rglob('*')):
        if not file.is_file(): continue
        relative = file.relative_to(payload)
        if '.bin' in relative.parts or file.suffix == '.map': continue
        zip.write(file, relative)
(assets / 'payload.sha256').write_text(hashlib.sha256(archive.read_bytes()).hexdigest()+'\n')
print(f'Packaged payload: {archive.stat().st_size / 1024 / 1024:.1f} MiB')
