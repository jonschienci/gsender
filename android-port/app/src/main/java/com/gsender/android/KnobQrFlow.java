package com.gsender.android;

import android.Manifest;
import android.app.*;
import android.content.pm.PackageManager;
import android.os.*;
import android.view.*;
import android.widget.*;
import org.json.JSONObject;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.*;
import java.util.function.Consumer;

/** Native-only scanner and automatic pairing. Only fixed authenticated loopback routes are reachable. */
final class KnobQrFlow {
    static final int CAMERA_PERMISSION = 41;
    private final MainActivity activity;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private final ExecutorService requests = Executors.newSingleThreadExecutor();
    private final KnobQrSession session = new KnobQrSession();
    private KnobQrCamera camera;
    private Dialog dialog;
    private String origin, engineKey, lease, candidate;
    private volatile boolean resumed, destroyed;
    private boolean checking, committing;
    private long id;
    KnobQrFlow(MainActivity activity) { this.activity = activity; }
    void resume() { resumed = true; }
    void pause() { resumed = false; cancel(); }
    void destroy() { destroyed = true; cancel(); requests.shutdown(); }
    void request() {
        if (!resumed || destroyed || session.active() || EngineService.url == null || EngineService.token == null) return;
        if (activity.checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED || !BleKnobNetwork.permitted(activity)) {
            java.util.ArrayList<String> permissions = new java.util.ArrayList<>();
            permissions.add(Manifest.permission.CAMERA);
            java.util.Collections.addAll(permissions, BleKnobNetwork.permissions());
            activity.requestPermissions(permissions.toArray(new String[0]), CAMERA_PERMISSION); return;
        }
        origin = EngineService.url; engineKey = EngineService.token;
        id = session.begin(origin, engineKey); final long generation = id;
        checking = false; committing = false;
        call("scan-begin", new JSONObject(), generation, response -> {
            lease = response.optString("token");
            if (!lease.matches("[a-f0-9]{32}")) { cancel(); notice("Pairing scanner unavailable."); return; }
            showScanner(); ui.postDelayed(this::check, 1000); ui.postDelayed(() -> {
                if (valid(generation)) { cancel(); notice("Pairing scan timed out. Open the QR and scan again."); }
            }, 60000);
        });
    }
    void permissionResult(int[] grants) {
        if (destroyed) return;
        // Never start a camera from a late permission result after a lifecycle change.
        notice(grants.length > 0 && java.util.Arrays.stream(grants).allMatch(grant -> grant == PackageManager.PERMISSION_GRANTED)
            ? "Permissions granted. Tap Scan knob QR to begin."
            : "Allow camera and, on Android 12 or newer, Nearby devices permission in Android app settings.");
    }
    private boolean valid(long generation) {
        return !destroyed && !activity.isFinishing() && !activity.isDestroyed()
            && session.valid(generation, resumed, EngineService.url, EngineService.token);
    }
    private void showScanner() {
        Dialog view = new Dialog(activity);
        view.setTitle("Scan knob pairing QR"); view.setCanceledOnTouchOutside(false);
        LinearLayout layout = new LinearLayout(activity); layout.setOrientation(LinearLayout.VERTICAL);
        layout.setPadding(16,16,16,16); layout.setBackgroundColor(0xff14212b);
        TextView help = new TextView(activity); help.setTextColor(0xffffffff); help.setTextSize(18);
        help.setText("Point the rear camera at the knob’s PAIR BT QR. Scanning pairs and connects automatically. Jogging becomes ready after the CNC is idle and knob controls are released.");
        layout.addView(help);
        camera = new KnobQrCamera(activity, this::found, message -> { cancel(); notice(message); });
        layout.addView(camera, new LinearLayout.LayoutParams(-1,0,1));
        Button close = new Button(activity); close.setText("Cancel scan"); close.setOnClickListener(v -> cancel()); layout.addView(close);
        view.setContentView(layout); view.setOnCancelListener(d -> cancel());
        dialog = view; view.getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE | WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        view.show(); view.getWindow().setLayout(-1,-1);
    }
    private void found(String value) {
        if (!valid(id)) { cancel(); return; }
        KnobQrPayload parsed;
        try { parsed = KnobQrPayload.parse(value); } catch (IllegalArgumentException e) { cancel(); return; }
        closeView(); candidate = value;
        if (committing) return;
        committing = true;
        JSONObject body = body();
        try { body.put("qr", candidate); } catch (Exception ignored) { cancel(); return; }
        candidate = null;
        call("scan-commit", body, id, response -> {
            lease = null; cancel(); notice("Knob paired. Connecting automatically…");
        });
    }
    private JSONObject body() {
        JSONObject value = new JSONObject(); try { value.put("token",lease); } catch (Exception ignored) {} return value;
    }
    private void check() {
        if (!valid(id)) { cancel(); return; }
        if (committing) return;
        if (!checking) {
            checking = true;
            call("scan-check",body(),id,response -> { checking = false; ui.postDelayed(this::check,1000); });
        }
    }
    private void closeView() {
        if (camera != null) { camera.close(); camera = null; }
        if (dialog != null) { dialog.setOnCancelListener(null); dialog.dismiss(); dialog = null; }
    }
    void cancel() {
        String oldLease = lease, oldOrigin = origin, oldKey = engineKey;
        lease = null; candidate = null; origin = null; engineKey = null;
        session.cancel(); ui.removeCallbacksAndMessages(null); closeView();
        if (oldLease != null && !requests.isShutdown()) requests.execute(() -> {
            try { api(oldOrigin,oldKey,"scan-cancel",new JSONObject().put("token",oldLease)); }
            catch (Exception ignored) { /* Reservation also expires; never log server data. */ }
        });
    }
    private void call(String action, JSONObject body, long generation, Consumer<JSONObject> success) {
        final String address = origin, key = engineKey;
        requests.execute(() -> {
            JSONObject result;
            // Check again on the worker: a queued confirmation cannot start after background/cancel.
            try { if (!session.valid(generation,resumed,EngineService.url,EngineService.token) || destroyed) return;
                result = api(address,key,action,body); }
            catch (Exception ignored) { result = null; }
            final JSONObject response = result;
            ui.post(() -> {
                if (!valid(generation)) {
                    // A begin reply racing app background must not leave a camera reservation behind.
                    if ("scan-begin".equals(action) && response != null && !requests.isShutdown()) requests.execute(() -> {
                        try { api(address,key,"scan-cancel",new JSONObject().put("token",response.optString("token"))); } catch (Exception ignored) {}
                    });
                    return;
                }
                if (response == null || response.has("error")) {
                    cancel(); notice("Scanner unavailable or expired. Disconnect the knob, then scan again."); return;
                }
                success.accept(response);
            });
        });
    }
    private static JSONObject api(String origin, String key, String action, JSONObject data) throws Exception {
        URI base = new URI(origin);
        if (!"http".equals(base.getScheme()) || !"127.0.0.1".equals(base.getHost()) || base.getPort() < 1 ||
            !action.matches("scan-(begin|check|commit|cancel)")) throw new IOException();
        HttpURLConnection connection = (HttpURLConnection)new URL(origin+"/api/usb-pendant/"+action).openConnection();
        try {
            connection.setInstanceFollowRedirects(false); connection.setConnectTimeout(2000); connection.setReadTimeout(2000);
            connection.setRequestMethod("POST"); connection.setRequestProperty("X-gSender-Key",key);
            connection.setRequestProperty("X-USB-Pendant","1"); connection.setRequestProperty("Content-Type","application/json");
            connection.setDoOutput(true); byte[] bytes = data.toString().getBytes(StandardCharsets.UTF_8);
            connection.setFixedLengthStreamingMode(bytes.length);
            try (OutputStream out = connection.getOutputStream()) { out.write(bytes); } finally { java.util.Arrays.fill(bytes,(byte)0); }
            if (connection.getResponseCode() != 200) throw new IOException();
            try (InputStream in = connection.getInputStream(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                byte[] chunk = new byte[256]; int n;
                while ((n=in.read(chunk))!=-1) { if (out.size()+n>2048) throw new IOException(); out.write(chunk,0,n); }
                return new JSONObject(out.toString(StandardCharsets.UTF_8.name()));
            }
        } finally { connection.disconnect(); }
    }
    private void notice(String message) { if (!destroyed) Toast.makeText(activity,message,Toast.LENGTH_LONG).show(); }
}
