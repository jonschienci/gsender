package com.gsender.android;

import android.app.Activity;
import android.content.*;
import android.net.Uri;
import android.os.*;
import android.view.*;
import android.webkit.*;
import android.widget.*;
import android.util.Base64;
import org.json.JSONObject;
import java.io.OutputStream;

public final class MainActivity extends Activity {
    private WebView web;
    private TextView status;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private ValueCallback<Uri[]> fileCallback;
    private byte[] export;
    private boolean loaded;
    private boolean visualizerBenchmark;
    private KnobQrFlow qr;
    private TiltSensor tiltSensor;
    private boolean resumed;
    private final Runnable poll = new Runnable() {
        public void run() {
            status.setText(EngineService.status);
            if (!loaded && EngineService.url != null) {
                loaded = true;
                final String address = EngineService.url;
                final String key = EngineService.token;
                CookieManager cookies = CookieManager.getInstance();
                cookies.setAcceptCookie(true);
                // Replace the previous process's credential before any page or socket runs.
                cookies.setCookie(address, "gsender_local=" + key + "; HttpOnly; SameSite=Strict; Path=/", success -> {
                    if (isDestroyed() || !key.equals(EngineService.token)) return;
                    if (!Boolean.TRUE.equals(success)) {
                        loaded = false; EngineService.uiStatus = "Could not initialize UI session"; return;
                    }
                    EngineService.uiStatus = "UI session initialized; waiting for connection";
                    // Bypass an index.html cached by older builds; asset caching stays enabled.
                    final String benchmark = visualizerBenchmark ? "&benchmark=visualizer" : "";
                    web.loadUrl(address + "/" + "?launch=" + android.os.SystemClock.elapsedRealtime() + benchmark,
                        java.util.Collections.singletonMap("X-gSender-Key", key));
                });
            }
            if (EngineService.url == null) { status.setVisibility(View.VISIBLE); }
            handler.postDelayed(this, 1000);
        }
    };
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        visualizerBenchmark = getIntent().getBooleanExtra("visualizer_benchmark", false);
        qr = new KnobQrFlow(this);
        tiltSensor = new TiltSensor(this);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        LinearLayout layout = new LinearLayout(this); layout.setOrientation(LinearLayout.VERTICAL);
        status = new TextView(this); status.setPadding(16, 12, 16, 12); layout.addView(status);
        web = new WebView(this); layout.addView(web, new LinearLayout.LayoutParams(-1, 0, 1)); setContentView(layout);
        // Respect system insets on Android 15 rather than obscuring gSender controls.
        layout.setOnApplyWindowInsetsListener((v, insets) -> {
            v.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(), insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            return insets;
        });
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true); settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false); settings.setAllowContentAccess(true);
        settings.setUseWideViewPort(true); settings.setLoadWithOverviewMode(true);
        settings.setSupportZoom(false); settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        web.setInitialScale(0);
        settings.setTextZoom(100); settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        web.setWebViewClient(new WebViewClient() {
            @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap icon) { if (qr != null) qr.cancel(); if (tiltSensor != null) tiltSensor.stop(); }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (local(request.getUrl()) && "/native/knob-pair".equals(request.getUrl().getPath())) {
                    // A fixed first-party navigation from an explicit tap, not a general camera JS bridge.
                    if (request.isForMainFrame() && request.hasGesture() && web.hasWindowFocus()
                        && request.getUrl().getQuery() == null && request.getUrl().getFragment() == null
                        && local(Uri.parse(web.getUrl() == null ? "" : web.getUrl()))) qr.request();
                    return true;
                }
                if (local(request.getUrl())) return false;
                if (request.isForMainFrame() && "https".equals(request.getUrl().getScheme())) {
                    startActivity(new Intent(Intent.ACTION_VIEW, request.getUrl()));
                }
                return true;
            }
            @Override public void onPageFinished(WebView view, String url) {
                if (local(Uri.parse(url))) status.setVisibility(View.GONE);
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) { status.setText(error.getDescription()); status.setVisibility(View.VISIBLE); loaded = false; }
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onConsoleMessage(ConsoleMessage message) {
                // Opt-in local telemetry, without enabling remote WebView debugging.
                if (visualizerBenchmark
                    && message.message().startsWith("GSENDER_VISUALIZER_BENCHMARK ")
                    && message.message().length() <= 3500) {
                    android.util.Log.i("gSenderBench", message.message());
                    return true;
                }
                return super.onConsoleMessage(message);
            }
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*");
                startActivityForResult(intent, 10); return true;
            }
        });
        web.addJavascriptInterface(new Object() {
            @JavascriptInterface public boolean available() { return tiltSensor.available(); }
            @JavascriptInterface public String sample() { return tiltSensor.sample(); }
            @JavascriptInterface public void start() {
                runOnUiThread(() -> {
                    if (resumed && !isFinishing() && !isDestroyed() && web.hasWindowFocus()
                        && local(Uri.parse(web.getUrl() == null ? "" : web.getUrl()))) tiltSensor.start();
                });
            }
            @JavascriptInterface public void stop() { runOnUiThread(() -> tiltSensor.stop()); }
        }, "AndroidTilt");
        web.addJavascriptInterface(new Object() {
            @JavascriptInterface public void jogPress() {
                runOnUiThread(() -> {
                    if (web == null || !web.hasWindowFocus() || !local(Uri.parse(web.getUrl() == null ? "" : web.getUrl()))) return;
                    android.os.Vibrator vibrator = getSystemService(android.os.Vibrator.class);
                    if (vibrator == null || !vibrator.hasVibrator()) return;
                    // An explicit app pulse works even when system key-click feedback is off.
                    // Keep this independent of jogging so vibration failure cannot interrupt motion handling.
                    try {
                        vibrator.vibrate(android.os.VibrationEffect.createOneShot(75, 255),
                            new android.media.AudioAttributes.Builder()
                                .setUsage(android.media.AudioAttributes.USAGE_ASSISTANCE_SONIFICATION)
                                .setContentType(android.media.AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
                    } catch (RuntimeException error) {
                        android.util.Log.w("gSenderHaptics", "Jog vibration unavailable", error);
                    }
                });
            }
        }, "AndroidHaptics");
        web.addJavascriptInterface(new Object() {
            @JavascriptInterface public void save(String name, String data) {
                if (data.length() > 48 * 1024 * 1024) return;
                runOnUiThread(() -> {
                    if (!local(Uri.parse(web.getUrl() == null ? "" : web.getUrl()))) return;
                    if (export != null) return;
                    try {
                        export = Base64.decode(data, Base64.DEFAULT);
                        startActivityForResult(new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE)
                            .setType("application/octet-stream").putExtra(Intent.EXTRA_TITLE, name), 11);
                    } catch (Exception e) { export = null; status.setText(e.toString()); status.setVisibility(View.VISIBLE); }
                });
            }
        }, "AndroidDownload");
        web.setDownloadListener((url, userAgent, disposition, mime, length) -> {
            if (!url.startsWith("blob:" + EngineService.url) && !local(Uri.parse(url))) return;
            String name = URLUtil.guessFileName(url, disposition, mime);
            web.evaluateJavascript("fetch(" + JSONObject.quote(url) + ").then(r=>r.blob()).then(b=>{const f=new FileReader();f.onload=()=>AndroidDownload.save(" + JSONObject.quote(name) + ",f.result.split(',')[1]);f.readAsDataURL(b);})", null);
        });
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission("android.permission.POST_NOTIFICATIONS") != android.content.pm.PackageManager.PERMISSION_GRANTED)
            requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, 12);
        startForegroundService(new Intent(this, EngineService.class));
        handler.post(poll);
    }
    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        // Android grants access when the user chooses this USB handler. Keep the
        // existing WebView/backend; the USB scan observes the authoritative grant.
    }
    @Override public void onConfigurationChanged(android.content.res.Configuration configuration) {
        if (qr != null) qr.cancel();
        super.onConfigurationChanged(configuration);
    }
    private void showUsbStatus() {
        TextView details = new TextView(this);
        details.setPadding(20, 12, 20, 12); details.setTextSize(14); details.setTextIsSelectable(true);
        Runnable refresh = () -> details.setText("Build " + BuildConfig.VERSION_CODE + "\n" + EngineService.status + "\n" + EngineService.uiStatus + "\n\n" + com.gsender.usb.UsbSerialModule.diagnostics(this));
        refresh.run();
        ScrollView scroll = new ScrollView(this); scroll.addView(details);
        android.app.AlertDialog dialog = new android.app.AlertDialog.Builder(this).setTitle("USB status")
            .setView(scroll).setPositiveButton("Done", null).setNeutralButton("Refresh", null).setNegativeButton("Copy", null).create();
        dialog.setOnShowListener(d -> {
            dialog.getButton(-3).setOnClickListener(v -> refresh.run());
            dialog.getButton(-2).setOnClickListener(v -> {
                getSystemService(android.content.ClipboardManager.class).setPrimaryClip(ClipData.newPlainText("gSender USB status", details.getText()));
                Toast.makeText(this, "USB status copied", Toast.LENGTH_SHORT).show();
            });
        });
        dialog.show();
    }
    private boolean local(Uri uri) {
        if (EngineService.url == null) return false;
        Uri base = Uri.parse(EngineService.url);
        return "http".equals(uri.getScheme()) && "127.0.0.1".equals(uri.getHost()) && uri.getPort() == base.getPort();
    }
    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == 10 && fileCallback != null) {
            fileCallback.onReceiveValue(result == RESULT_OK && data != null ? new Uri[]{data.getData()} : null); fileCallback = null;
        }
        if (request == 11) {
            byte[] bytes = export; export = null;
            if (result == RESULT_OK && data != null && bytes != null) new Thread(() -> {
                try (OutputStream stream = getContentResolver().openOutputStream(data.getData())) { stream.write(bytes); }
                catch (Exception e) { runOnUiThread(() -> Toast.makeText(this, "Export failed: " + e.getMessage(), Toast.LENGTH_LONG).show()); }
            }, "gsender-export").start();
        }
    }
    @Override public void onWindowFocusChanged(boolean focus) {
        super.onWindowFocusChanged(focus);
        if (!focus && tiltSensor != null) tiltSensor.stop();
    }
    @Override protected void onPause() {
        resumed = false;
        if (tiltSensor != null) tiltSensor.stop();
        if (qr != null) qr.pause();
        EngineService.foreground(false);
        // Revoke pendant arming when Android backgrounds the app or covers it
        // with a permission dialog. The backend also enforces a short UI lease.
        if (web != null) web.evaluateJavascript("window.__usbKnobActive=false;window.dispatchEvent(new Event('usb-knob-visibility'));", null);
        super.onPause();
    }
    @Override protected void onResume() {
        super.onResume();
        resumed = true;
        if (qr != null) qr.resume();
        EngineService.foreground(true);
        if (web != null) web.evaluateJavascript("window.__usbKnobActive=true;window.dispatchEvent(new Event('usb-knob-visibility'));", null);
    }
    @Override protected void onDestroy() {
        if (tiltSensor != null) tiltSensor.stop();
        if (qr != null) qr.destroy();
        handler.removeCallbacks(poll);
        if (fileCallback != null) fileCallback.onReceiveValue(null);
        web.destroy();
        super.onDestroy();
    }
    @Override public void onRequestPermissionsResult(int request, String[] permissions, int[] grants) {
        super.onRequestPermissionsResult(request, permissions, grants);
        if (request == KnobQrFlow.CAMERA_PERMISSION && qr != null) qr.permissionResult(grants);
    }
}
