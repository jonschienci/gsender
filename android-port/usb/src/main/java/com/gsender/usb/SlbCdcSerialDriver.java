package com.gsender.usb;

import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbDeviceConnection;
import com.hoho.android.usbserial.driver.CdcAcmSerialDriver;
import com.hoho.android.usbserial.driver.UsbSerialPort;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

/** STM32 SLB CDC empty-read compatibility; all data transfers remain in the pinned upstream driver. */
final class SlbCdcSerialDriver extends CdcAcmSerialDriver {
    interface Reporter { void record(String message); }
    private final List<UsbSerialPort> ports = new ArrayList<>();
    private final Reporter report;

    SlbCdcSerialDriver(UsbDevice device, Reporter report) {
        super(device);
        this.report = report;
        for (UsbSerialPort port : super.getPorts()) ports.add(new SlbPort(device, port.getPortNumber()));
    }

    @Override public List<UsbSerialPort> getPorts() { return ports; }

    private final class SlbPort extends CdcAcmSerialPort {
        private volatile boolean closing = true;
        private long lastRecoveryLog;
        private int recovered;
        private long lastEmptyLog;
        private int emptyReads;
        private UsbReadLiveness liveness;
        SlbPort(UsbDevice device, int number) { super(device, number); }

        @Override public void open(UsbDeviceConnection connection) throws IOException {
            closing = false;
            liveness = new UsbReadLiveness(android.os.SystemClock.elapsedRealtime());
            super.open(connection);
        }

        @Override public int read(byte[] destination, int length, int timeout) throws IOException {
            int count = super.read(destination, length, timeout);
            if (closing || !isOpen()) throw new IOException("Connection closed");
            if (count > 0) liveness.received(android.os.SystemClock.elapsedRealtime());
            return count;
        }

        @Override public void close() throws IOException {
            closing = true;
            super.close();
        }

        @Override protected void testConnection(boolean full, String message) throws IOException {
            if (closing) throw new IOException("Connection closed");
            // Write failures use their own message: retain their original fatal/partial-write handling.
            if (!full || !"USB get_status request failed".equals(message)) {
                super.testConnection(full, message);
                return;
            }
            final UsbDeviceConnection connection = mConnection;
            final long now = android.os.SystemClock.elapsedRealtime();
            liveness.emptyRead(now,
                () -> !closing && connection != null && mConnection == connection && isOpen(),
                Thread::sleep, () -> checkQuietStream(connection));
            emptyReads++;
            if (lastEmptyLog == 0 || now - lastEmptyLog >= 10000) {
                report.record("SLB empty USB read tolerated; count=" + emptyReads + "; lastDataMs=" + liveness.dataAge(now));
                lastEmptyLog = now;
            }
        }

        private void checkQuietStream(UsbDeviceConnection connection) throws IOException {
            int attempts = UsbReadHealth.check(
                (bytes, timeout) -> connection.controlTransfer(0x80, 0, 0, 0, bytes, bytes.length, timeout),
                () -> !closing && connection != null && mConnection == connection && isOpen(),
                Thread::sleep, "USB read stream quiet; get_status request failed");
            if (attempts > 1) {
                recovered++;
                long now = android.os.SystemClock.elapsedRealtime();
                if (lastRecoveryLog == 0 || now - lastRecoveryLog >= 10000) {
                    report.record("SLB USB read health recovered after " + attempts + " checks; recovered=" + recovered);
                    lastRecoveryLog = now;
                }
            }
        }
    }
}
