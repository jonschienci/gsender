package com.gsender.android;

import com.gsender.usb.UsbSerialModule;
import org.json.JSONObject;

public final class NativeRuntime {
    static { System.loadLibrary("node"); System.loadLibrary("gsender_bridge"); }
    private volatile boolean closing;
    private final EngineService service;
    private final UsbSerialModule usb;
    private final WifiKnobNetwork wifi;
    private final java.util.Map<Long, JSONObject> pending = new java.util.concurrent.ConcurrentHashMap<>();
    private final java.util.Set<String> connected = java.util.concurrent.ConcurrentHashMap.newKeySet();
    public NativeRuntime(EngineService service) {
        this.service = service;
        wifi = new WifiKnobNetwork(service, json -> {
            if (!closing && !deliver(json)) service.fail("Wi-Fi bridge queue stopped or overflowed");
        });
        usb = new UsbSerialModule(service, json -> {
            if (closing) return;
            try {
                JSONObject message = new JSONObject(json);
                if (message.has("id")) {
                    JSONObject request = pending.remove(message.getLong("id"));
                    if (request != null && !message.has("error")) {
                        if (request.getString("op").equals("open")) connected.add(request.getString("session"));
                        else connected.remove(request.getString("session"));
                        service.usbActive(!connected.isEmpty());
                    }
                } else if (message.optString("event").equals("close")) {
                    connected.remove(message.getString("session")); service.usbActive(!connected.isEmpty());
                }
            } catch (Exception e) { service.fail(e.toString()); }
            if (!deliver(json)) service.fail("USB bridge queue stopped or overflowed");
        });
    }
    public native int start(String entry);
    private native boolean deliver(String json);
    // Called by JNI on Node's thread. USB operations dispatch on their own worker.
    public void onNodeMessage(String json) {
        if (closing) return;
        try {
            JSONObject message = new JSONObject(json);
            if (message.optString("host").equals("wifi")) { wifi.accept(message); }
            else if (message.has("host")) {
                if (message.getString("host").equals("ui-status")) EngineService.uiStatus = message.getString("message");
                else if (message.getString("host").equals("ready")) service.ready(message.getInt("port"), message.getString("token"));
                else service.fail(message.optString("message", "Backend failed"));
            } else {
                if (message.optString("op").equals("open") || message.optString("op").equals("close"))
                    pending.put(message.getLong("id"), message);
                usb.accept(json);
            }
        } catch (Exception e) { service.fail(e.toString()); }
    }
    void foregroundChanged() { wifi.foregroundChanged(); }
    public void close() { close(() -> {}); }
    public void close(Runnable done) {
        closing = true;
        wifi.close();
        pending.clear(); connected.clear();
        usb.close(done);
    }
}
