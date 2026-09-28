package com.gsender.android;

public final class KioskSessionTest {
    static class Device implements KioskSession.Platform {
        boolean allowed = true, locked, fullscreen, saved = true, refuseExit;
        int enters, exits;
        public boolean canEnter() { return allowed; }
        public boolean locked() { return locked; }
        public void enter() { locked = true; enters++; }
        public void leave() {
            if (refuseExit) throw new IllegalStateException("Android rejected exit");
            locked = false; exits++;
        }
        public void saveEnabled(boolean value) { saved = value; }
        public void showFullscreen(boolean value) { fullscreen = value; }
    }
    static void check(boolean value, String message) {
        if (!value) throw new AssertionError(message);
    }
    public static void main(String[] args) {
        Device d = new Device(); KioskSession s = new KioskSession(true, d);
        s.update(); check(d.enters == 0 && !d.fullscreen, "Loading must not lock the user in");
        s.toggle(); check(s.enabled(), "No exit target means no toggle");
        d.allowed = false; s.ready(true);
        check(d.enters == 0 && d.fullscreen, "Unmanaged/unfocused/locked-screen state must never start screen pinning");
        d.allowed = true; s.update(); s.update();
        check(d.enters == 1 && d.locked, "Lock once when the badge and device are ready");
        s.toggle(); check(!d.locked && !d.fullscreen && !d.saved, "Exit restores Android and persists maintenance mode");
        s.update(); s.ready(false); s.ready(true);
        check(!d.locked && d.enters == 1, "Focus changes and page reload cannot undo explicit exit");
        KioskSession restarted = new KioskSession(d.saved, d); restarted.ready(true);
        check(!d.locked, "Maintenance mode must survive process restart");
        restarted.toggle(); check(d.locked && d.saved, "Same gesture re-enters kiosk");
        d.refuseExit = true;
        try { restarted.toggle(); throw new AssertionError("Expected Android exit refusal"); }
        catch (IllegalStateException expected) { }
        check(restarted.enabled() && d.saved, "Failed exit remains retryable; do not falsely save disabled state");
        d.refuseExit = false; restarted.toggle(); check(!d.locked, "Retry exits successfully");
        restarted.toggle(); restarted.ready(false);
        check(!d.locked && !d.fullscreen, "Backend/page failure must release lock and expose Android");
        d.locked = true; new KioskSession(true, d).update();
        check(!d.locked, "Recreated activity must release an inherited lock until its UI is ready");
        System.out.println("Kiosk session lifecycle, persistence, failure recovery and unenrolled behavior passed");
    }
}
