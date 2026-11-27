package com.gsender.android;

import java.util.ArrayDeque;

/** Bounded display-only recovery. The CNC service is never restarted here. */
final class RendererRecovery {
    private static final long WINDOW_MS = 60_000;
    private static final int LIMIT = 3;
    private final ArrayDeque<Long> failures = new ArrayDeque<>();
    private boolean blocked;

    boolean failed(long now) {
        while (!failures.isEmpty() && now - failures.peekFirst() > WINDOW_MS) failures.removeFirst();
        failures.addLast(now);
        blocked = failures.size() >= LIMIT;
        return !blocked;
    }

    boolean blocked() { return blocked; }

    void retry() {
        failures.clear();
        blocked = false;
    }
}
