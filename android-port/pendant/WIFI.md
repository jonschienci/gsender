# Build 25 candidate: Wi-Fi knob fallback

Based on Android Build 24, commit `f27a99367ecd09a8df81596ab350be9b07d2eadd`. This candidate changes the knob connection only. The CNC stays on its existing direct USB connection. The tablet and knob stay on the existing LAN; the ESP joins its 2.4 GHz Wi-Fi. No access point, Bluetooth, network switching, process binding, or remote gSender server is added.

## Setup and operation

1. Provision the matching ESP firmware over physical USB using the companion HID Knob project's `tools/provision_knob_wifi.py`. Keep its pairing JSON private.
2. Open the existing knob dialog in gSender. USB is selected by default. Disconnect the knob before changing transport.
3. Choose **Wi-Fi fallback**, paste the pairing JSON, and select **Use pairing**. An optional IPv4 override supports an address changed by DHCP. The address must be on the tablet's current Wi-Fi subnet. VPN routes and non-Wi-Fi default networks are refused. Router client isolation can still prevent a connection.
4. Select **Test Wi-Fi link (10 s)** before a live session. This opens one authenticated connection, sends only `STATE valid=0 armed=0`, measures fresh echoed-ticket round trips, and disconnects. It never attaches the CNC controller observer or issues CNC commands. The reported median, p95, maximum, late count, and repeated count include ESP telemetry scheduling; they are not physical detent-to-motion latency or a safety certification.
5. Select **Connect knob**, then explicitly arm when the ordinary CNC and P2 readiness checks pass. Closing the app, losing foreground/network access, or losing the link ends the connection. Reconnect and arm manually. No USB/Wi-Fi failover or automatic armed recovery occurs.

Pairing is kept only in process memory. The password-style input is cleared after successful validation; status and error responses never return the PSK. No key is stored in preferences, localStorage, logs, or the APK. Restarting gSender requires pasting the pairing again. The system clipboard is outside this implementation and is not cleared automatically. **Forget pairing** clears the stored key buffer while disconnected.

## Transport contract

- Pairing JSON has exactly `version:1`, `device:"wisecoco-<12 lower-case hex MAC digits>"`, numeric IPv4 `host`, `port:58596`, and a 64-character lower-case hex `psk` (32 bytes).
- Outgoing Node TLS only: TLS 1.2, `PSK-AES128-GCM-SHA256`, device identity as the PSK identity. No certificate or cipher fallback, TLS renegotiation, discovery, maintenance/provisioning messages, or incoming network control API.
- Each connection has a new P2 session and starts disarmed. TLS uses `TCP_NODELAY`. One outgoing P2 STATE can be in flight; frame limit 256 bytes; a stalled write fails at 100 ms, including callbacks arriving after the deadline. Incoming callback work is bounded to 4096 bytes; P2 lines remain bounded to 256 bytes.
- STATE cadence is 40 ms in both Exact STEP and Adaptive. Wireless DETENT and WHEEL require an echoed ticket younger than 100 ms. Exact STEP queued events retain the ticket's 100 ms deadline.
- Wireless WHEEL expiry is capped at `ticketIssuedAt + 180ms - sourceAge`, and a repeat can only shorten the previous deadline. This subtracts a conservative bound on radio/transit delay. USB timing is unchanged.
- ALIVE and VCAP echoes must advance their ticket to refresh wireless liveness/capability. The heartbeat lease expires at 250 ms; a late arriving fresh reply cannot revive an expired lease before the next timer callback. Fresh not-ready echoes may continue for at most six seconds during startup; they never allow arming.
- Native Android observes the current Wi-Fi network and local address without changing routing. Network, DHCP address, or foreground loss revokes the lease. It requests `WIFI_MODE_FULL_LOW_LATENCY` on API 29+ while foreground and connected, with `WIFI_MODE_FULL_HIGH_PERF` on API 26–28. Actual radio support and scheduling are device-dependent.
- The existing finite STEP, Adaptive feed/axis limits, ownership, controller stop/cancel behavior, UI heartbeat, and CNC USB write deadlines remain in effect. The local gSender server remains authenticated and bound to 127.0.0.1.

## Validation and limits

The candidate passed 121 automated tests on the final Build 25 payload, including a real loopback TLS-PSK peer driving the packaged gSender backend and a simulated USB CNC. Coverage includes incorrect credentials/ciphers, old sessions, duplicate/stale input, source-age expiry, write stalls, cancellation, connection ownership, network-loss notifications, private pairing responses, and the disarmed probe. The existing USB and Adaptive regressions passed. Pure Java policy tests cover lease ownership, foreground/network invalidation, and subnet restrictions. Android release Java compilation and lint passed; both frontend bundles built.

These are software checks on the development Mac, not hardware radio measurements. The native Wi-Fi lock and network callbacks have not been instrumented on a tablet, and the actual embedded Android Node TLS runtime has not been tested against the physical ESP. Router congestion, roaming, power management, process scheduling, and the complete physical machine remain unvalidated. The millisecond thresholds are rejection policies, not hard real-time delivery guarantees. The link test must not be interpreted as proving machine safety.

No tablet installation, ESP flash, or physical motion was performed while preparing this candidate. Keep Build 24 and the prior firmware available.
