package com.gsender.android;

import com.google.zxing.*;
import com.google.zxing.common.HybridBinarizer;
import com.google.zxing.qrcode.QRCodeReader;
import java.util.Collections;

/** At most two local decode attempts per frame; QR-only, with inverted-display fallback. */
final class KnobQrDecoder {
    static String decode(LuminanceSource source) throws ReaderException {
        String value;
        try { value = read(source); } catch (ReaderException normalFailed) { value = read(source.invert()); }
        KnobQrPayload.parse(value);
        return value;
    }
    private static String read(LuminanceSource source) throws ReaderException {
        return new QRCodeReader().decode(new BinaryBitmap(new HybridBinarizer(source)),
            Collections.singletonMap(DecodeHintType.TRY_HARDER,Boolean.TRUE)).getText();
    }
}
