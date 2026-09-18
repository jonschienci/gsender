import asyncio, hashlib, json, tempfile, unittest
from pathlib import Path
from jobs import generate, canonical, MARKER
from grbl_sim import Controller
from tablet import memory, available
from report import summarize, visualizer_records, VISUALIZER_PREFIX
class Writer:
    def __init__(self):self.data=b''
    def is_closing(self):return False
    def write(self,b):self.data+=b
class Tests(unittest.TestCase):
    def test_fixture_geometry_and_reproducibility(self):
        with tempfile.TemporaryDirectory() as d:
            for p in ('contour','relief','arcs'):
                a=generate(d,p,4096);b=generate(d,p,4096);self.assertEqual(a,b)
                lines=Path(d,a['file']).read_text().splitlines();words=[canonical(l) for l in lines if canonical(l)]
                self.assertEqual(words[0],MARKER);self.assertEqual(words[-1],'M2')
                self.assertNotIn('M3',words);self.assertGreaterEqual(a['bytes'],4096)
                self.assertEqual(hashlib.sha256(('\n'.join(words)+'\n').encode()).hexdigest(),a['command_sha256'])
    def test_stream_hash_hold_resume_and_fragmentation(self):
        with tempfile.TemporaryDirectory() as d:
            expected=generate(d,'relief',4096);events=[]
            c=Controller(500,lambda event,**kw:events.append({'event':event,**kw}),expected);c.writer=Writer()
            for l in Path(d,expected['file']).read_bytes().splitlines():
                c.accept(l[:3]);c.accept(l[3:]+b'\n')
                if c.queue:
                    c.accept(b'!');n=c.acknowledged;c.consume();self.assertEqual(n,c.acknowledged)
                    c.accept(b'~');c.consume()
            result=next(e for e in events if e['event']=='job_completed')
            self.assertTrue(result['expected_match']);self.assertEqual(result['rx_overflows'],0)
    def test_reset_cannot_complete_job(self):
        events=[];c=Controller(500,lambda e,**k:events.append(e));c.writer=Writer()
        c.accept((MARKER+'\nG1X1\n').encode());c.accept(b'\x18');c.consume()
        self.assertFalse(c.queue);self.assertFalse(c.running);self.assertIn('job_aborted',events);self.assertNotIn('job_completed',events)
    def test_receive_buffer_is_bounded(self):
        events=[];c=Controller(500,lambda e,**k:events.append(e));c.writer=Writer()
        c.accept((MARKER+'\n').encode())
        for _ in range(100):c.accept(b'G1X100Y100Z-1F1000\n')
        self.assertLessEqual(sum(len(x)+1 for x in c.queue),1024)
        self.assertIn('rx_overflow',events);self.assertIn(b'error:24',c.writer.data)
    def test_unknown_stream_cannot_pass_checksum(self):
        events=[];c=Controller(500,lambda e,**k:events.append({'event':e,**k}),[{'file':'expected.nc','commands':2,'command_sha256':'not-the-stream-hash'}]);c.writer=Writer()
        c.accept((MARKER+'\nM2\n').encode());c.consume();c.consume()
        result=next(e for e in events if e['event']=='job_completed')
        self.assertFalse(result['expected_match']);self.assertIsNone(result['expected_file'])
    def test_report_does_not_call_unverified_stream_a_pass(self):
        with tempfile.TemporaryDirectory() as d:
            event={'event':'job_completed','acknowledged':10,'seconds':2,'achieved_lines_per_second':5,'rx_overflows':0}
            Path(d,'simulator.jsonl').write_text(json.dumps(event)+'\n')
            report=summarize(d)
            self.assertIn('NOT CHECKED',report);self.assertNotIn('PASS',report)
            self.assertIn('No valid app memory samples',report)
    def test_android_memory_parsing(self):
        self.assertEqual(memory('TOTAL PSS: 1000 TOTAL RSS: 2000 TOTAL SWAP PSS: 20'),{'pss_kib':1000,'rss_kib':2000,'swap_pss_kib':20})
        self.assertIsNone(memory('No process')['pss_kib']);self.assertEqual(available('MemAvailable: 34567 kB'),34567)
    def test_progress_counters_do_not_replace_integrity_checks(self):
        events=[];c=Controller(500,lambda e,**k:events.append({'event':e,**k}));c.writer=Writer()
        c.accept((MARKER+'\nG1X1\n').encode());c.consume()
        start=c.job_start
        c.progress(start+.5,100);self.assertFalse(any(e['event']=='job_progress' for e in events))
        c.progress(start+1,101)
        first=events[-1];self.assertEqual(first['interval_commands'],1);self.assertEqual(first['interval_start'],100)
        self.assertEqual(first['max_status_poll_gap_ms'],1000)
        c.consume();c.progress(start+2,102)
        self.assertEqual(events[-1]['interval_commands'],1)
        self.assertFalse(any(e['event']=='job_completed' for e in events))
    def test_visualizer_report_correlates_complete_phase_windows(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)
            gesture={'event':'gesture','schema':1,'kind':'pan','reason':'released',
                     'contextStart':{'workflowState':'running'},'contextEnd':{'workflowState':'running'},
                     'frameGapMs':{'p95':40,'max':110},'eventDispatchDelayMs':{'p95':3},
                     'eventToRafMs':{'p95':45},'framesOver50Ms':1,'longTaskMs':None}
            (root/'logcat.txt').write_text('100 I gSenderBench: '+VISUALIZER_PREFIX+json.dumps(gesture)+'\n'
                                         +'101 I gSenderBench: '+VISUALIZER_PREFIX+'{truncated\n')
            records,invalid=visualizer_records(root/'logcat.txt');self.assertEqual(len(records),1);self.assertEqual(invalid,1)
            phases=[{'time':100,'case':'relief','phase':'visualizer-run-start'},
                    {'time':103,'case':'relief','phase':'visualizer-run-end'}]
            (root/'phases.jsonl').write_text('\n'.join(map(json.dumps,phases)))
            progress=[{'event':'job_progress','time':101,'interval_start':100,'interval_seconds':1,'interval_commands':500,'max_status_poll_gap_ms':90},
                      {'event':'job_progress','time':102,'interval_start':101,'interval_seconds':1,'interval_commands':480,'max_status_poll_gap_ms':110},
                      {'event':'job_progress','time':104,'interval_start':102,'interval_seconds':2,'interval_commands':1,'max_status_poll_gap_ms':2000}]
            (root/'simulator.jsonl').write_text('\n'.join(map(json.dumps,progress)))
            text=summarize(root)
            self.assertIn('| 1 | running | pan | 3.0 | 45.0 | 40.0 / 110.0 | 1 | — |',text)
            self.assertIn('| relief / visualizer-run | 2 | 490.0 | 110.0 |',text)
            self.assertIn('Invalid or truncated telemetry records: 1',text)
            self.assertNotIn('PASS',text)
    def test_old_capture_does_not_claim_smooth_visualizer(self):
        with tempfile.TemporaryDirectory() as d:
            text=summarize(d)
            self.assertIn('NOT MEASURED',text);self.assertIn('not a zero-lag result',text)
if __name__=='__main__':unittest.main()
