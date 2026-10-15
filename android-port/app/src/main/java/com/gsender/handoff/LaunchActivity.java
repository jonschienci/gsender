package com.gsender.handoff;

import android.app.*;
import android.content.*;
import android.hardware.usb.UsbManager;
import android.net.Uri;
import android.os.*;
import android.util.Log;
import android.widget.TextView;
import android.content.pm.ShortcutInfo;
import android.content.pm.ShortcutManager;
import android.graphics.drawable.Icon;
import java.io.IOException;
import java.net.*;

/** Public launcher/USB entry; the existing gSender activity remains unchanged. */
public final class LaunchActivity extends Activity {
    private volatile boolean opening;
    private boolean pinRequested;
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        if (!"com.gsender.handoff.PIN".equals(getIntent().getAction())) begin();
    }
    @Override public void onResume() {
        super.onResume();
        if ("com.gsender.handoff.PIN".equals(getIntent().getAction()) && !pinRequested) {
            pinRequested = true;
            ShortcutManager manager = getSystemService(ShortcutManager.class);
            if (manager != null && manager.isRequestPinShortcutSupported()) {
                Intent open = new Intent(Intent.ACTION_MAIN).setClassName(getPackageName(), Gate.LAUNCH)
                    .addCategory(Intent.CATEGORY_LAUNCHER);
                ShortcutInfo shortcut = new ShortcutInfo.Builder(this, "gsender-ab-launch")
                    .setShortLabel(getApplicationInfo().loadLabel(getPackageManager()))
                    .setIcon(Icon.createWithResource(this, getApplicationInfo().icon))
                    .setIntent(open).build();
                manager.requestPinShortcut(shortcut, null);
            }
            finish();
        }
    }
    @Override public void onNewIntent(Intent intent) { super.onNewIntent(intent); setIntent(intent); begin(); }
    private void begin() {
        if (opening) return;
        if (UsbManager.ACTION_USB_DEVICE_ATTACHED.equals(getIntent().getAction()) && !Gate.selected(this)) {
            // A remembered default for the inactive app must not steal USB.
            startActivity(new Intent(getIntent()).setClassName(Gate.other(this), Gate.LAUNCH)); finish(); return;
        }
        opening = true;
        TextView status = new TextView(this); status.setText("Switching gSender…");
        status.setTextSize(20); status.setGravity(android.view.Gravity.CENTER); setContentView(status);
        new Thread(() -> {
            try (ServerSocket lock = lock()) {
                String peer = Gate.other(this);
                if (getPackageManager().getLaunchIntentForPackage(peer) != null) {
                    Uri uri = Uri.parse("content://" + peer + ".handoff");
                    try (ContentProviderClient client = getContentResolver().acquireUnstableContentProviderClient(uri)) {
                        if (client == null) throw new IOException("Both gSender apps need the A/B handoff update.");
                        Bundle result = client.call("stopForSwitch", null, null);
                        if (result == null || result.getBoolean("busy"))
                            throw new IOException("Disconnect the CNC in " + Gate.label(peer) + " before switching apps.");
                        Gate.select(this, true);
                        int pid = result.getInt("pid", -1); if (pid <= 0) throw new IOException("Invalid handoff reply");
                        int[] children = result.getIntArray("children");
                        long deadline = SystemClock.elapsedRealtime() + 8000;
                        while (Gate.alive(pid) || childrenAlive(children)) {
                            if (SystemClock.elapsedRealtime() >= deadline) throw new IOException("The other gSender has not stopped. Please use its Stop action and try again.");
                            Thread.sleep(100);
                        }
                    }
                }
                Gate.select(this, true);
                Log.i(Gate.TAG, "Opening selected app " + getPackageName());
                runOnUiThread(() -> {
                    Intent launch = new Intent(getIntent()).setClassName(getPackageName(), getPackageName() + ".MainActivity");
                    launch.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                    startActivity(launch); finish();
                });
            } catch (Exception e) {
                Log.w(Gate.TAG, "Handoff refused: " + e.getMessage());
                runOnUiThread(() -> new AlertDialog.Builder(this).setTitle("Switch gSender")
                    .setMessage(e.getMessage() == null ? "Could not switch safely. Please try again." : e.getMessage())
                    .setPositiveButton("OK", (d, w) -> finish()).setOnCancelListener(d -> finish()).show());
            }
        }, "gsender-handoff").start();
    }
    private boolean childrenAlive(int[] pids) throws IOException {
        if (pids != null) for (int pid : pids) if (Gate.alive(pid)) return true;
        return false;
    }
    private ServerSocket lock() throws Exception {
        long deadline = SystemClock.elapsedRealtime() + 10000;
        while (true) {
            ServerSocket socket = new ServerSocket(); socket.setReuseAddress(false);
            try { socket.bind(new InetSocketAddress(InetAddress.getByName("127.0.0.1"), 38764)); return socket; }
            catch (BindException e) { socket.close(); if (SystemClock.elapsedRealtime() >= deadline) throw new IOException("Another gSender switch is in progress. Please try again."); Thread.sleep(100); }
        }
    }
}
