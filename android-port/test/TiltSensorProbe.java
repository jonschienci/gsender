package com.gsender.android;

import android.app.Activity;
import android.content.Context;
import android.content.pm.ActivityInfo;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.WindowManager;
import org.json.JSONObject;

/** Isolated adb/app_process sensor probe. No app install, USB or CNC access. */
public final class TiltSensorProbe {
    static final class ProbeActivity extends Activity {
        final Context context;
        int orientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED;
        ProbeActivity(Context context) { this.context = context; attachBaseContext(context); }
        @Override public Object getSystemService(String name) { return context.getSystemService(name); }
        @Override public WindowManager getWindowManager() { return context.getSystemService(WindowManager.class); }
        @Override public int getRequestedOrientation() { return orientation; }
        @Override public void setRequestedOrientation(int value) { orientation = value; }
    }
    public static void main(String[] args) throws Exception {
        if (Looper.getMainLooper() == null) Looper.prepareMainLooper();
        Class<?> threadClass = Class.forName("android.app.ActivityThread");
        Object thread = threadClass.getMethod("systemMain").invoke(null);
        Context system = (Context) threadClass.getMethod("getSystemContext").invoke(thread);
        ProbeActivity activity = new ProbeActivity(system.createPackageContext("com.android.shell", 0));
        TiltSensor sensor = new TiltSensor(activity);
        sensor.start();
        new Handler(Looper.getMainLooper()).postDelayed(() -> {
            try {
                JSONObject before = new JSONObject(sensor.sample());
                int locked = activity.orientation;
                // Simulate a busy main/UI thread while the real sensor runs.
                SystemClock.sleep(350);
                JSONObject busy = new JSONObject(sensor.sample());
                sensor.stop();
                JSONObject stopped = new JSONObject(sensor.sample());
                System.out.println(new JSONObject().put("available", sensor.available())
                    .put("before", before).put("busyUi", busy).put("stopped", stopped)
                    .put("requestedLock", locked).put("restoredPolicy", activity.orientation));
                System.exit(0);
            } catch (Exception error) { error.printStackTrace(); System.exit(1); }
        }, 800);
        Looper.loop();
    }
}
