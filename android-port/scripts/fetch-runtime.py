from pathlib import Path
import hashlib, json, tempfile, urllib.request, zipfile
root = Path(__file__).resolve().parents[1]
info = json.loads((root/'vendor-manifest.json').read_text())['nodejsMobile']
target = root/'vendor/node'
with tempfile.TemporaryDirectory() as temp:
    archive = Path(temp)/'node.zip'
    urllib.request.urlretrieve(info['url'], archive)
    if hashlib.sha256(archive.read_bytes()).hexdigest() != info['sha256']:
        raise RuntimeError('Node runtime checksum mismatch')
    target.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(archive) as zip:
        for item in zip.infolist():
            if not (target/item.filename).resolve().is_relative_to(target.resolve()):
                raise RuntimeError('Invalid archive path')
        zip.extractall(target)
print('Verified Android Node runtime installed in', target)
