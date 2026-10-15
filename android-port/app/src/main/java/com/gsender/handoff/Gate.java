package com.gsender.handoff;

import android.app.Activity;
import android.app.Application;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.os.Binder;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.Process;
import android.system.ErrnoException;
import android.system.Os;
import android.system.OsConstants;
import android.util.Log;
import java.io.*;
import java.lang.ref.WeakReference;
import java.lang.reflect.Field;
import java.lang.reflect.Modifier;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import org.json.JSONArray;

final class Gate {
    static final String PERSONAL = "com.gsender.android";
    static final String OFFICIAL = "org.sienci.gsender.pendant";
    static final String LAUNCH = "com.gsender.handoff.LaunchActivity";
    static final String TAG = "gSenderHandoff";
    static final Handler MAIN = new Handler(Looper.getMainLooper());
    static final List<WeakReference<Activity>> ACTIVITIES = new ArrayList<>();
    static volatile boolean stopping;
    static String other(Context c) { return PERSONAL.equals(c.getPackageName()) ? OFFICIAL : PERSONAL; }
    static String label(String pkg) { return PERSONAL.equals(pkg) ? "your gSender build" : "official gSender Pendant"; }
    static boolean selected(Context c) {
        return c.getSharedPreferences("gsender-handoff", 0).getBoolean("selected", PERSONAL.equals(c.getPackageName()));
    }
    static void select(Context c, boolean value) throws IOException {
        if (!c.getSharedPreferences("gsender-handoff", 0).edit().putBoolean("selected", value).commit())
            throw new IOException("Could not save app selection");
    }
    static void register(Context c) {
        ((Application)c.getApplicationContext()).registerActivityLifecycleCallbacks(new Application.ActivityLifecycleCallbacks() {
            public void onActivityCreated(Activity a, Bundle state) { synchronized(ACTIVITIES) { ACTIVITIES.add(new WeakReference<>(a)); } }
            public void onActivityDestroyed(Activity a) { synchronized(ACTIVITIES) { ACTIVITIES.removeIf(r -> r.get() == null || r.get() == a); } }
            public void onActivityStarted(Activity a) {} public void onActivityResumed(Activity a) {}
            public void onActivityPaused(Activity a) {} public void onActivityStopped(Activity a) {}
            public void onActivitySaveInstanceState(Activity a, Bundle b) {}
        });
    }
    static void requirePeer(Context c) throws Exception {
        int uid = Binder.getCallingUid();
        if (uid == Process.myUid()) return;
        String peer = other(c);
        String[] packages = c.getPackageManager().getPackagesForUid(uid);
        if (packages == null || !Arrays.asList(packages).contains(peer)) throw new SecurityException("Untrusted handoff caller");
        PackageInfo info = c.getPackageManager().getPackageInfo(peer,
            Build.VERSION.SDK_INT >= 28 ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES);
        Signature[] signatures = Build.VERSION.SDK_INT >= 28 ? info.signingInfo.getApkContentsSigners() : info.signatures;
        String expected = PERSONAL.equals(peer)
            ? "602a46521f240c5f2bab9dd81fd96f21d3878aad4e5b1a56eb1322097efed9e7"
            : "406dbd65621df7e6c0aa6e9b1421ceae4c37cc27b08417fcbf31e41d0973758c";
        for (Signature signature : signatures) {
            byte[] bytes = MessageDigest.getInstance("SHA-256").digest(signature.toByteArray());
            StringBuilder hash = new StringBuilder(); for (byte b : bytes) hash.append(String.format(Locale.US, "%02x", b & 255));
            if (expected.contentEquals(hash)) return;
        }
        throw new SecurityException("Unexpected handoff app signature");
    }
    static boolean usbOpen() throws IOException {
        File[] fds = new File("/proc/self/fd").listFiles();
        if (fds == null) throw new IOException("Could not inspect this app's USB handles");
        for (File fd : fds) try {
            String path = Os.readlink(fd.getPath());
            if (path.startsWith("/dev/bus/usb/") && !path.endsWith(" (deleted)")) return true;
        } catch (ErrnoException ignored) { /* A handle can close during inspection. */ }
        return false;
    }
    static boolean connected(Context c) throws Exception {
        boolean hasUsbHandle = usbOpen();
        String base = "http://127.0.0.1:8000", token = null;
        if (PERSONAL.equals(c.getPackageName())) {
            base = null;
            // These are app-owned fields, including R8-renamed fields. Never
            // send the private local token to the other application or logs.
            for (Field f : Class.forName(PERSONAL + ".EngineService").getDeclaredFields()) {
                if (!Modifier.isStatic(f.getModifiers()) || f.getType() != String.class) continue;
                f.setAccessible(true); String v = (String)f.get(null);
                if (v != null && v.matches("[a-f0-9]{64}")) token = v;
                if (v != null && v.matches("http://127\\.0\\.0\\.1:[0-9]+")) base = v;
            }
            if (base == null || token == null) return hasUsbHandle;
        }
        HttpURLConnection http = (HttpURLConnection)new URL(base + "/api/controllers").openConnection();
        http.setConnectTimeout(700); http.setReadTimeout(1000);
        if (token != null) http.setRequestProperty("X-gSender-Key", token);
        try {
            int code = http.getResponseCode();
            if (code != 200) throw new IOException("Could not confirm the other app is disconnected");
            ByteArrayOutputStream data = new ByteArrayOutputStream();
            try (InputStream input = http.getInputStream()) {
                byte[] chunk = new byte[4096]; int n;
                while ((n = input.read(chunk)) != -1) {
                    if (data.size() + n > 262144) throw new IOException("Unexpected connection-state response");
                    data.write(chunk, 0, n);
                }
            }
            // The controller list distinguishes a CNC from an idle USB knob.
            // Once it confirms no CNC connection, teardown can release the knob
            // too. An unreadable status still refuses the handoff.
            return new JSONArray(data.toString("UTF-8")).length() != 0;
        } catch (ConnectException e) { return usbOpen(); /* No listening backend. */ }
        finally { http.disconnect(); }
    }
    static int[] nodeChildren() {
        Set<Integer> ids = new HashSet<>();
        File[] tasks = new File("/proc/self/task").listFiles();
        if (tasks != null) for (File task : tasks) try {
            String children = read(new File(task, "children"), 8192).trim();
            if (!children.isEmpty()) for (String word : children.split("\\s+")) {
                int pid = Integer.parseInt(word);
                String cmd = read(new File("/proc/" + pid + "/cmdline"), 8192);
                if (cmd.contains("libnode_exec.so")) ids.add(pid);
            }
        } catch (Exception ignored) {}
        int[] result = new int[ids.size()]; int i = 0; for (int id : ids) result[i++] = id;
        return result;
    }
    static String read(File file, int limit) throws IOException {
        try (InputStream in = new FileInputStream(file)) {
            ByteArrayOutputStream out = new ByteArrayOutputStream(); byte[] buf = new byte[1024]; int n;
            while ((n = in.read(buf)) > 0 && out.size() < limit) out.write(buf, 0, Math.min(n, limit - out.size()));
            return out.toString("UTF-8");
        }
    }
    static boolean alive(int pid) throws IOException {
        try { Os.kill(pid, 0); return true; }
        catch (ErrnoException e) {
            if (e.errno == OsConstants.ESRCH) return false;
            if (e.errno == OsConstants.EPERM) return true;
            throw new IOException(e);
        }
    }
    static void stopSelf(Context c) {
        stopping = true;
        MAIN.postDelayed(() -> {
            String service = PERSONAL.equals(c.getPackageName()) ? PERSONAL + ".EngineService" : OFFICIAL + ".NodeService";
            c.stopService(new Intent().setClassName(c.getPackageName(), service));
            synchronized(ACTIVITIES) {
                for (WeakReference<Activity> ref : new ArrayList<>(ACTIVITIES)) {
                    Activity a = ref.get(); if (a != null) a.finishAndRemoveTask();
                }
            }
        }, 150); // Let the small Binder reply reach the selected app first.
        new Thread(() -> {
            try {
                Thread.sleep(800);
                long deadline = android.os.SystemClock.elapsedRealtime() + 4000;
                while (nodeChildren().length != 0 && android.os.SystemClock.elapsedRealtime() < deadline) Thread.sleep(100);
                for (int pid : nodeChildren()) Process.killProcess(pid);
            } catch (InterruptedException ignored) {}
            Log.i(TAG, "Stopped inactive app " + c.getPackageName());
            Process.killProcess(Process.myPid());
        }, "gsender-handoff-stop").start();
    }
}
