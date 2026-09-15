# C++ resolves this exact class/method name; native callbacks are invisible to R8.
-keep class com.gsender.android.NativeRuntime { *; }
# WebView discovers annotated JavaScript bridge methods at runtime.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
# usb-serial-for-android probes drivers with reflection.
-keepclassmembers class * implements com.hoho.android.usbserial.driver.UsbSerialDriver {
    public <init>(android.hardware.usb.UsbDevice);
    public static java.util.Map getSupportedDevices();
}
