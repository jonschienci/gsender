package com.gsender.android;

/** Pure state policy: losing foreground or the selected current network ends a lease. */
final class WifiKnobPolicy {
    long id;
    private String network;
    private boolean connected;
    boolean start(long request, String currentNetwork, boolean foreground) {
        if (id != 0 || request <= 0 || currentNetwork == null || !foreground) return false;
        id = request; network = currentNetwork; connected = false; return true;
    }
    boolean valid(String currentNetwork, boolean foreground) {
        return id != 0 && foreground && network.equals(currentNetwork);
    }
    boolean connected(long request) { if (id != request || id == 0 || connected) return false; connected = true; return true; }
    boolean needsLock() { return id != 0 && connected; }
    long stop() { long old = id; id = 0; network = null; connected = false; return old; }

    static boolean onSubnet(String host, byte[] local, int prefix) {
        if (host == null || local.length != 4 || prefix < 1 || prefix > 30) return false;
        String[] pieces = host.split("\\.", -1);
        if (pieces.length != 4) return false;
        long remote = 0, address = 0;
        for (int i = 0; i < 4; i++) {
            if (!pieces[i].matches("0|[1-9][0-9]{0,2}")) return false;
            int octet = Integer.parseInt(pieces[i]); if (octet > 255) return false;
            remote = (remote << 8) | octet; address = (address << 8) | (local[i] & 255);
        }
        long mask = (0xffffffffL << (32 - prefix)) & 0xffffffffL;
        long first = address & mask, last = first | (0xffffffffL ^ mask);
        return remote > first && remote < last && remote != address && (remote & mask) == first;
    }
}
