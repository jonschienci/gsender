package com.gsender.usb;

import java.net.SocketTimeoutException;

/** A bounded request includes both time waiting for the USB worker and I/O. */
public final class WriteDeadline {
    private WriteDeadline() {}
    public static int remaining(int budget, long receivedAt, long now) throws SocketTimeoutException {
        if (budget == 0) return 5000; // Existing non-pendant USB behavior unchanged.
        if (budget != 250) throw new IllegalArgumentException("Unsupported pendant write deadline");
        long elapsed = now - receivedAt;
        if (elapsed < 0 || elapsed >= budget) throw new SocketTimeoutException("Pendant write expired before transmission");
        return (int)(budget - elapsed);
    }
}
