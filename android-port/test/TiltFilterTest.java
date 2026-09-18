package com.gsender.android;
public final class TiltFilterTest {
    static void check(boolean value) { if (!value) throw new AssertionError(); }
    static void close(double a,double b) { check(Math.abs(a-b)<1e-6); }
    public static void main(String[] args) {
        TiltFilter f=new TiltFilter();
        f.update(0,0,9.81,1000000000L,0,false);check(f.valid);close(f.x,0);close(f.z,9.81);
        f.update(-3,0,9.3,1020000000L,0,false);check(f.x<0&&f.x>-3);long seq=f.sequence;
        f.update(5,0,9,1010000000L,0,false);check(f.sequence==seq);
        f.reset();f.update(-3,0,9.3,2000000000L,0,true);close(f.x,-3);
        f.update(0,3,9.3,2020000000L,1,true);close(f.x,-3);close(f.y,0);
        f.update(3,0,9.3,2040000000L,2,true);close(f.x,-3);close(f.y,0);
        f.update(0,-3,9.3,2060000000L,3,true);close(f.x,-3);close(f.y,0);
        f.update(0,0,0,2080000000L,3,false);check(!f.valid);
        f.update(0,0,9.81,2100000000L,3,false);check(f.valid);close(f.z,9.81);
        f.update(Double.NaN,0,9.81,2120000000L,3,false);check(!f.valid);close(f.x,0);
        f.update(0,0,9.81,2140000000L,3,false);check(f.valid);close(f.x,0);
        f.reset();check(!f.valid);check(f.timestamp==0);
    }
}
