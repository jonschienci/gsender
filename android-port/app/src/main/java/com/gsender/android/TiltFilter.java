package com.gsender.android;

/** Gravity estimate in screen coordinates. Pure Java for deterministic tests. */
final class TiltFilter {
    double x, y, z;
    long timestamp, sequence;
    int rotation = -1;
    boolean valid;
    void reset() { timestamp = 0; valid = false; rotation = -1; }
    void update(double ax, double ay, double az, long at, int orientation, boolean gravity) {
        if (at <= timestamp) return;
        double magnitude = Math.sqrt(ax * ax + ay * ay + az * az);
        boolean sane = Double.isFinite(magnitude) && magnitude >= 7 && magnitude <= 12;
        double sx, sy;
        // Android sensor axes stay in the device's natural orientation.
        switch (orientation) {
            case 1: sx = -ay; sy = ax; break;
            case 2: sx = -ax; sy = -ay; break;
            case 3: sx = ay; sy = -ax; break;
            default: sx = ax; sy = ay;
        }
        double blend = !valid || rotation != orientation || gravity ? 1
            : 1 - Math.exp(-Math.min(.25, (at - timestamp) / 1e9) / .08);
        x += (sx - x) * blend; y += (sy - y) * blend; z += (az - z) * blend;
        timestamp = at; rotation = orientation; sequence++; valid = sane;
        // Do not smooth through a shock or malformed reading into later input.
        if (!sane) { x = 0; y = 0; z = 0; }
    }
}
