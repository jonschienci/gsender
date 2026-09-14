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
    private NativeRuntime runtime;
    private PowerManager.WakeLock wakeLock;
    private final Handler main = new Handler(Looper.getMainLooper());
    private volatile boolean failed;
    private volatile boolean stopping;

    @Override public void onCreate() {
        super.onCreate();
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
    private File preparePayload() throws IOException {
        File target = new File(getFilesDir(), "runtime");
        String version;
        try (InputStream input = getAssets().open("payload.sha256")) {
            version = new String(read(input), StandardCharsets.UTF_8).trim();
        }
        File marker = new File(target, ".version");
        if (marker.exists() && new String(java.nio.file.Files.readAllBytes(marker.toPath()), StandardCharsets.UTF_8).trim().equals(version)) return target;
        status = "Preparing gSender for first launch…";
        delete(target);
        if (!target.mkdirs()) throw new IOException("Cannot create runtime directory");
        String prefix = target.getCanonicalPath() + File.separator;
        try (ZipInputStream zip = new ZipInputStream(getAssets().open("payload.zip"))) {
            ZipEntry entry;
            byte[] buffer = new byte[65536];
            while ((entry = zip.getNextEntry()) != null) {
                File output = new File(target, entry.getName());
                if (!output.getCanonicalPath().startsWith(prefix)) throw new IOException("Invalid payload path");
                if (entry.isDirectory()) { output.mkdirs(); continue; }
                output.getParentFile().mkdirs();
                try (OutputStream stream = new FileOutputStream(output)) {
                    int count; while ((count = zip.read(buffer)) != -1) stream.write(buffer, 0, count);
                }
            }
        }
        java.nio.file.Files.write(marker.toPath(), version.getBytes(StandardCharsets.UTF_8));
        return target;
    }
    private byte[] read(InputStream input) throws IOException {
        ByteArrayOutputStream output = new ByteArrayOutputStream(); byte[] buffer = new byte[8192];
        int count; while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
        return output.toByteArray();
    }
    private void delete(File file) throws IOException {
        if (!file.exists()) return;
        File[] children = file.listFiles();
        if (children != null) for (File child : children) delete(child);
        if (!file.delete()) throw new IOException("Cannot replace " + file);
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
        token = key;
        url = "http://127.0.0.1:" + port;
        status = "Local backend running";
        main.post(() -> getSystemService(NotificationManager.class).notify(1, notification("CNC service running — tap to open")));
    }
    void fail(String message) {
        if (failed || stopping) return;
        failed = true;
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
