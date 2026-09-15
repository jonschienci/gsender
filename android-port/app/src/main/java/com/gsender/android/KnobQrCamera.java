package com.gsender.android;

import android.app.Activity;
import android.graphics.ImageFormat;
import android.hardware.Camera;
import android.os.Handler;
import android.os.Looper;
import android.view.*;
import android.widget.FrameLayout;
import com.google.zxing.*;
import java.util.*;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Consumer;

/** Native preview only: no WebView camera permission, external app, file or network. */
@SuppressWarnings("deprecation")
final class KnobQrCamera extends FrameLayout implements SurfaceHolder.Callback {
    private final Activity activity;
    private final SurfaceView surface;
    private final Consumer<String> decoded, failure;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private final ExecutorService decoder = Executors.newSingleThreadExecutor();
    private final AtomicBoolean busy = new AtomicBoolean();
    private Camera camera;
    private boolean closed;
    private int width, height, orientation;
    KnobQrCamera(Activity activity, Consumer<String> decoded, Consumer<String> failure) {
        super(activity); this.activity = activity; this.decoded = decoded; this.failure = failure;
        surface = new SurfaceView(activity); addView(surface, new LayoutParams(-1, -1, Gravity.CENTER));
        surface.getHolder().addCallback(this);
        setBackgroundColor(0xff000000);
    }
    @Override public void surfaceCreated(SurfaceHolder holder) {
        if (closed || camera != null) return;
        try {
            int selected = -1; Camera.CameraInfo info = new Camera.CameraInfo();
            for (int i = 0; i < Camera.getNumberOfCameras(); i++) {
                Camera.getCameraInfo(i, info);
                if (info.facing == Camera.CameraInfo.CAMERA_FACING_BACK) { selected = i; break; }
            }
            if (selected < 0) { if (Camera.getNumberOfCameras() < 1) throw new IllegalStateException(); selected = 0; }
            Camera.getCameraInfo(selected, info); camera = Camera.open(selected);
            Camera.Parameters p = camera.getParameters();
            Camera.Size size = p.getSupportedPreviewSizes().stream()
                .filter(s -> s.width <= 1280 && s.height <= 960)
                .min(Comparator.comparingInt(s -> Math.abs(s.width*s.height - 640*480))).orElseThrow(IllegalStateException::new);
            width = size.width; height = size.height;
            p.setPreviewSize(width, height); p.setPreviewFormat(ImageFormat.NV21);
            List<String> modes = p.getSupportedFocusModes();
            if (modes.contains(Camera.Parameters.FOCUS_MODE_CONTINUOUS_PICTURE)) p.setFocusMode(Camera.Parameters.FOCUS_MODE_CONTINUOUS_PICTURE);
            else if (modes.contains(Camera.Parameters.FOCUS_MODE_AUTO)) p.setFocusMode(Camera.Parameters.FOCUS_MODE_AUTO);
            camera.setParameters(p);
            int degrees = activity.getWindowManager().getDefaultDisplay().getRotation() * 90;
            orientation = info.facing == Camera.CameraInfo.CAMERA_FACING_FRONT
                ? (360 - (info.orientation + degrees) % 360) % 360 : (info.orientation - degrees + 360) % 360;
            camera.setDisplayOrientation(orientation); camera.setPreviewDisplay(holder);
            camera.setErrorCallback((error, source) -> failure.accept("Camera unavailable. Close and scan again."));
            camera.addCallbackBuffer(new byte[width*height*3/2]);
            camera.addCallbackBuffer(new byte[width*height*3/2]);
            camera.setPreviewCallbackWithBuffer(this::frame); camera.startPreview();
            fit(); focus();
        } catch (Exception error) { close(); failure.accept("Camera unavailable. Check permission and try again."); }
    }
    private void focus() {
        if (closed || camera == null) return;
        try {
            if (Camera.Parameters.FOCUS_MODE_AUTO.equals(camera.getParameters().getFocusMode())) camera.autoFocus((ok, c) -> {});
        } catch (RuntimeException ignored) { /* No frame/secret logs. */ }
        ui.postDelayed(this::focus, 1500);
    }
    private void fit() {
        if (width == 0 || getWidth() == 0 || getHeight() == 0) return;
        int w = orientation % 180 == 0 ? width : height, h = orientation % 180 == 0 ? height : width;
        double scale = Math.min((double)getWidth()/w, (double)getHeight()/h);
        surface.setLayoutParams(new LayoutParams((int)(w*scale), (int)(h*scale), Gravity.CENTER));
    }
    @Override protected void onSizeChanged(int w, int h, int oldw, int oldh) { super.onSizeChanged(w,h,oldw,oldh); fit(); }
    private void frame(byte[] data, Camera source) {
        if (closed || source != camera) return;
        if (!busy.compareAndSet(false, true)) { source.addCallbackBuffer(data); return; }
        decoder.execute(() -> {
            String found = null;
            try {
                found = KnobQrDecoder.decode(new PlanarYUVLuminanceSource(data,width,height,0,0,width,height,false));
            } catch (ReaderException | IllegalArgumentException ignored) { /* Ignore unrelated/unreadable QR; never echo it. */ }
            catch (RuntimeException ignored) { /* A malformed frame never escapes the decoder. */ }
            finally { Arrays.fill(data, (byte)0); }
            final String value = found;
            ui.post(() -> {
                busy.set(false);
                if (closed || source != camera) return;
                if (value != null) { close(); decoded.accept(value); }
                else source.addCallbackBuffer(data);
            });
        });
    }
    void close() {
        if (closed) return; closed = true; ui.removeCallbacksAndMessages(null);
        if (camera != null) {
            try { camera.setPreviewCallbackWithBuffer(null); camera.stopPreview(); } catch (RuntimeException ignored) {}
            camera.release(); camera = null;
        }
        decoder.shutdownNow();
    }
    @Override public void surfaceChanged(SurfaceHolder holder, int format, int w, int h) { }
    @Override public void surfaceDestroyed(SurfaceHolder holder) { close(); }
}
