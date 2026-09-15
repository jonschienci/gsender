'use strict';
const replace = (source, from, to) => {
    if (source.split(from).length !== 2) throw new Error('Connection UI transform no longer matches upstream');
    return source.replace(from, to);
};
exports.transform = (code, id) => {
    if (id.endsWith('/pendant/src/components/ConnectionWidget.tsx')) {
        code = replace(code, '// Local 4-state machine', `const boardConnected = useTypedSelector((s: RootState) => s.connection.isConnected);
    const boardPort = useTypedSelector((s: RootState) => s.connection.port);
    // Local 4-state machine`);
        code = replace(code, '// Respond to external reconnect requests.', `// Auto-open and a UI loaded after connection do not call handleConnect.
    // Follow the same Redux connection state as the rest of the pendant.
    useEffect(() => {
        if (boardPort && !boardConnected) return; // Firmware is still initializing.
        if (connectTimeoutRef.current) clearTimeout(connectTimeoutRef.current);
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        startRef.current = 0;
        pressStartRef.current = 0;
        setHolding(false);
        setProgress(0);
        setSheetOpen(false);
        setInfoOpen(false);
        const connected = boardConnected && !!boardPort;
        activePortRef.current = connected ? boardPort : "";
        setActivePort(activePortRef.current);
        connectionStateRef.current = connected ? ConnectionState.CONNECTED : ConnectionState.DISCONNECTED;
        setConnectionState(connectionStateRef.current);
        setConnectionType(connected ? (isIPv4(boardPort) ? ConnectionType.ETHERNET : ConnectionType.USB) : ConnectionType.DISCONNECTED);
    }, [boardConnected, boardPort]);

    // Respond to external reconnect requests.`);
        code = replace(code, 'const portVal = connectionConfig.get("port", null);', 'const portVal = connectionConfig.get("port", null);\n            if (!force && String(portVal).startsWith("android-usb:")) return;');
    } else if (id.endsWith('/app/src/features/Connection/index.tsx')) {
        code = replace(code, 'const port = connectionConfig.get("port", null);', 'const port = connectionConfig.get("port", null);\n        if (!force && String(port).startsWith("android-usb:")) return;');
    } else return null;
    return { code, map: null };
};
