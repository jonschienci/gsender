package com.gsender.android;

import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Strict, bounded GSK1 parsing; errors never echo the QR/key. */
final class KnobQrPayload {
    private static final Pattern FORMAT = Pattern.compile("GSK1:([0-9A-F]{12}):([0-9.]{7,15}):([0-9A-F]{64})");
    final String device, host;
    private KnobQrPayload(String mac, String host) {
        this.device = "wisecoco-" + mac.toLowerCase(Locale.ROOT); this.host = host;
    }
    static KnobQrPayload parse(String value) {
        if (value == null || value.length() > 98) throw invalid();
        Matcher match = FORMAT.matcher(value);
        if (!match.matches() || match.group(3).matches("0{64}")) throw invalid();
        String[] parts = match.group(2).split("\\.", -1);
        if (parts.length != 4) throw invalid();
        int[] bytes = new int[4];
        for (int i = 0; i < 4; i++) {
            if (!parts[i].matches("0|[1-9][0-9]{0,2}")) throw invalid();
            bytes[i] = Integer.parseInt(parts[i]);
            if (bytes[i] > 255) throw invalid();
        }
        if (bytes[0] == 0 || bytes[0] == 127 || bytes[0] >= 224) throw invalid();
        return new KnobQrPayload(match.group(1), match.group(2));
    }
    private static IllegalArgumentException invalid() { return new IllegalArgumentException("Not a supported knob pairing QR"); }
}
