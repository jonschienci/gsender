package com.gsender.usb;

import java.io.IOException;
import java.io.InterruptedIOException;

/** Bounded, read-only validation of an ambiguous empty USB read. Never retries serial writes. */
public final class UsbReadHealth {
    public interface Probe { int status(byte[] destination, int timeoutMs); }
    public interface Pause { void sleep(int milliseconds) throws InterruptedException; }
    public interface Current { boolean isCurrent(); }
    private UsbReadHealth() {}

    public static int check(Probe probe, Current current, Pause pause, String failure) throws IOException {
        for (int attempt = 0; attempt < 3; attempt++) {
            requireCurrent(current);
            if (attempt > 0) {
                try { pause.sleep(attempt * 5); }
                catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    InterruptedIOException error = new InterruptedIOException("USB health check interrupted");
                    error.initCause(e); throw error;
                }
                requireCurrent(current);
            }
            byte[] status = new byte[2];
            int length = probe.status(status, 200);
            requireCurrent(current);
            // USB 2.0 DEVICE GET_STATUS: only self-powered and remote-wakeup bits are defined.
            if (length == 2 && status[1] == 0 && (status[0] & 0xfc) == 0) return attempt + 1;
        }
        throw new IOException(failure + " (three read-only checks failed)");
    }

    private static void requireCurrent(Current current) throws IOException {
        if (Thread.currentThread().isInterrupted()) throw new InterruptedIOException("USB health check interrupted");
        if (!current.isCurrent()) throw new IOException("Connection closed");
    }
}
