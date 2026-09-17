package com.gsender.android;

import java.util.Locale;

/** Monotonic deadlines and one-write ownership, independent of Android callbacks. */
final class BleKnobPolicy {
    static final int MAX_PACKET = 213, MIN_MTU = 247;
    long writeId, writeAt;
    static boolean fresh(long now, long at, long limit) { return now >= at && now-at < limit; }
    static boolean identity(String value) { return value != null && value.matches("wisecoco-[a-f0-9]{12}"); }
    static String address(String identity) {
        if (!identity(identity)) throw new IllegalArgumentException("Invalid knob identity");
        // GSB1 identifies the ESP32-C6 by its Wi-Fi STA/base MAC. The shipped
        // firmware uses four universal MACs and a public BLE address: ESP-IDF
        // adds 2 to the last octet (uint8 wrap, no carry into the prefix).
        // The address selects a peer; the existing QR-key handshake authenticates it.
        String hex=identity.substring(9);
        int[] octets=new int[6];
        for(int i=0;i<6;i++)octets[i]=Integer.parseInt(hex.substring(i*2,i*2+2),16);
        octets[5]=(octets[5]+2)&255;
        return String.format(Locale.ROOT,"%02X:%02X:%02X:%02X:%02X:%02X",octets[0],octets[1],octets[2],octets[3],octets[4],octets[5]);
    }
    boolean begin(long id, int length, long at, long now) {
        if (writeId != 0 || id <= 0 || length < 1 || length > MAX_PACKET || !fresh(now,at,50)) return false;
        writeId=id; writeAt=at; return true;
    }
    boolean complete(long now) {
        if (writeId == 0 || !fresh(now,writeAt,100)) return false;
        writeId=0; return true;
    }
}
