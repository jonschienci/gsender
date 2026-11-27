package com.gsender.android;

public final class RendererRecoveryTest {
    private static void check(boolean value, String message) {
        if (!value) throw new AssertionError(message);
    }
    public static void main(String[] args) {
        RendererRecovery recovery = new RendererRecovery();
        check(recovery.failed(0), "First failure should recover");
        check(recovery.failed(10_000), "Second failure should recover");
        check(!recovery.failed(20_000) && recovery.blocked(), "Crash loop must stop automatic recovery");
        recovery.retry();
        check(!recovery.blocked() && recovery.failed(21_000), "Explicit retry must clear the crash loop");
        check(recovery.failed(82_000), "Old failure should expire");
        check(recovery.failed(83_000), "Only two failures remain in the window");
        check(!recovery.failed(84_000), "Three recent failures must block again");
    }
}
