package com.gsender.handoff;

import android.content.*;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;
import android.os.Process;

/** Only the paired, certificate-pinned gSender may request a cooperative stop. */
public final class HandoffProvider extends ContentProvider {
    @Override public boolean onCreate() { Gate.register(getContext()); return true; }
    @Override public Bundle call(String method, String arg, Bundle extras) {
        try {
            Gate.requirePeer(getContext());
            if (!"stopForSwitch".equals(method)) throw new SecurityException("Unknown handoff method");
            Bundle result = new Bundle();
            if (!Gate.stopping && Gate.connected(getContext())) { result.putBoolean("busy", true); return result; }
            Gate.select(getContext(), false);
            result.putInt("pid", Process.myPid()); result.putIntArray("children", Gate.nodeChildren());
            if (!Gate.stopping) Gate.stopSelf(getContext());
            return result;
        } catch (SecurityException e) { throw e; }
        catch (Exception e) {
            Bundle result = new Bundle(); result.putBoolean("busy", true);
            result.putString("error", "Unable to confirm that the other gSender is disconnected"); return result;
        }
    }
    @Override public Cursor query(Uri u, String[] p, String s, String[] a, String o) { throw new SecurityException("Not supported"); }
    @Override public String getType(Uri u) { return null; }
    @Override public Uri insert(Uri u, ContentValues v) { throw new SecurityException("Not supported"); }
    @Override public int delete(Uri u, String s, String[] a) { throw new SecurityException("Not supported"); }
    @Override public int update(Uri u, ContentValues v, String s, String[] a) { throw new SecurityException("Not supported"); }
}
