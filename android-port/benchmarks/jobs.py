"""Deterministic G-code fixtures for the loopback CNC simulator, never a real machine."""
import argparse, hashlib, json, math, re
from pathlib import Path
MARKER = 'G4P0.123'
PROFILES = ('contour', 'relief', 'arcs')
def canonical(line):
    return re.sub(r'\s+', '', re.sub(r'\([^)]*\)', '', line.split(';', 1)[0])).upper()
def commands(profile):
    i = 0
    while True:
        if profile == 'contour':
            x, y = ((0, 0), (100, 0), (100, 100), (0, 100))[i % 4]
            yield f'G1 X{x:.3f} Y{y:.3f} Z-1.000 F1200'
        elif profile == 'relief':
            row, col = divmod(i, 1001)
            x = (col if row % 2 == 0 else 1000-col)/10
            y = (row % 1001)/10
            z = -1.5 + .8*math.sin(x*.17)*math.cos(y*.13)
            yield f'G1 X{x:.3f} Y{y:.3f} Z{z:.3f} F1800'
        elif profile == 'arcs':
            # Repeated valid semicircles, alternating 10,50 -> 90,50 -> 10,50.
            yield 'G2 X90.000 Y50.000 I40.000 J0.000 F1200' if i % 2 == 0 else 'G2 X10.000 Y50.000 I-40.000 J0.000 F1200'
        else: raise ValueError(profile)
        i += 1

def generate(folder, profile, target_bytes):
    folder = Path(folder); folder.mkdir(parents=True, exist_ok=True)
    name = f'{profile}-{target_bytes//1024}KiB.nc'; dest = folder/name
    digest = hashlib.sha256(); count = 0; size = 0
    with dest.open('wb') as f:
        def emit(line):
            nonlocal count, size
            raw = (line+'\n').encode('ascii'); f.write(raw); size += len(raw)
            normalized = canonical(line)
            if normalized: count += 1; digest.update((normalized+'\n').encode('ascii'))
        emit('; SIMULATOR BENCHMARK ONLY - NO PHYSICAL CNC')
        for line in [MARKER, 'G21', 'G90', 'G17', 'G94', 'M5', 'M9', 'G0 X10.000 Y50.000 Z5.000']: emit(line)
        for line in commands(profile):
            emit(line)
            if size >= target_bytes: break
        emit('M2')
    result = {'file':name, 'profile':profile, 'bytes':size, 'commands':count,
              'sha256':hashlib.sha256(dest.read_bytes()).hexdigest(), 'command_sha256':digest.hexdigest(),
              'scope':'loopback simulator only; no spindle command; NOT for physical machining'}
    dest.with_suffix('.json').write_text(json.dumps(result,indent=2)+'\n')
    return result
if __name__ == '__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--out',required=True);p.add_argument('--kib',type=int,nargs='+',default=[128,1024]);p.add_argument('--profiles',choices=PROFILES,nargs='+',default=list(PROFILES));p.add_argument('--large',action='store_true',help='Allow fixtures larger than 20 MiB; generate only, do not execute')
    a=p.parse_args()
    if any(n<=0 or (n>20480 and not a.large) for n in a.kib):p.error('Use positive sizes; >20 MiB requires --large')
    manifest=[generate(a.out,profile,n*1024) for n in a.kib for profile in a.profiles]
    Path(a.out,'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n');print(json.dumps(manifest,indent=2))
