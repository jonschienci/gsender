package com.gsender.android;

/** Captures lifecycle/backend identity; asynchronous work cannot revive a cancelled scan. */
final class KnobQrSession {
    private long generation;
    private String origin, engineKey;
    private boolean active;
    synchronized long begin(String origin, String engineKey) {
        cancel(); this.origin = origin; this.engineKey = engineKey; active = true; return generation;
    }
    synchronized boolean valid(long id, boolean resumed, String origin, String engineKey) {
        return active && resumed && id == generation && this.origin.equals(origin) && this.engineKey.equals(engineKey);
    }
    synchronized boolean active() { return active; }
    synchronized void cancel() { generation++; active = false; origin = null; engineKey = null; }
}
