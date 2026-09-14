#!/usr/bin/env python3
"""Build a pinned upstream Node shared library for 32-bit Android on Linux x64."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import shutil
import subprocess
import tarfile
import time

here = Path(__file__).resolve().parent
info = json.loads((here / 'source.json').read_text())
p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--ndk', type=Path, required=True)
p.add_argument('--work', type=Path, required=True)
p.add_argument('--output', type=Path, required=True)
p.add_argument('--jobs', type=int, default=4)
a = p.parse_args()
if platform.system() != 'Linux' or platform.machine() not in ('x86_64', 'AMD64'):
    p.error('Use Linux x86_64 with gcc-multilib and g++-multilib; ARM snapshots need 32-bit host tools.')
work, output, ndk = a.work.resolve(), a.output.resolve(), a.ndk.resolve()
work.mkdir(parents=True, exist_ok=True)
archive = work / ('node-v' + info['version'] + '.tar.xz')
if not archive.exists():
    subprocess.run(['curl', '--fail', '--location', '--output', str(archive), info['url']], check=True)
if hashlib.sha256(archive.read_bytes()).hexdigest() != info['sha256']:
    raise RuntimeError('Upstream Node source checksum mismatch')
source = work / ('node-v' + info['version'])
if not source.exists():
    with tarfile.open(archive) as tar:
        tar.extractall(work, filter='data')
    # Patches are narrowly scoped and fail rather than silently ignoring upstream changes.
    for patch in sorted(here.glob('linux-*.patch')):
        subprocess.run(['patch', '-p1', '--batch', '--forward', '-i', str(patch)], cwd=source, check=True)
toolchain = ndk / 'toolchains/llvm/prebuilt/linux-x86_64/bin'
env = os.environ.copy()
env.update(CC=str(toolchain / 'armv7a-linux-androideabi26-clang'),
           CXX=str(toolchain / 'armv7a-linux-androideabi26-clang++'),
           AR=str(toolchain / 'llvm-ar'), RANLIB=str(toolchain / 'llvm-ranlib'),
           CC_host='gcc -m32', CXX_host='g++ -m32', AR_host='ar',
           GYP_DEFINES=f'target_arch=arm v8_target_arch=arm android_target_arch=arm host_os=linux OS=android android_ndk_path={ndk}')
env['PATH'] = str(toolchain) + os.pathsep + env['PATH']
if shutil.which('ccache'):
    for key in ('CC', 'CXX', 'CC_host', 'CXX_host'):
        env[key] = 'ccache ' + env[key]
    env['CCACHE_BASEDIR'] = str(work)
    env['CCACHE_MAXSIZE'] = '4G'
    # SDK installation timestamps can differ between otherwise identical runners.
    env['CCACHE_COMPILERCHECK'] = 'content'
flags = ['--dest-cpu=arm', '--dest-os=android', '--cross-compiling', '--shared',
         '--openssl-no-asm', '--without-node-snapshot', '--without-node-code-cache', '--with-intl=small-icu']
subprocess.run(['./configure', *flags], cwd=source, env=env, check=True)
# Build only the APK library, not the unused Node executable and cctest target.
started = time.monotonic()
command = ['make', '-C', 'out', 'BUILDTYPE=Release', '-j' + str(a.jobs), 'libnode']
compiler = subprocess.Popen(command, cwd=source, env=env)
while True:
    try:
        result = compiler.wait(timeout=60)
        if result:
            raise subprocess.CalledProcessError(result, command)
        break
    except subprocess.TimeoutExpired:
        objects = sum(1 for _ in (source / 'out/Release').rglob('*.o'))
        memory = next(line.strip() for line in Path('/proc/meminfo').read_text().splitlines()
                      if line.startswith('MemAvailable:'))
        print(f'BUILD_PROGRESS elapsed={int(time.monotonic() - started)}s objects={objects} '
              f'load={os.getloadavg()} {memory}', flush=True)
        stats = subprocess.run(['ps', '-eo', 'pid,pcpu,rss,comm', '--sort=-pcpu'],
                               capture_output=True, text=True, check=True)
        print('\n'.join(stats.stdout.splitlines()[:7]), flush=True)
libs = [x for x in (source / 'out/Release').glob('libnode.so*') if x.is_file()]
if not libs:
    libs = [x for x in (source / 'out/Release/obj.target').glob('libnode.so*') if x.is_file()]
if not libs:
    raise RuntimeError('Build produced no libnode shared library')
dest = output / 'bin/armeabi-v7a'
dest.mkdir(parents=True, exist_ok=True)
shutil.copy2(libs[0], dest / 'libnode.so')
subprocess.run(['python3', 'tools/install.py', 'install', '--headers-only', '--silent',
                '--dest-dir', str(output), '--prefix', '/'], cwd=source, env=env, check=True)
shutil.copy2(source / 'LICENSE', output / 'LICENSE')
metadata = {**info, 'configureFlags': flags, 'librarySha256': hashlib.sha256((dest / 'libnode.so').read_bytes()).hexdigest()}
(output / 'build-info.json').write_text(json.dumps(metadata, indent=2) + '\n')
subprocess.run([str(toolchain / 'llvm-readelf'), '-h', '-d', str(dest / 'libnode.so')], check=True)
print('Runtime staged at', output)
