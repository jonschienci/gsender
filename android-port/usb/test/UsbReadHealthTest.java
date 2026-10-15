import com.gsender.usb.UsbReadHealth;
import java.io.IOException;
import java.io.InterruptedIOException;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

public final class UsbReadHealthTest {
    private static int checks;
    private static void check(boolean condition, String message) {
        checks++; if (!condition) throw new AssertionError(message);
    }
    private static void fails(UsbReadHealth.Probe probe, UsbReadHealth.Current current,
                              UsbReadHealth.Pause pause, String expected) throws Exception {
        try { UsbReadHealth.check(probe, current, pause, "USB get_status request failed"); throw new AssertionError("accepted invalid health"); }
        catch (IOException e) { check(e.getMessage().contains(expected), e.toString()); }
    }
    public static void main(String[] args) throws Exception {
        List<Integer> waits = new ArrayList<>(); AtomicInteger calls = new AtomicInteger();
        int attempts = UsbReadHealth.check((bytes, timeout) -> { calls.incrementAndGet(); bytes[0]=1; check(timeout==200,"timeout changed"); return 2; }, ()->true, waits::add, "failed");
        check(attempts==1 && calls.get()==1 && waits.isEmpty(),"healthy read was delayed");
        calls.set(0);
        attempts=UsbReadHealth.check((bytes,timeout)->calls.incrementAndGet()==1 ? -1 : 2, ()->true, waits::add, "failed");
        check(attempts==2 && calls.get()==2 && waits.equals(List.of(5)),"captured transient failure did not recover once");
        calls.set(0); waits.clear();
        attempts=UsbReadHealth.check((bytes,timeout)->calls.incrementAndGet()<3 ? -1 : 2, ()->true, waits::add,"failed");
        check(attempts==3 && waits.equals(List.of(5,10)),"retry budget changed");
        calls.set(0); waits.clear();
        fails((bytes,timeout)->{calls.incrementAndGet();return -1;},()->true,waits::add,"three");
        check(calls.get()==3 && waits.equals(List.of(5,10)),"persistent failure retried without a bound");
        for(int length:new int[]{0,1,3}) fails((bytes,timeout)->length,()->true,ms-> {},"three");
        fails((bytes,timeout)->{bytes[1]=1;return 2;},()->true,ms->{},"three");
        fails((bytes,timeout)->{bytes[0]=4;return 2;},()->true,ms->{},"three");
        for(int valid=0;valid<4;valid++) {final int value=valid;check(UsbReadHealth.check((bytes,timeout)->{bytes[0]=(byte)value;return 2;},()->true,ms->{},"failed")==1,"valid USB2 status rejected");}
        calls.set(0); fails((bytes,timeout)->{calls.incrementAndGet();return 2;},()->false,ms->{},"closed");
        check(calls.get()==0,"closed handle was accessed");
        AtomicBoolean current=new AtomicBoolean(true);calls.set(0);
        fails((bytes,timeout)->{calls.incrementAndGet();return -1;},current::get,ms->current.set(false),"closed");
        check(calls.get()==1,"replacement handle was probed by stale read");
        current.set(true); calls.set(0);
        fails((bytes,timeout)->{calls.incrementAndGet();current.set(false);return 2;},current::get,ms->{},"closed");
        check(calls.get()==1,"close during successful transfer was ignored");
        calls.set(0);
        try { UsbReadHealth.check((bytes,timeout)->{calls.incrementAndGet();return -1;},()->true,ms->{throw new InterruptedException();},"failed"); throw new AssertionError("interrupt ignored"); }
        catch(InterruptedIOException expected) {check(calls.get()==1 && Thread.currentThread().isInterrupted(),"interrupt retried or lost");}
        finally {Thread.interrupted();}
        System.out.println("USB read-health: "+checks+" checks passed; only read-only status probes can be repeated.");
    }
}
