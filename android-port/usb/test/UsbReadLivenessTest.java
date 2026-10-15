import com.gsender.usb.UsbReadLiveness;
import com.gsender.usb.UsbReadHealth;
import java.io.IOException;
import java.io.InterruptedIOException;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

public final class UsbReadLivenessTest {
    private static int assertions;
    private static void check(boolean value, String message) {
        assertions++; if (!value) throw new AssertionError(message);
    }
    public static void main(String[] args) throws Exception {
        AtomicInteger probes = new AtomicInteger(), pauses = new AtomicInteger();
        UsbReadHealth.Pause pause = ms -> { check(ms == 1, "Empty-read yield must be bounded"); pauses.incrementAndGet(); };
        UsbReadLiveness live = new UsbReadLiveness(0);
        // Build 75 failed on three rejected USB control requests only 42 ms after
        // a valid serial reply. Those control requests must not be sent at all.
        live.received(34000);
        live.emptyRead(34042, () -> true, pause, () -> { probes.incrementAndGet(); throw new IOException("GET_STATUS failed"); });
        check(probes.get() == 0, "Recently active real job was probed and torn down");
        // Continued acknowledgements and intervening ZLPs remain healthy indefinitely.
        for (int ms = 34100; ms < 120000; ms += 100) {
            live.emptyRead(ms, () -> true, pause, () -> { throw new IOException("Unexpected control probe during streaming"); });
            live.received(ms + 1);
        }
        check(probes.get() == 0, "Streaming unexpectedly needed device-control checks");
        live = new UsbReadLiveness(0);
        live.emptyRead(2999, () -> true, pause, probes::incrementAndGet);
        check(probes.get() == 0, "Quiet grace interval ended early");
        live.emptyRead(3000, () -> true, pause, probes::incrementAndGet);
        check(probes.get() == 1, "A silent stream was never validated");
        live.emptyRead(3999, () -> true, pause, probes::incrementAndGet);
        check(probes.get() == 1, "Repeated ZLPs flood endpoint zero");
        live.emptyRead(4000, () -> true, pause, probes::incrementAndGet);
        check(probes.get() == 2, "Silent stream probe cadence changed");
        // Real persistent failures still stop: only read-only checks can be retried.
        try {
            live.emptyRead(5000, () -> true, pause, () -> UsbReadHealth.check((bytes, timeout) -> -1, () -> true, ms -> {}, "Quiet stream unhealthy"));
            throw new AssertionError("Persistent failure ignored");
        } catch (IOException expected) { check(expected.getMessage().contains("three"), "Bounded failure lost"); }
        // A closed or replaced connection never gains the traffic grace interval.
        try { live.emptyRead(5001, () -> false, pause, probes::incrementAndGet); throw new AssertionError("Closed handle accepted"); }
        catch (IOException expected) { check(expected.getMessage().contains("closed"), "Close was masked"); }
        AtomicBoolean current = new AtomicBoolean(true);
        try { live.emptyRead(5002, current::get, ms -> current.set(false), probes::incrementAndGet); throw new AssertionError("Close during empty read ignored"); }
        catch (IOException expected) { check(expected.getMessage().contains("closed"), "Close while yielding was masked"); }
        try { live.emptyRead(5003, () -> true, ms -> { throw new InterruptedException(); }, probes::incrementAndGet); throw new AssertionError("Interrupt ignored"); }
        catch (InterruptedIOException expected) { check(Thread.currentThread().isInterrupted(), "Interrupted flag lost"); }
        finally { Thread.interrupted(); }
        live.received(10000);
        check(live.dataAge(10042) == 42, "Data age is not measured from the last received bytes");
        System.out.println("USB read liveness: " + assertions + " assertions passed; active-job ZLP regression and fatal quiet-stream failures covered.");
    }
}
