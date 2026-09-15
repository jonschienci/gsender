package com.gsender.usb;

import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbDeviceConnection;
import android.hardware.usb.UsbManager;
import android.os.Build;
import android.util.Base64;
import com.hoho.android.usbserial.driver.UsbSerialDriver;
import com.hoho.android.usbserial.driver.UsbSerialPort;
import com.hoho.android.usbserial.driver.UsbSerialProber;
import com.hoho.android.usbserial.util.SerialInputOutputManager;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import java.io.IOException;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ScheduledThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

/** In-process transport for the gSender Node serial adapter. No Activity or remote server. */
public final class UsbSerialModule implements AutoCloseable {
    public interface Output { void send(String json); }
    private final Context context;
    private final UsbManager manager;
    private final Output output;
    private final ScheduledThreadPoolExecutor worker = new ScheduledThreadPoolExecutor(1);
    private final Map<String, Session> sessions = new HashMap<>();
    private final String permissionAction;
    private int permissionId;
    private String lastListing;
    private volatile boolean disposed;
    private static final java.util.ArrayDeque<String> history = new java.util.ArrayDeque<>();
    private static synchronized void record(String message) {
        if (history.size() >= 40) history.removeFirst();
        history.addLast(new java.text.SimpleDateFormat("HH:mm:ss", java.util.Locale.US).format(new java.util.Date()) + " " + message);
        android.util.Log.i("gSenderUSB", message);
    }
    public static String diagnostics(Context context) {
        StringBuilder text = new StringBuilder();
        try {
            UsbManager manager = (UsbManager) context.getSystemService(Context.USB_SERVICE);
            Map<String, UsbDevice> devices = manager.getDeviceList();
            text.append("Android sees ").append(devices.size()).append(" USB device(s).\n");
            for (UsbDevice device : devices.values()) {
                UsbSerialDriver driver = UsbSerialProber.getDefaultProber().probeDevice(device);
                text.append(String.format(java.util.Locale.US, "%04x:%04x", device.getVendorId(), device.getProductId()))
                    .append(" — ").append(device.getDeviceName()).append("\nPermission: ")
                    .append(manager.hasPermission(device) ? "granted" : "not granted")
                    .append("; serial ports: ").append(driver == null ? 0 : driver.getPorts().size()).append("\n");
            }
            if (devices.isEmpty()) text.append("Unplug the dongle from the tablet, then reconnect it with the board powered. If still empty, restart the tablet.\n");
        } catch (Exception e) { text.append("USB scan failed: ").append(e).append("\n"); }
        synchronized (UsbSerialModule.class) {
            text.append("\nRecent USB events (this app session):\n");
            for (String event : history) text.append(event).append("\n");
        }
        return text.toString();
    }

    private static final class Session {
        String id;
        JSONObject request;
        UsbSerialPort port;
        UsbDeviceConnection connection;
        SerialInputOutputManager io;
        PendingIntent permission;
        boolean opening = true;
    }

    public UsbSerialModule(Context context, Output output) {
        this.context = context.getApplicationContext();
        this.output = output;
        manager = (UsbManager) this.context.getSystemService(Context.USB_SERVICE);
        permissionAction = this.context.getPackageName() + ".GSENDER_USB_PERMISSION";
        IntentFilter filter = new IntentFilter(permissionAction);
        filter.addAction(UsbManager.ACTION_USB_DEVICE_DETACHED);
        filter.addAction(UsbManager.ACTION_USB_DEVICE_ATTACHED);
        if (Build.VERSION.SDK_INT >= 33) {
            this.context.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else this.context.registerReceiver(receiver, filter);
        worker.setRemoveOnCancelPolicy(true);
        record("USB module ready");
    }

    /** Called by the selected embedded-Node binding; never expose this to remote WebView pages. */
    public void accept(String json) {
        if (disposed) return;
        final long receivedAt = android.os.SystemClock.elapsedRealtime();
        worker.execute(() -> {
            JSONObject request = null;
            try {
                request = new JSONObject(json);
                dispatch(request, receivedAt);
            } catch (Exception e) {
                if (request != null) reject(request, code(e), e.getMessage());
            }
        });
    }

    private final BroadcastReceiver receiver = new BroadcastReceiver() {
        @Override public void onReceive(Context c, Intent intent) {
            if (disposed) return;
            UsbDevice device = intent.getParcelableExtra(UsbManager.EXTRA_DEVICE);
            if (device == null) return;
            record(intent.getAction() + " device=" + device.getDeviceId());
            worker.execute(() -> {
                for (Session s : sessions.values().toArray(new Session[0])) {
                    if (s.port.getDevice().getDeviceId() != device.getDeviceId()) continue;
                    if (UsbManager.ACTION_USB_DEVICE_DETACHED.equals(intent.getAction())) {
                        terminate(s, "ENODEV", "USB device detached");
                    } else if (permissionAction.equals(intent.getAction()) && s.opening
                            && s.id.equals(intent.getStringExtra("session"))) {
                        if (manager.hasPermission(device)) openGranted(s);
                        else terminate(s, "EACCES", "USB permission denied");
                    }
                }
            });
        }
    };

    private java.util.List<UsbSerialDriver> availableDrivers() {
        Map<String, UsbDevice> devices = manager.getDeviceList();
        // Recover when Android misses a detach broadcast; never reuse a stale open handle.
        for (Session session : sessions.values().toArray(new Session[0])) {
            if (!devices.containsKey(session.port.getDevice().getDeviceName()))
                terminate(session, "ENODEV", "USB device no longer enumerated by Android");
        }
        java.util.List<UsbSerialDriver> drivers = new java.util.ArrayList<>();
        for (UsbDevice device : devices.values()) {
            try {
                UsbSerialDriver driver = UsbSerialProber.getDefaultProber().probeDevice(device);
                if (driver != null) drivers.add(driver);
            } catch (RuntimeException e) { record("Probe failed: " + device.getDeviceName() + " " + e.getMessage()); }
        }
        return drivers;
    }

    private String path(UsbSerialPort p) {
        return "android-usb:" + p.getDevice().getDeviceId() + ":" + p.getPortNumber();
    }

    private void dispatch(JSONObject r, long receivedAt) throws Exception {
        String op = r.getString("op");
        if (op.equals("list")) {
            JSONArray list = new JSONArray();
            for (UsbSerialDriver driver : availableDrivers()) {
                UsbDevice d = driver.getDevice();
                for (UsbSerialPort port : driver.getPorts()) {
                    JSONObject item = new JSONObject();
                    item.put("path", path(port));
                    item.put("usbPermission", manager.hasPermission(d));
                    item.put("vendorId", String.format("%04x", d.getVendorId()));
                    item.put("productId", String.format("%04x", d.getProductId()));
                    try {
                        item.put("manufacturer", d.getManufacturerName());
                        item.put("friendlyName", d.getProductName());
                        if (manager.hasPermission(d)) item.put("serialNumber", d.getSerialNumber());
                    } catch (SecurityException ignored) {
                        // Permission can disappear between enumeration and descriptor access.
                    }
                    list.put(item);
                }
            }
            String listing = list.toString();
            if (!listing.equals(lastListing)) {
                record("gSender requested port list: " + list.length() + " serial port(s)");
                lastListing = listing;
            }
            resolve(r, list);
            return;
        }
        String id = r.getString("session");
        if (op.equals("open")) {
            java.util.List<UsbSerialDriver> drivers = availableDrivers();
            if (sessions.containsKey(id)) throw new IOException("Session already exists");
            JSONObject options = r.getJSONObject("options");
            String target = options.getString("path");
            record("Open requested: " + target);
            for (Session other : sessions.values()) {
                if (path(other.port).equals(target)) {
                    reject(r, "EBUSY", "USB port is already in use"); return;
                }
            }
            UsbSerialPort port = null;
            for (UsbSerialDriver driver : drivers) {
                for (UsbSerialPort candidate : driver.getPorts()) {
                    if (path(candidate).equals(target)) port = candidate;
                }
            }
            if (port == null) { reject(r, "ENODEV", "USB serial device not found"); return; }
            // Automatic attempts must never open a permission dialog, including
            // a grant revoked between enumeration and opening. Manual Connect
            // can still explicitly request permission.
            if (!options.optBoolean("requestPermission", true) && !manager.hasPermission(port.getDevice())) {
                reject(r, "EACCES", "Choose gSender as the Android USB handler or connect manually to grant access");
                return;
            }
            Session s = new Session();
            s.id = id; s.request = r; s.port = port;
            sessions.put(id, s);
            if (manager.hasPermission(port.getDevice())) openGranted(s);
            else {
                Intent permissionIntent = new Intent(permissionAction).setPackage(context.getPackageName());
                permissionIntent.putExtra("session", id);
                int flags = PendingIntent.FLAG_UPDATE_CURRENT;
                if (Build.VERSION.SDK_INT >= 31) flags |= PendingIntent.FLAG_MUTABLE;
                s.permission = PendingIntent.getBroadcast(context, ++permissionId, permissionIntent, flags);
                try {
                    record("Requesting Android USB permission: " + target);
                    manager.requestPermission(port.getDevice(), s.permission);
                    checkPermission(s);
                    worker.schedule(() -> {
                        if (sessions.get(id) == s && s.opening)
                            terminate(s, "ETIMEDOUT", "USB permission request timed out");
                    }, 110, TimeUnit.SECONDS);
                } catch (Exception e) { terminate(s, code(e), e.getMessage()); }
            }
            return;
        }
        Session s = sessions.get(id);
        if (op.equals("close")) {
            if (s != null) {
                if (s.opening) reject(s.request, "ECANCELED", "USB open canceled");
                release(s);
            }
            resolve(r, JSONObject.NULL);
            return;
        }
        if (s == null || s.opening) { reject(r, "ENOTCONN", "USB port not open"); return; }
        try {
            if (op.equals("write")) {
                byte[] bytes = Base64.decode(r.getString("data"), Base64.NO_WRAP);
                // Synchronous driver write on worker; resolve only after full write.
                int timeout = WriteDeadline.remaining(r.optInt("maxQueueMs", 0), receivedAt,
                    android.os.SystemClock.elapsedRealtime());
                s.port.write(bytes, timeout);
            } else if (op.equals("set")) {
                JSONObject signals = r.getJSONObject("signals");
                java.util.Iterator<String> keys = signals.keys();
                while (keys.hasNext()) {
                    String key = keys.next();
                    if (!key.equals("dtr") && !key.equals("rts"))
                        throw new UnsupportedOperationException("Unsupported serial signal: " + key);
                }
                if (signals.has("dtr")) s.port.setDTR(signals.getBoolean("dtr"));
                if (signals.has("rts")) s.port.setRTS(signals.getBoolean("rts"));
            } else throw new UnsupportedOperationException("Unsupported operation: " + op);
            resolve(r, JSONObject.NULL);
        } catch (Exception e) {
            reject(r, code(e), e.getMessage());
            terminate(s, code(e), e.getMessage());
        }
    }

    private void checkPermission(Session s) {
        worker.schedule(() -> {
            if (disposed || sessions.get(s.id) != s || !s.opening) return;
            // Permission broadcasts can be delayed; the OS grant itself is authoritative.
            if (manager.hasPermission(s.port.getDevice())) openGranted(s);
            else checkPermission(s);
        }, 500, TimeUnit.MILLISECONDS);
    }

    private void openGranted(Session s) {
        record("Permission granted; opening " + path(s.port));
        try {
            JSONObject o = s.request.getJSONObject("options");
            for (String flow : new String[]{"rtscts", "xon", "xoff", "xany"}) {
                if (o.optBoolean(flow, false)) throw new UnsupportedOperationException("Flow control unsupported: " + flow);
            }
            int baud = o.optInt("baudRate", 115200);
            int bits = o.optInt("dataBits", 8);
            int stops = o.optInt("stopBits", 1);
            String parity = o.optString("parity", "none");
            int parityValue;
            switch (parity) {
                case "none": parityValue = UsbSerialPort.PARITY_NONE; break;
                case "odd": parityValue = UsbSerialPort.PARITY_ODD; break;
                case "even": parityValue = UsbSerialPort.PARITY_EVEN; break;
                case "mark": parityValue = UsbSerialPort.PARITY_MARK; break;
                case "space": parityValue = UsbSerialPort.PARITY_SPACE; break;
                default: throw new IllegalArgumentException("Invalid parity");
            }
            if (baud <= 0 || bits < 5 || bits > 8 || (stops != 1 && stops != 2))
                throw new IllegalArgumentException("Invalid serial parameters");
            s.connection = manager.openDevice(s.port.getDevice());
            if (s.connection == null) throw new IOException("Cannot open USB device");
            s.port.open(s.connection);
            s.port.setParameters(baud, bits, stops, parityValue);
            // Assert CDC terminal-ready signals once; some firmware gates output on DTR.
            // No low/high reset pulse. Callers can override either initial level.
            s.port.setDTR(o.optBoolean("dtr", true));
            s.port.setRTS(o.optBoolean("rts", true));
            s.io = new SerialInputOutputManager(s.port, new SerialInputOutputManager.Listener() {
                @Override public void onNewData(byte[] bytes) {
                    emit(object("event", "data", "session", s.id,
                        "data", Base64.encodeToString(bytes, Base64.NO_WRAP)));
                }
                @Override public void onRunError(Exception e) {
                    if (!disposed) worker.execute(() -> {
                        if (sessions.get(s.id) == s) terminate(s, "EIO", e.getMessage());
                    });
                }
            });
            s.opening = false;
            if (s.permission != null) s.permission.cancel();
            resolve(s.request, JSONObject.NULL);
            s.io.start();
            record("USB connected: " + path(s.port));
        } catch (Exception e) { terminate(s, code(e), e.getMessage()); }
    }

    private void terminate(Session s, String code, String message) {
        if (sessions.get(s.id) != s) return;
        record("USB closed: " + code + " " + message);
        if (s.opening) reject(s.request, code, message);
        else emit(object("event", "close", "session", s.id, "error", object("code", code, "message", message)));
        release(s);
    }

    private void release(Session s) {
        sessions.remove(s.id);
        if (s.permission != null) s.permission.cancel();
        if (s.io != null) { s.io.setListener(null); s.io.stop(); }
        try { s.port.close(); } catch (Exception e) { record("Close: " + e.getMessage()); }
        if (s.connection != null) s.connection.close();
    }

    private static String code(Exception e) {
        if (e instanceof SecurityException) return "EACCES";
        if (e instanceof UnsupportedOperationException) return "ENOTSUP";
        if (e instanceof IllegalArgumentException || e instanceof JSONException) return "EINVAL";
        return "EIO";
    }
    private static JSONObject object(Object... values) {
        JSONObject object = new JSONObject();
        try {
            for (int i = 0; i < values.length; i += 2) object.put((String) values[i], values[i + 1]);
        } catch (JSONException e) { throw new IllegalStateException(e); }
        return object;
    }
    private synchronized void emit(JSONObject message) { output.send(message.toString()); }
    private void resolve(JSONObject r, Object result) { emit(object("id", r.opt("id"), "result", result)); }
    private void reject(JSONObject r, String code, String message) {
        record(r.optString("op") + ": " + code + " " + message);
        emit(object("id", r.opt("id"), "error", object("code", code, "message", message)));
    }
    @Override public void close() { close(() -> {}); }
    public synchronized void close(Runnable done) {
        if (disposed) { done.run(); return; }
        disposed = true;
        context.unregisterReceiver(receiver);
        worker.execute(() -> {
            try {
                for (Session s : sessions.values().toArray(new Session[0])) release(s);
                record("USB module stopped");
            } finally { done.run(); }
        });
        worker.setExecuteExistingDelayedTasksAfterShutdownPolicy(false);
        worker.shutdown();
    }
}
