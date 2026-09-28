package com.gsender.android;

/** The exit state survives focus changes; loading/error screens always release lock task. */
final class KioskSession {
    interface Platform {
        boolean canEnter();
        boolean locked();
        void enter();
        void leave();
        void saveEnabled(boolean enabled);
        void showFullscreen(boolean fullscreen);
    }
    private final Platform platform;
    private boolean enabled;
    private boolean ready;

    KioskSession(boolean enabled, Platform platform) {
        this.enabled = enabled;
        this.platform = platform;
    }
    boolean ready() { return ready; }
    boolean enabled() { return enabled; }
    boolean fullscreen() { return enabled && ready; }
    void ready(boolean value) { ready = value; update(); }

    void toggle() {
        if (!ready) return;
        // An unsuccessful unlock must remain retryable by the same gesture.
        if (enabled && platform.locked()) platform.leave();
        enabled = !enabled;
        platform.saveEnabled(enabled);
        update();
    }
    void update() {
        try {
            if (!fullscreen()) {
                if (platform.locked()) platform.leave();
            } else if (!platform.locked() && platform.canEnter()) {
                platform.enter();
            }
        } finally {
            platform.showFullscreen(fullscreen());
        }
    }
}
