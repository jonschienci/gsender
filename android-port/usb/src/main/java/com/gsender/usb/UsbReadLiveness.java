package com.gsender.usb;

import java.io.IOException;
import java.io.InterruptedIOException;

/** Empty USB completions do not invalidate a stream that is still delivering serial data. */
public final class UsbReadLiveness {
    public interface Check { void run() throws IOException; }
    private static final long QUIET_MS = 3000;
    private static final long PROBE_INTERVAL_MS = 1000;
    private long lastData;
    private long lastProbe;

    public UsbReadLiveness(long now) { lastData = now; lastProbe = now - PROBE_INTERVAL_MS; }

    public void received(long now) { lastData = now; }
    public long dataAge(long now) { return Math.max(0, now - lastData); }

    public void emptyRead(long now, UsbReadHealth.Current current, UsbReadHealth.Pause pause, Check check) throws IOException {
        requireCurrent(current);
        // A CDC zero-length packet is not a serial EOF. Probe only after sustained
        // silence, not between valid acknowledgements and status reports during a job.
        if (dataAge(now) >= QUIET_MS && now - lastProbe >= PROBE_INTERVAL_MS) {
            lastProbe = now;
            check.run();
            requireCurrent(current);
        }
        // A detached-but-not-yet-notified handle can complete empty reads immediately.
        // Bound CPU use until the detach callback or the quiet-stream probe catches it.
        try { pause.sleep(1); }
        catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            InterruptedIOException error = new InterruptedIOException("USB read interrupted");
            error.initCause(e); throw error;
        }
        requireCurrent(current);
    }

    private static void requireCurrent(UsbReadHealth.Current current) throws IOException {
        if (Thread.currentThread().isInterrupted()) throw new InterruptedIOException("USB read interrupted");
        if (!current.isCurrent()) throw new IOException("Connection closed");
    }
}
