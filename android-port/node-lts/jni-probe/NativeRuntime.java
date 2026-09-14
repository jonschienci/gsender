package com.gsender.android;
public final class NativeRuntime {
  public native int start(String entry);
  private native boolean deliver(String text);
  public void onNodeMessage(String text) {
    if (!deliver(text)) throw new IllegalStateException("Native queue rejected message");
  }
  public static void main(String[] args) {
    System.load(args[0] + "/libc++_shared.so");
    System.load(args[0] + "/libnode.so");
    System.load(args[0] + "/libgsender_bridge.so");
    System.exit(new NativeRuntime().start(args[1]));
  }
}
