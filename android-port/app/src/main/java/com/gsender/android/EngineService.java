package com.gsender.android;

import android.app.*;
import android.content.Intent;
import android.os.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.zip.*;

public final class EngineService extends Service {
    public static volatile String status = "Starting gSender…";
    public static volatile String uiStatus = "Waiting for UI connection";
    public static volatile String url;
    public static volatile String token;
    private static boolean started;
    static volatile boolean uiForeground;
    private static volatile EngineService instance;
    static void foreground(boolean visible) {
        uiForeground = visible;
        EngineService current = instance;
        if (current != null) current.main.post(() -> { if (current.runtime != null) current.runtime.foregroundChanged(visible); });
    }
    private static final java.util.ArrayDeque<String> startupEvents = new java.util.ArrayDeque<>();
    static synchronized void record(String event) {
        if (event.length() > 1500) event = event.substring(0,1500);
        startupEvents.addLast(event); while (startupEvents.size() > 12) startupEvents.removeFirst();
        android.util.Log.i("gSenderStartup", event);
    }
    static synchronized String diagnostics() { return String.join("\n", startupEvents); }
    private NativeRuntime runtime;
    private PowerManager.WakeLock wakeLock;
    private final Handler main = new Handler(Looper.getMainLooper());
    private volatile boolean failed;
    private volatile boolean stopping;

    @Override public void onCreate() {
        super.onCreate();
        instance = this;
        NotificationManager notifications = getSystemService(NotificationManager.class);
        notifications.createNotificationChannel(new NotificationChannel("engine", "CNC connection", NotificationManager.IMPORTANCE_LOW));
        startForeground(1, notification("Starting gSender"));
        PowerManager power = getSystemService(PowerManager.class);
        wakeLock = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "gsender:engine");

    }
    private Notification notification(String text) {
        PendingIntent open = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class), PendingIntent.FLAG_IMMUTABLE);
        PendingIntent stop = PendingIntent.getService(this, 1, new Intent(this, EngineService.class).setAction("STOP"), PendingIntent.FLAG_IMMUTABLE);
        return new Notification.Builder(this, "engine").setContentTitle("gSender Android · Build " + BuildConfig.VERSION_CODE)
            .setContentText(text).setSmallIcon(android.R.drawable.stat_notify_sync)
            .setContentIntent(open).setOngoing(true).addAction(android.R.drawable.ic_menu_close_clear_cancel, "Stop gSender", stop).build();
    }
    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && "STOP".equals(intent.getAction())) {
            stopEverything();
            return START_NOT_STICKY;
        }
        if (stopping) return START_NOT_STICKY;
        if (!started) {
            started = true;
            new Thread(() -> {
                try {
                    File payload = preparePayload();
                    if (stopping) return;
                    runtime = new NativeRuntime(this);
                    if (stopping) { runtime.close(); return; }
                    int result = runtime.start(new File(payload, "bootstrap.cjs").getPath());
                    fail("Backend stopped (" + result + "). Stop and reopen gSender.");
                } catch (Throwable e) { fail(e.toString()); }
            }, "gsender-node").start();
        }
        return START_NOT_STICKY;
    }
    private File preparePayload() throws Exception {
        long start = SystemClock.elapsedRealtime();
        String version;
        try (InputStream input = getAssets().open("payload.sha256")) {
            ByteArrayOutputStream out = new ByteArrayOutputStream(); byte[] buffer = new byte[256];
            int count; while ((count=input.read(buffer))!=-1) out.write(buffer,0,count);
            version = out.toString("UTF-8").trim();
        }
        status = "Preparing gSender…";
        File result = new PayloadStore(getFilesDir()).prepare(version, () -> getAssets().open("payload.zip"));
        record("payload_ready ms=" + (SystemClock.elapsedRealtime()-start));
        status = "Starting local backend…";
        return result;
    }
    void usbActive(boolean connected) {
        main.post(() -> {
            if (failed || stopping) return;
            if (connected && !wakeLock.isHeld()) wakeLock.acquire();
            if (!connected && wakeLock.isHeld()) wakeLock.release();
            getSystemService(NotificationManager.class).notify(1, notification(connected ? "CNC connected — tap to open" : "Ready — no CNC connected"));
        });
    }
    void ready(int port, String key) {
        if (failed || stopping) return;
        record("backend_ready t=" + (SystemClock.elapsedRealtime()-android.os.Process.getStartElapsedRealtime()));
        token = key;
        url = "http://127.0.0.1:" + port;
        status = "Local backend running";
        main.post(() -> getSystemService(NotificationManager.class).notify(1, notification("CNC service running — tap to open")));
    }
    void fail(String message) {
        if (failed || stopping) return;
        failed = true;
        record("backend_failed " + message);
        android.util.Log.e("gSender", message);
        status = "gSender stopped: " + message;
        url = null;
        if (runtime != null) runtime.close();
        main.post(() -> {
            if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
            getSystemService(NotificationManager.class).notify(1, notification("Backend error — stop and reopen gSender"));
        });
    }
    // Home/backgrounding keeps streaming; removing the task explicitly shuts it down.
    @Override public void onTaskRemoved(Intent rootIntent) { stopEverything(); }
    private void stopEverything() {
        if (stopping) return;
        stopping = true;
        instance = null;
        url = null; token = null;
        main.removeCallbacksAndMessages(null);
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        stopForeground(STOP_FOREGROUND_REMOVE);
        // Node can only start once per process. Bound shutdown even if a USB driver hangs.
        Runnable exit = () -> android.os.Process.killProcess(android.os.Process.myPid());
        main.postDelayed(exit, 1500);
        if (runtime != null) runtime.close(() -> main.post(exit));
        else main.post(exit);
        stopSelf();
    }
    @Override public IBinder onBind(Intent intent) { return null; }
    @Override public void onDestroy() {
        stopEverything();
        super.onDestroy();
    }
}
