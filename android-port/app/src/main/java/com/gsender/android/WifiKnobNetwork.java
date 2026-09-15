package com.gsender.android;

import android.content.Context;
import android.net.*;
import android.net.wifi.WifiManager;
import android.os.*;
import org.json.JSONObject;
import java.util.function.Consumer;

/** Observes the current network only. Never connects, binds, scans, or changes Wi-Fi. */
final class WifiKnobNetwork implements AutoCloseable {
    private final ConnectivityManager connectivity;
    private final WifiManager wifi;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final Consumer<String> output;
    private final WifiKnobPolicy policy = new WifiKnobPolicy();
    private WifiManager.WifiLock lock;
    private String address;
    private boolean registered, closed;
    private final ConnectivityManager.NetworkCallback changes = new ConnectivityManager.NetworkCallback() {
        @Override public void onAvailable(Network network) { check(); }
        @Override public void onLost(Network network) { check(); }
        @Override public void onCapabilitiesChanged(Network network, NetworkCapabilities caps) { check(); }
        @Override public void onLinkPropertiesChanged(Network network, LinkProperties props) { check(); }
    };
    private final Runnable poll = new Runnable() {
        @Override public void run() { check(); if (!closed && policy.id != 0) main.postDelayed(this, 100); }
    };
    WifiKnobNetwork(Context context, Consumer<String> output) {
        this.output = output;
        connectivity = context.getSystemService(ConnectivityManager.class);
        wifi = context.getApplicationContext().getSystemService(WifiManager.class);
    }
    void accept(JSONObject message) {
        final long id = message.optLong("id");
        final String op = message.optString("op"), target = message.optString("address");
        main.post(() -> {
            if (closed) { emit(id, "lost"); return; }
            try {
                if (op.equals("start")) {
                    if (policy.id != 0) { emit(id, "lost"); return; }
                    address = target;
                    if (!policy.start(id, current(), EngineService.uiForeground)) { address = null; emit(id, "lost"); return; }
                    if (!registered) { connectivity.registerDefaultNetworkCallback(changes, main); registered = true; }
                    emit(id, "ready"); main.post(poll);
                } else if (op.equals("connected") && policy.connected(id)) {
                    check();
                    if (policy.id == id) {
                        int mode = Build.VERSION.SDK_INT >= 29 ? WifiManager.WIFI_MODE_FULL_LOW_LATENCY : WifiManager.WIFI_MODE_FULL_HIGH_PERF;
                        lock = wifi.createWifiLock(mode, "gsender:wireless-knob");
                        lock.setReferenceCounted(false); lock.acquire();
                    }
                } else if (op.equals("stop") && policy.id == id) stop(false);
            } catch (RuntimeException error) { if (policy.id == id) stop(true); else emit(id, "lost"); }
        });
    }
    // Include the local address/prefix in the lease identity: DHCP changes also revoke it.
    private String current() {
        Network network = connectivity.getActiveNetwork();
        NetworkCapabilities caps = connectivity.getNetworkCapabilities(network);
        if (network == null || caps == null || !caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) ||
            caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN)) return null;
        LinkProperties links = connectivity.getLinkProperties(network);
        if (links == null) return null;
        for (LinkAddress link : links.getLinkAddresses()) {
            if (WifiKnobPolicy.onSubnet(address, link.getAddress().getAddress(), link.getPrefixLength()))
                return network.toString() + "/" + link.toString();
        }
        return null;
    }
    void foregroundChanged() { main.post(this::check); }
    private void check() {
        if (closed || policy.id == 0) return;
        try { if (!policy.valid(current(), EngineService.uiForeground)) stop(true); }
        catch (RuntimeException error) { stop(true); }
    }
    private void emit(long id, String state) {
        try { output.accept(new JSONObject().put("event", "wifi").put("id", id).put("state", state).toString()); }
        catch (org.json.JSONException impossible) { throw new IllegalStateException(impossible); }
    }
    private void stop(boolean notify) {
        long old = policy.stop(); address = null; main.removeCallbacks(poll);
        if (lock != null) { try { if (lock.isHeld()) lock.release(); } catch (RuntimeException ignored) { } finally { lock = null; } }
        if (registered) { try { connectivity.unregisterNetworkCallback(changes); } catch (RuntimeException ignored) { } finally { registered = false; } }
        if (notify && old != 0) emit(old, "lost");
    }
    @Override public void close() { main.post(() -> { closed = true; stop(false); }); }
}
