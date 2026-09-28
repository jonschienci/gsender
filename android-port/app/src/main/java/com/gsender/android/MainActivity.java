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
    private KioskController kiosk;
    private int pageGeneration;
    private boolean kioskCheckPending;
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
            if (EngineService.url == null) {
                status.setVisibility(View.VISIBLE);
                kiosk.ready(false);
            } else if (loaded && !kioskCheckPending) {
                kioskCheckPending = true;
                // Do not lock the user in a loading/error page with no exit target.
                final int generation = pageGeneration;
                web.evaluateJavascript("(()=>{const b=document.querySelector('.android-build-badge[data-kiosk-exit=\"five-tap\"]');if(!b)return false;const r=b.getBoundingClientRect();return r.width>0&&r.height>0&&r.top>=0&&r.bottom<=innerHeight;})()", value -> {
                    if (generation == pageGeneration) kioskCheckPending = false;
                    if (!isDestroyed() && generation == pageGeneration && EngineService.url != null
                        && local(Uri.parse(web.getUrl() == null ? "" : web.getUrl()))) kiosk.ready("true".equals(value));
                });
            }
            handler.postDelayed(this, 1000);
        }
    };
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        visualizerBenchmark = getIntent().getBooleanExtra("visualizer_benchmark", false);
        kiosk = new KioskController(this);
        qr = new KnobQrFlow(this);
        tiltSensor = new TiltSensor(this);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        LinearLayout layout = new LinearLayout(this); layout.setOrientation(LinearLayout.VERTICAL);
        status = new TextView(this); status.setPadding(16, 12, 16, 12); layout.addView(status);
        web = new WebView(this); layout.addView(web, new LinearLayout.LayoutParams(-1, 0, 1)); setContentView(layout);
        // Consume only visible system bars, the keyboard and physical cutouts.
        // Kiosk uses the space released by navigation without covering controls.
        if (Build.VERSION.SDK_INT >= 30) getWindow().setDecorFitsSystemWindows(false);
        layout.setOnApplyWindowInsetsListener((v, insets) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                int types = WindowInsets.Type.displayCutout() | WindowInsets.Type.ime();
                if (!kiosk.fullscreen()) types |= WindowInsets.Type.systemBars();
                android.graphics.Insets safe = insets.getInsets(types);
                v.setPadding(safe.left, safe.top, safe.right, safe.bottom);
            } else {
                v.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(), insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            }
            return insets;
        });
        kiosk.update();
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
            @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap icon) {
                pageGeneration++;
                kioskCheckPending = false;
                kiosk.ready(false);
                if (qr != null) qr.cancel();
                if (tiltSensor != null) tiltSensor.stop();
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (local(request.getUrl()) && "/native/kiosk-toggle".equals(request.getUrl().getPath())) {
                    // A gesture from the first-party badge; no general admin JS bridge.
                    if (resumed && request.isForMainFrame() && request.hasGesture() && web.hasWindowFocus()
                        && request.getUrl().getQuery() == null && request.getUrl().getFragment() == null
                        && local(Uri.parse(web.getUrl() == null ? "" : web.getUrl()))) kiosk.toggle();
                    return true;
                }
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
            @Override public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                kiosk.ready(false);
                return false; // Use Android's normal renderer-crash recovery after releasing kiosk.
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    kiosk.ready(false);
                    status.setText(error.getDescription()); status.setVisibility(View.VISIBLE); loaded = false;
                }
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onConsoleMessage(ConsoleMessage message) {
                // Opt-in local telemetry, without enabling remote WebView debugging.
                if (visualizerBenchmark
                    && (message.message().startsWith("GSENDER_VISUALIZER_BENCHMARK ")
                        || message.message().startsWith("GSENDER_PREVIEW_BENCHMARK "))
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
        web.addJavascriptInterface(new Object() {
            @JavascriptInterface public String sample() {
                try {
                    android.app.ActivityManager manager = getSystemService(android.app.ActivityManager.class);
                    android.app.ActivityManager.MemoryInfo memory = new android.app.ActivityManager.MemoryInfo();
                    manager.getMemoryInfo(memory);
                    return new JSONObject().put("model", Build.MODEL).put("manufacturer", Build.MANUFACTURER)
                        .put("android", Build.VERSION.RELEASE).put("sdk", Build.VERSION.SDK_INT)
                        .put("totalMiB", memory.totalMem / 1048576.0).put("availableMiB", memory.availMem / 1048576.0)
                        .put("lowMemory", memory.lowMemory).put("appPssMiB", android.os.Debug.getPss() / 1024.0)
                        .put("pssScope", "Host app and Node; excludes isolated WebView renderer").toString();
                } catch (Exception error) { return "{}"; }
            }
        }, "AndroidBenchmark");
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
        if (kiosk != null) kiosk.update(); // Apply enrollment even if the app was already foreground.
        // Android grants access when the user chooses this USB handler. Keep the
        // existing WebView/backend; the USB scan observes the authoritative grant.
    }
    @Override public void onConfigurationChanged(android.content.res.Configuration configuration) {
        if (qr != null) qr.cancel();
        super.onConfigurationChanged(configuration);
        kiosk.update();
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
    @Override public void onBackPressed() {
        if (kiosk != null && kiosk.locked()) return;
        super.onBackPressed();
    }
    @Override public void onWindowFocusChanged(boolean focus) {
        super.onWindowFocusChanged(focus);
        if (focus && kiosk != null) kiosk.update();
        if (!focus && tiltSensor != null) tiltSensor.stop();
    }
    @Override protected void onPause() {
        resumed = false;
        kiosk.pause();
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
        kiosk.resume();
        if (qr != null) qr.resume();
        EngineService.foreground(true);
        if (web != null) web.evaluateJavascript("window.__usbKnobActive=true;window.dispatchEvent(new Event('usb-knob-visibility'));", null);
    }
    @Override protected void onDestroy() {
        if (kiosk != null) kiosk.ready(false);
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
