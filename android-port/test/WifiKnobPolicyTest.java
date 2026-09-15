package com.gsender.android;
public final class WifiKnobPolicyTest {
    static void check(boolean value) { if (!value) throw new AssertionError(); }
    public static void main(String[] args) {
        WifiKnobPolicy p = new WifiKnobPolicy();
        check(!p.start(1, null, true)); check(!p.start(1,"wifi1",false));
        check(p.start(1,"wifi1",true)); check(!p.needsLock()); check(!p.start(2,"wifi2",true));
        check(!p.connected(2)); check(p.connected(1)); check(p.needsLock()); check(!p.connected(1));
        check(p.valid("wifi1",true)); check(!p.valid("wifi2",true)); check(!p.valid("wifi1",false));
        check(p.stop()==1); check(!p.needsLock()); check(!p.valid("wifi1",true)); check(!p.connected(1));
        check(p.start(2,"wifi2",true)); check(!p.connected(1)); check(p.stop()==2); check(p.stop()==0);
        byte[] ip={(byte)192,(byte)168,1,10};
        check(WifiKnobPolicy.onSubnet("192.168.1.80",ip,24));
        for(String host:new String[]{"192.168.1.10","192.168.1.0","192.168.1.255","192.168.2.80","host.local","127.0.0.1","192.168.1.080"})
            check(!WifiKnobPolicy.onSubnet(host,ip,24));
        check(!WifiKnobPolicy.onSubnet("192.168.1.80",new byte[16],64));
    }
}
