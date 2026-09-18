"""Summarize one tablet capture and its optional simulator log as Markdown."""
import argparse
import json
import statistics
from pathlib import Path

VISUALIZER_PREFIX = 'GSENDER_VISUALIZER_BENCHMARK '


def visualizer_records(path):
    records, invalid = [], 0
    if not path.exists():
        return records, invalid
    # Stream potentially large logcat captures instead of copying the whole log.
    with path.open(errors='replace') as log:
        for line in log:
            if 'gSenderBench' not in line or VISUALIZER_PREFIX not in line:
                continue
            try:
                record = json.loads(line.split(VISUALIZER_PREFIX, 1)[1])
                if record.get('schema') != 1 or record.get('event') not in ('ready', 'gesture'):
                    raise ValueError('Unsupported record')
                records.append(record)
            except (ValueError, AttributeError):
                invalid += 1
    return records, invalid


def interaction_report(folder, events, samples):
    records, invalid = visualizer_records(folder / 'logcat.txt')
    gestures = [r for r in records if r.get('event') == 'gesture']
    lines = ['', '## Visualizer interaction', '']
    if not gestures:
        lines += ['**NOT MEASURED:** no gesture telemetry captured. This is not a zero-lag result. '
                  'The installed build must include the opt-in visualizer instrumentation and gestures must be performed during recording.']
    else:
        lines += ['Values below are main-thread timing proxies, not hardware input-to-display latency or presented FPS.', '',
                  '| Gesture | Job state | Kind | Event dispatch p95 (ms) | Event → rAF p95 (ms) | Frame gap p95 / max (ms) | Gaps >50 ms | Long tasks (ms) |',
                  '| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |']
        def number(value):
            return '—' if value is None else f'{value:.1f}'
        warnings = []
        for i, record in enumerate(gestures, 1):
            start = record.get('contextStart', {}).get('workflowState', 'unknown')
            end = record.get('contextEnd', {}).get('workflowState', 'unknown')
            state = start if start == end else f'{start} → {end}'
            dispatch, latency, gaps = (record.get(key, {}) for key in ('eventDispatchDelayMs', 'eventToRafMs', 'frameGapMs'))
            lines.append(f'| {i} | {state} | {record.get("kind", "unknown")} | {number(dispatch.get("p95"))} | '
                         f'{number(latency.get("p95"))} | {number(gaps.get("p95"))} / {number(gaps.get("max"))} | '
                         f'{record.get("framesOver50Ms", "—")} | {number(record.get("longTaskMs"))} |')
            if any(x.get('dropped', 0) for x in (dispatch, latency, gaps)):
                warnings.append(f'Gesture {i} exceeded the sample bound; its percentiles cover retained samples only.')
        if warnings:
            lines += ['', *warnings]
        interrupted = sum(r.get('reason') != 'released' for r in gestures)
        if interrupted:
            lines += ['', f'Interrupted/limited gestures: {interrupted}; inspect raw records before comparison.']
    if invalid:
        lines += ['', f'Invalid or truncated telemetry records: {invalid}. Do not treat missing values as zero.']
    # Compare complete one-second simulator windows inside explicitly marked
    # phases. Excluding boundary windows prevents mixing static/gesture results.
    phases = read_jsonl(folder / 'phases.jsonl')
    starts = {}
    lines += ['', '### Streaming during interaction phases', '',
              '| Case / phase | Complete windows | Commands/s | Largest status-poll gap (ms) | App peak PSS (MiB) | App peak CPU (% one core) |',
              '| --- | ---: | ---: | ---: | ---: | ---: |']
    count = 0
    for phase in phases:
        name = phase.get('phase', '')
        if not name.startswith(('visualizer-', 'run-static-')):
            continue
        key = (phase.get('case', ''), name.rsplit('-', 1)[0])
        if name.endswith('-start'):
            starts[key] = phase['time']
        elif name.endswith('-end') and key in starts:
            begin = starts.pop(key)
            windows = [e for e in events if e.get('event') == 'job_progress' and
                       e.get('interval_start', -1) >= begin and e.get('time', float('inf')) <= phase['time']]
            count += 1
            seconds = sum(e['interval_seconds'] for e in windows)
            rate = f'{sum(e["interval_commands"] for e in windows)/seconds:.1f}' if seconds else 'NOT MEASURED'
            gap = max((e.get('max_status_poll_gap_ms', 0) for e in windows), default=None)
            sampled = [r for r in samples if begin <= r.get('time', -1) <= phase['time']]
            memory = max((r['pss_kib']/1024 for r in sampled if r.get('pss_kib') is not None), default=None)
            cpu = max((r['cpu_percent_one_core'] for r in sampled if r.get('cpu_percent_one_core') is not None), default=None)
            lines.append(f'| {key[0]} / {key[1]} | {len(windows)} | {rate} | {"—" if gap is None else f"{gap:.1f}"} | '
                         f'{"—" if memory is None else f"{memory:.1f}"} | {"—" if cpu is None else f"{cpu:.1f}"} |')
    if not count:
        lines += ['', 'No complete interaction phase markers. Mark static and gesture windows to compare stream responsiveness.']
    return lines


def read_jsonl(path):
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]


def summarize(folder):
    folder = Path(folder)
    rows = read_jsonl(folder / 'samples.jsonl')
    events = read_jsonl(folder / 'simulator.jsonl')
    good = [row for row in rows if row.get('pss_kib') is not None]
    lines = ['# Tablet benchmark capture', '', f'Results: `{folder.name}`', '']
    if good:
        peak = max(row['pss_kib'] for row in good) / 1024
        available = [row['available_kib'] / 1024 for row in rows if row.get('available_kib') is not None]
        lines += [f'- App process peak PSS: **{peak:.1f} MiB**.',
                  f'- App PSS, first → last sample: {good[0]["pss_kib"]/1024:.1f} → {good[-1]["pss_kib"]/1024:.1f} MiB.',
                  f'- Valid app samples: {len(good)} / {len(rows)}.']
        if available:
            lines.append(f'- Lowest system available memory: {min(available):.1f} MiB.')
        cpu = [r['cpu_percent_one_core'] for r in rows if r.get('cpu_percent_one_core') is not None]
        if cpu:
            lines.append(f'- App CPU median / maximum sample: {statistics.median(cpu):.1f}% / {max(cpu):.1f}% of one core.')
        renderer = {}
        for row in rows:
            for item in row.get('webview_candidates', []):
                if item.get('pss_kib') is not None:
                    renderer[item['pid']] = max(renderer.get(item['pid'], 0), item['pss_kib'] / 1024)
        for pid, peak in renderer.items():
            lines.append(f'- Candidate WebView renderer PID {pid}, peak PSS: {peak:.1f} MiB (ownership not independently established).')
    else:
        lines.append('No valid app memory samples. Do not interpret this as zero memory use.')
    lines += ['', '## Simulated streams', '',
              '| Fixture | Commands | Seconds | Lines/s | Ordered checksum | RX overflows |',
              '| --- | ---: | ---: | ---: | --- | ---: |']
    for event in events:
        if event['event'] != 'job_completed':
            continue
        match = event.get('expected_match')
        result = 'PASS' if match is True else 'FAIL' if match is False else 'NOT CHECKED'
        lines.append(f'| {event.get("expected_file") or "See fixture metadata"} | {event["acknowledged"]} | {event["seconds"]:.2f} | {event["achieved_lines_per_second"]:.1f} | {result} | {event["rx_overflows"]} |')
    aborted = [event for event in events if event['event'] == 'job_aborted']
    if aborted:
        lines += ['', f'Aborted runs: {len(aborted)}. Inspect simulator.jsonl; intentional stop tests and failures both appear here.']
    lines += interaction_report(folder, events, rows)
    lines += ['', '## Interpretation limits', '',
              'CPU and memory summaries cover the entire capture, including idle time and file selection. '
              'Sampled peaks can miss short spikes. Renderer memory is separate from app-process memory. '
              'A completed stream checks command integrity, not physical USB serial performance or machine timing. '
              'Review logcat and exit-before/after for crashes; this report does not automatically classify them. '
              'A pass at one file size is not a maximum supported file-size claim.', '']
    return '\n'.join(lines)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('folder')
    args = parser.parse_args()
    text = summarize(args.folder)
    Path(args.folder, 'REPORT.md').write_text(text)
    print(text)
