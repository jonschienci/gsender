package com.gsender.validation;

import dalvik.system.DexFile;
import dalvik.system.DexClassLoader;
import android.hardware.usb.UsbDevice;
import android.webkit.JavascriptInterface;
import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.util.*;

// Isolated adb/app_process check of the actual optimized APK. No USB I/O.
public final class ReleaseProbe {
    public static void main(String[] args) throws Exception {
        ClassLoader loader = new DexClassLoader(args[0], args[1], null, ReleaseProbe.class.getClassLoader());
        Class<?> runtime = Class.forName("com.gsender.android.NativeRuntime", false, loader);
        if (!Modifier.isNative(runtime.getDeclaredMethod("start", String.class).getModifiers()))
            throw new AssertionError("JNI start missing");
        runtime.getDeclaredMethod("deliver", String.class);
        runtime.getDeclaredMethod("onNodeMessage", String.class);
        Set<String> bridges = new HashSet<>();
        int drivers = 0;
        DexFile dex = new DexFile(args[0]);
        try {
            for (Enumeration<String> names = dex.entries(); names.hasMoreElements();) {
                Class<?> type = Class.forName(names.nextElement(), false, loader);
                for (Method method : type.getDeclaredMethods()) {
                    if (method.isAnnotationPresent(JavascriptInterface.class)) bridges.add(method.getName());
                    if (method.getName().equals("getSupportedDevices") && Modifier.isStatic(method.getModifiers())) {
                        type.getConstructor(UsbDevice.class);
                        if (!(method.invoke(null) instanceof Map)) throw new AssertionError("Driver probing failed");
                        drivers++;
                    }
                }
            }
        } finally { dex.close(); }
        if (!bridges.contains("jogPress") || !bridges.contains("save")) throw new AssertionError("WebView bridge removed: " + bridges);
        if (drivers < 5) throw new AssertionError("USB driver constructors/methods missing: " + drivers);
        System.out.println("RELEASE_PROBE_PASS drivers=" + drivers + " bridges=" + bridges + " JNI=preserved");
    }
}
