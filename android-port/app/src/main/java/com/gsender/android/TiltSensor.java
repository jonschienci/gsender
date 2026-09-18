package com.gsender.android;

import android.app.Activity;
import android.content.pm.ActivityInfo;
import android.hardware.*;
import android.os.SystemClock;
import android.os.Handler;
import android.os.HandlerThread;
import android.util.Log;
import org.json.JSONObject;

/** Latest-sample mailbox: no event queue or retained samples sent to the WebView. */
final class TiltSensor implements SensorEventListener {
    private final Activity activity;
    private final SensorManager manager;
    private final Sensor sensor;
    private final TiltFilter filter = new TiltFilter();
    private boolean active;
    private Integer previousOrientation;
    private HandlerThread sensorThread;
    private long startedAt;
    TiltSensor(Activity activity) {
        this.activity = activity;
        manager = activity.getSystemService(SensorManager.class);
        Sensor choice = manager == null ? null : manager.getDefaultSensor(Sensor.TYPE_GRAVITY);
        sensor = choice != null ? choice : manager == null ? null : manager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
    }
    boolean available() { return sensor != null; }
    synchronized void start() {
        if (active) return;
        stop();
        if (sensor == null) return;
        try {
            int orientation = activity.getRequestedOrientation();
            // Preserve the exact current perspective, including reverse landscape.
            // This is an activity lock; the tablet's auto-rotate setting is unchanged.
            activity.setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_LOCKED);
            previousOrientation = orientation;
            // Heavy WebView/layout work must not queue the sensor stream behind
            // main-thread callbacks on slower tablets. Still reject stale data.
            sensorThread = new HandlerThread("gSenderTilt");
            sensorThread.start();
            startedAt = SystemClock.elapsedRealtimeNanos();
            active = manager.registerListener(this, sensor, 20000, 0, new Handler(sensorThread.getLooper()));
        }
        catch (RuntimeException error) { active = false; Log.w("gSenderTilt", "Could not start tilt sensor", error); }
        if (!active) stop();
    }
    synchronized void stop() {
        active = false;
        if (manager != null) manager.unregisterListener(this);
        if (sensorThread != null) { sensorThread.quitSafely(); sensorThread = null; }
        filter.reset();
        // All exit paths (toggle, background, focus loss and page navigation)
        // stop the sensor here, so none can leave the display locked.
        if (previousOrientation != null) {
            int orientation = previousOrientation;
            previousOrientation = null;
            try { activity.setRequestedOrientation(orientation); }
            catch (RuntimeException error) { Log.w("gSenderTilt", "Could not restore orientation", error); }
        }
    }
    @Override public synchronized void onSensorChanged(SensorEvent event) {
        if (!active || event.values.length < 3 || event.timestamp < startedAt) return;
        filter.update(event.values[0], event.values[1], event.values[2], event.timestamp,
            activity.getWindowManager().getDefaultDisplay().getRotation(), sensor.getType() == Sensor.TYPE_GRAVITY);
    }
    @Override public void onAccuracyChanged(Sensor sensor, int accuracy) { }
    synchronized String sample() {
        try {
            double age = filter.timestamp == 0 ? 1e9 : (SystemClock.elapsedRealtimeNanos() - filter.timestamp) / 1e6;
            boolean fresh = active && filter.valid && age >= 0 && age < 150;
            return new JSONObject().put("active", active).put("valid", fresh).put("ageMs", age)
                .put("seq", filter.sequence).put("rotation", filter.rotation)
                .put("x", fresh ? filter.x : 0).put("y", fresh ? filter.y : 0).put("z", fresh ? filter.z : 0).toString();
        } catch (Exception error) { return "{\"active\":false,\"valid\":false}"; }
    }
}
