package com.gsender.android;

import com.google.zxing.*;
import com.google.zxing.common.*;
import com.google.zxing.qrcode.*;
import java.util.*;

public class KnobQrTest {
    // Synthetic key only. Never import a real pairing file into tests.
    private static final String QR = "GSK1:123456ABCDEF:192.168.1.80:" + "A7".repeat(32);
    private static void check(boolean good) { if (!good) throw new AssertionError("QR test failed"); }
    private static void invalid(String input) {
        try { KnobQrPayload.parse(input); throw new AssertionError("Accepted invalid QR"); }
        catch (IllegalArgumentException expected) { check(!expected.getMessage().contains("A7A7")); }
    }
    public static void main(String[] args) throws Exception {
        String ble = "GSB1:123456ABCDEF:000.000.000.000:" + "A7".repeat(32);
        check(ble.length()==98 && KnobQrPayload.parse(ble).host.equals("Bluetooth"));
        for(String bad:new String[]{ble+"\n",ble.toLowerCase(),ble.replace("000.000.000.000","0.0.0.0"),ble.replace("000.000.000.000","192.168.001.001")}) invalid(bad);
        KnobQrPayload p = KnobQrPayload.parse(QR);
        check(p.device.equals("wisecoco-123456abcdef") && p.host.equals("192.168.1.80"));
        check(KnobQrPayload.parse(QR.replace("192.168.1.80", "192.168.123.234")).host.equals("192.168.123.234"));
        for (String bad : new String[]{"",QR+"\n",QR+" "," "+QR,QR.toLowerCase(),QR.replace("GSK1", "GSK2"),QR+":extra",
            "https://example.invalid/"+QR,QR.replace("ABCDEF","ABCDEG"),QR.substring(0,QR.length()-1),QR.replace("A7A7","A7\u0000A7"),
            QR.replace("192.168.1.80","0.0.0.0"),QR.replace("192.168.1.80","127.0.0.1"),QR.replace("192.168.1.80","224.1.2.3"),
            QR.replace("192.168.1.80","192.168.001.80"),QR.replace("192.168.1.80","192.168.1.256"),QR.replace("192.168.1.80","host.local")}) invalid(bad);
        invalid(null);
        invalid(QR.replace("A7".repeat(32),"0".repeat(64)));
        KnobQrSession session = new KnobQrSession();
        long first = session.begin("origin","key"); check(session.valid(first,true,"origin","key"));
        check(!session.valid(first,false,"origin","key")); check(!session.valid(first,true,"other","key"));
        check(!session.valid(first,true,"origin","different")); session.cancel(); check(!session.valid(first,true,"origin","key"));
        long second = session.begin("origin","key"); check(!session.valid(first,true,"origin","key"));
        check(session.valid(second,true,"origin","key")); session.cancel();
        // Real QR encode -> pixels -> detector/decoder, not a mocked decode result.
        for (String text : new String[]{QR,QR.replace("192.168.1.80","192.168.123.234"),ble}) {
            BitMatrix bits = new QRCodeWriter().encode(text, BarcodeFormat.QR_CODE, 0, 0, Map.of(EncodeHintType.MARGIN,4));
            for (int scale : new int[]{3,4,6}) for (int rotation=0; rotation<4; rotation++) {
                int n=bits.getWidth()*scale; int[] pixels=new int[n*n];
                for(int y=0;y<n;y++)for(int x=0;x<n;x++){
                    int sx=x,sy=y;
                    for(int r=0;r<rotation;r++){int old=sx;sx=n-1-sy;sy=old;}
                    // Grey rather than ideal pure black/white, like an LCD/camera exposure.
                    pixels[y*n+x]=bits.get(sx/scale,sy/scale)?0xff202020:0xffdddddd;
                }
                String decoded = KnobQrDecoder.decode(new RGBLuminanceSource(n,n,pixels));
                check(decoded.equals(text)); KnobQrPayload.parse(decoded);
                for(int i=0;i<pixels.length;i++)pixels[i]^=0x00ffffff;
                check(text.equals(KnobQrDecoder.decode(new RGBLuminanceSource(n,n,pixels)))); Arrays.fill(pixels,0);
            }
        }
        // Synthetic knob-like 466x466 round display: 4 px modules at (108,104), quiet zone intact.
        BitMatrix small = new QRCodeWriter().encode(QR,BarcodeFormat.QR_CODE,0,0,Map.of(EncodeHintType.MARGIN,4));
        int[] round = new int[466*466];
        for(int y=0;y<466;y++)for(int x=0;x<466;x++) {
            int color=(x-233)*(x-233)+(y-233)*(y-233)>233*233?0xff888888:0xff000000;
            int sx=(x-108),sy=(y-104);
            if(sx>=0 && sy>=0 && sx<small.getWidth()*4 && sy<small.getHeight()*4) color=small.get(sx/4,sy/4)?0xff000000:0xffffffff;
            round[y*466+x]=color;
        }
        String scan = KnobQrDecoder.decode(new RGBLuminanceSource(466,466,round));
        check(QR.equals(scan));for(int i=0;i<round.length;i++)round[i]^=0x00ffffff;
        check(QR.equals(KnobQrDecoder.decode(new RGBLuminanceSource(466,466,round))));Arrays.fill(round,0);
        System.out.println("QR parsing, lifecycle generations and 50 real image-decode cases passed (mock keys only)");
    }
}
