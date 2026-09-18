"""Loopback-only GRBL controller simulator. No serial/USB driver or machine access."""
import argparse, asyncio, hashlib, json, re, time
from collections import deque
from pathlib import Path
from jobs import canonical, MARKER
class Controller:
    def __init__(self, rate, emit, expected=None, rx_buffer=1024):
        self.rate=rate; self.emit=emit; self.expected=([expected] if isinstance(expected,dict) else expected); self.writer=None; self.rx_buffer=rx_buffer
        self.queue=deque(); self.partial=bytearray(); self.hold=False; self.running=False
        self.position=[0.,0.,0.]; self.received=0; self.acknowledged=0; self.digest=None
        self.job_start=0; self.last_rx=0; self.max_gap=0; self.poll_at=0; self.poll_gap=0; self.overflow=0
        self.progress_at=0; self.progress_acked=0; self.progress_poll_gap=0
    def reply(self, text):
        if self.writer and not self.writer.is_closing():self.writer.write(text.encode('ascii'))
    def status(self):
        now=time.monotonic()
        if self.poll_at and self.running:
            self.poll_gap=max(self.poll_gap,now-self.poll_at)
            self.progress_poll_gap=max(self.progress_poll_gap,now-self.poll_at)
        self.poll_at=now
        state='Hold:0' if self.hold else 'Run' if self.running else 'Idle'
        self.reply(f'<{state}|MPos:{",".join(f"{p:.3f}" for p in self.position)}|Bf:15,{max(0,self.rx_buffer-sum(len(x)+1 for x in self.queue))}|FS:0,0|WCO:0,0,0|Ov:100,100,100>\n')
    def cancel(self, reason):
        if self.running:self.emit('job_aborted',reason=reason,acknowledged=self.acknowledged)
        self.running=False;self.hold=False;self.queue.clear();self.partial.clear()
    def accept(self, raw):
        for byte in raw:
            if byte in (ord('?'),0x80,0x87):self.status()
            elif byte==ord('!'):self.hold=True;self.emit('hold');self.status()
            elif byte==ord('~'):self.hold=False;self.emit('resume');self.status()
            elif byte in (0x18,0x19,0x85):self.cancel('reset/cancel');self.reply('GrblHAL 1.1f [SIMULATOR]\n');self.status()
            elif byte>=0x80:pass
            elif byte in (10,13):
                if self.partial:
                    line=canonical(self.partial.decode('ascii',errors='replace'));self.partial.clear()
                    if line:self.line(line)
            else:
                self.partial.append(byte)
                if len(self.partial)>1024:self.cancel('oversized line');self.reply('error:11\n')
    def line(self, line):
        if line=='$I':self.reply(f'[VER:1.1f.20260911:SIMULATOR]\n[OPT:V,15,{self.rx_buffer}]\n[AXS:3:XYZ]\nok\n');return
        if line=='$$':self.reply('$0=10\n$1=25\n$10=511\n$11=0.010\n$12=0.002\n$13=0\n$20=0\n$21=0\n$22=0\n$30=24000\n$31=0\n$32=0\n$100=200\n$101=200\n$102=200\n$110=5000\n$111=5000\n$112=2000\n$120=200\n$121=200\n$122=100\n$130=500\n$131=500\n$132=100\nok\n');return
        if line=='$G':self.reply('[GC:G0 G54 G17 G21 G90 G94 M5 M9 T0 F0 S0]\nok\n');return
        if line=='$#':
            self.reply(''.join(f'[G{n}:0,0,0]\n' for n in range(54,60))+'[G28:0,0,0]\n[G30:0,0,0]\n[G92:0,0,0]\n[TLO:0]\n[PRB:0,0,0:0]\nok\n');return
        if line.startswith('$'):self.reply('ok\n');return
        if line==MARKER:
            if self.running:self.cancel('new job')
            self.running=True;self.received=0;self.acknowledged=0;self.digest=hashlib.sha256()
            self.job_start=time.monotonic();self.last_rx=0;self.max_gap=0;self.poll_gap=0;self.overflow=0
            self.progress_at=self.job_start;self.progress_acked=0;self.progress_poll_gap=0;self.poll_at=0
            self.emit('job_started',rate_lines_per_second=self.rate,rx_buffer=self.rx_buffer)
        if not self.running:self.reply('ok\n');return
        now=time.monotonic()
        if self.last_rx:self.max_gap=max(self.max_gap,now-self.last_rx)
        self.last_rx=now;self.received+=1
        queued=sum(len(x)+1 for x in self.queue)+len(line)+1
        if queued>self.rx_buffer:
            self.overflow+=1;self.emit('rx_overflow',queued_bytes=queued);self.reply('error:24\n');return
        self.queue.append(line)
    def consume(self):
        if not self.queue or self.hold:return
        line=self.queue.popleft();self.digest.update((line+'\n').encode('ascii'));self.acknowledged+=1
        for axis,value in re.findall(r'([XYZ])(-?\d+(?:\.\d+)?)',line):self.position['XYZ'.index(axis)]=float(value)
        self.reply('ok\n')
        if line in ('M2','M30'):
            elapsed=time.monotonic()-self.job_start; sha=self.digest.hexdigest()
            match=next((item for item in self.expected or [] if sha==item['command_sha256'] and self.acknowledged==item['commands']),None)
            self.emit('job_completed',seconds=elapsed,acknowledged=self.acknowledged,received=self.received,
                      achieved_lines_per_second=self.acknowledged/elapsed,command_sha256=sha,
                      expected_match=None if not self.expected else match is not None,expected_file=match['file'] if match else None,
                      max_receive_gap_ms=self.max_gap*1000,max_status_poll_gap_ms=self.poll_gap*1000,rx_overflows=self.overflow)
            self.running=False;self.reply('[MSG:Pgm End]\n');self.status()
    def progress(self, now=None, wall=None):
        now=time.monotonic() if now is None else now
        if not self.running or now-self.progress_at<1:return
        seconds=now-self.progress_at;count=self.acknowledged-self.progress_acked
        poll_gap=max(self.progress_poll_gap,now-(self.poll_at or self.job_start))
        self.emit('job_progress',interval_start=(time.time() if wall is None else wall)-seconds,
                  interval_seconds=seconds,acknowledged=self.acknowledged,interval_commands=count,
                  lines_per_second=count/seconds,held=self.hold,max_status_poll_gap_ms=poll_gap*1000)
        self.progress_at=now;self.progress_acked=self.acknowledged;self.progress_poll_gap=0
    async def tick(self):
        credit=0.;previous=time.monotonic()
        while True:
            await asyncio.sleep(.005);now=time.monotonic()
            credit=min(16.,credit+(now-previous)*self.rate);previous=now
            self.progress(now)
            if self.hold or not self.queue:credit=min(credit,1.);continue
            while credit>=1 and self.queue:self.consume();credit-=1
    async def connection(self, reader, writer):
        if self.writer and not self.writer.is_closing():writer.close();await writer.wait_closed();return
        self.writer=writer;self.emit('connected');self.reply('GrblHAL 1.1f [SIMULATOR]\n')
        ticker=asyncio.create_task(self.tick())
        try:
            while data:=await reader.read(4096):self.accept(data);await writer.drain()
        finally:
            ticker.cancel();self.cancel('disconnected');writer.close();await writer.wait_closed();self.writer=None;self.emit('disconnected')
async def main(a):
    logfile=Path(a.log);logfile.parent.mkdir(parents=True,exist_ok=True)
    def emit(event,**values):
        entry={'time':time.time(),'event':event,**values}
        with logfile.open('a') as f:f.write(json.dumps(entry)+'\n')
        print(json.dumps(entry),flush=True)
    expected=json.loads(Path(a.job).with_suffix('.json').read_text()) if a.job else None
    if a.fixtures:expected=[json.loads(p.read_text()) for p in Path(a.fixtures).glob('*.json') if p.name!='manifest.json']
    if a.fixtures and not expected:raise SystemExit('No fixture sidecars found')
    ctrl=Controller(a.rate,emit,expected)
    server=await asyncio.start_server(ctrl.connection,'127.0.0.1',a.port)
    print(f'SIMULATOR ONLY: 127.0.0.1:{a.port}, {a.rate} acknowledged lines/s',flush=True)
    async with server:await server.serve_forever()
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--port',type=int,default=18823);p.add_argument('--rate',type=float,default=500);p.add_argument('--log',required=True);checks=p.add_mutually_exclusive_group();checks.add_argument('--job',help='Fixture path to verify exact streamed command count/hash');checks.add_argument('--fixtures',help='Directory of generated fixture sidecars to verify multiple jobs');a=p.parse_args()
    if not 0<a.rate<=10000:p.error('rate must be 1..10000')
    try:asyncio.run(main(a))
    except KeyboardInterrupt:pass
