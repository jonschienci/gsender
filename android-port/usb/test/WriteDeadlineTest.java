import com.gsender.usb.WriteDeadline;
public class WriteDeadlineTest {
    public static void main(String[] args) throws Exception {
        if (WriteDeadline.remaining(0,0,9000)!=5000) throw new AssertionError("normal write changed");
        if (WriteDeadline.remaining(250,100,100)!=250) throw new AssertionError("initial budget");
        if (WriteDeadline.remaining(250,100,349)!=1) throw new AssertionError("remaining budget");
        for (long now : new long[]{99,350,5100}) {
            boolean wrote=false, rejected=false;
            try { WriteDeadline.remaining(250,100,now); wrote=true; }
            catch (java.net.SocketTimeoutException expected) { rejected=true; }
            if (wrote || !rejected) throw new AssertionError("expired request transmitted");
        }
        boolean invalid=false;
        try { WriteDeadline.remaining(5000,0,0); } catch (IllegalArgumentException expected) {invalid=true;}
        if(!invalid) throw new AssertionError("invalid budget");
        System.out.println("Native write deadline: all checks passed; no USB hardware used.");
    }
}
