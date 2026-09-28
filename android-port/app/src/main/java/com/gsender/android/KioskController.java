package com.gsender.android;

import android.app.Activity;
import android.app.ActivityManager;
import android.app.KeyguardManager;
import android.app.admin.DevicePolicyManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import android.util.Log;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.widget.Toast;

/** Lock task is entered only after the page has rendered its exit gesture. */
final class KioskController {
    private final Activity activity;
    private final SharedPreferences preferences;
    private final KioskSession session;
    private final BackGuard backGuard;
    private boolean resumed;

    KioskController(Activity activity) {
        this.activity = activity;
        backGuard = Build.VERSION.SDK_INT >= 33 ? new BackGuard(activity) : null;
        preferences = activity.getSharedPreferences("kiosk", Context.MODE_PRIVATE);
        session = new KioskSession(preferences.getBoolean("enabled", true), new KioskSession.Platform() {
            public boolean canEnter() { return mayEnter(); }
            public boolean locked() { return KioskController.this.locked(); }
            public void enter() { activity.startLockTask(); }
            public void leave() { activity.stopLockTask(); }
            public void saveEnabled(boolean enabled) { preferences.edit().putBoolean("enabled", enabled).apply(); }
            public void showFullscreen(boolean fullscreen) { applySystemBars(fullscreen); }
        });
    }

    void ready(boolean value) {
        if (session.ready() != value) {
            try { session.ready(value); }
            catch (RuntimeException error) { failure(error); }
        }
    }

    boolean fullscreen() { return session.fullscreen(); }

    boolean locked() {
        ActivityManager manager = activity.getSystemService(ActivityManager.class);
        return manager != null && manager.getLockTaskModeState() == ActivityManager.LOCK_TASK_MODE_LOCKED;
    }

    void resume() { resumed = true; update(); }
    void pause() { resumed = false; }

    void toggle() {
        if (!session.ready() || !resumed) return;
        try { session.toggle(); }
        catch (RuntimeException error) { failure(error); return; }
        Toast.makeText(activity, !session.enabled() ? "Android controls restored. Tap Build five times to return to kiosk."
            : locked() ? "Kiosk mode enabled"
            : "Fullscreen enabled. Managed kiosk requires tablet enrollment.", Toast.LENGTH_LONG).show();
    }

    private void failure(RuntimeException error) {
        Log.e("gSenderKiosk", "Could not change kiosk mode", error);
        Toast.makeText(activity, "Could not change kiosk mode. Tap Build five times to retry.", Toast.LENGTH_LONG).show();
    }

    private boolean mayEnter() {
        if (!resumed || !activity.hasWindowFocus()) return false;
        KeyguardManager keyguard = activity.getSystemService(KeyguardManager.class);
        if (keyguard != null && keyguard.isKeyguardLocked()) return false;
        DevicePolicyManager manager = activity.getSystemService(DevicePolicyManager.class);
        if (manager != null && manager.isDeviceOwnerApp(activity.getPackageName())) {
            ComponentName admin = new ComponentName(activity, KioskAdminReceiver.class);
            // Do not change browser, storage, USB-debugging or factory-reset policies.
            manager.setLockTaskPackages(admin, new String[]{activity.getPackageName()});
            if (Build.VERSION.SDK_INT >= 28) {
                manager.setLockTaskFeatures(admin, DevicePolicyManager.LOCK_TASK_FEATURE_NONE);
            }
        }
        // Never silently substitute user-exitable screen pinning.
        return manager != null && manager.isLockTaskPermitted(activity.getPackageName());
    }

    void update() {
        try { session.update(); }
        catch (RuntimeException error) { failure(error); }
    }

    // Isolate API 33 types so Android 8–12 can load the outer controller.
    @android.annotation.TargetApi(33)
    private static final class BackGuard {
        private final Activity activity;
        private final android.window.OnBackInvokedCallback callback = () -> {};
        private boolean blocked;
        BackGuard(Activity activity) { this.activity = activity; }
        void block(boolean value) {
            if (blocked == value) return;
            if (value) activity.getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, callback);
            else activity.getOnBackInvokedDispatcher().unregisterOnBackInvokedCallback(callback);
            blocked = value;
        }
    }

    @SuppressWarnings("deprecation")
    private void applySystemBars(boolean hide) {
        if (Build.VERSION.SDK_INT >= 33 && backGuard != null) backGuard.block(locked());
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController controller = activity.getWindow().getInsetsController();
            if (controller != null) {
                controller.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                if (hide) controller.hide(WindowInsets.Type.systemBars());
                else controller.show(WindowInsets.Type.systemBars());
            }
        } else {
            if (hide) activity.getWindow().addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
            else activity.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
            activity.getWindow().getDecorView().setSystemUiVisibility(hide
                ? View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                : View.SYSTEM_UI_FLAG_VISIBLE);
        }
        activity.getWindow().getDecorView().requestApplyInsets();
    }
}
