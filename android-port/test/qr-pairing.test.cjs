'use strict';
const {test}=require('node:test'), assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {decodeQr,ScanLease}=require('../pendant/qr-pairing.cjs');
const {Pendant}=require('../pendant/service.cjs');
const {pairing}=require('../pendant/wifi-transport.cjs');
const QR='GSK1:123456ABCDEF:192.168.1.80:'+'A7'.repeat(32);
test('GSK1 exact parser converts synthetic QR into existing Wi-Fi JSON; never accepts URLs',()=>{
    assert.deepEqual(decodeQr(QR),{version:1,device:'wisecoco-123456abcdef',host:'192.168.1.80',port:58596,psk:'a7'.repeat(32)});
    assert.throws(()=>pairing(JSON.stringify({...decodeQr(QR),psk:'0'.repeat(64)})));
    for(const text of [null,'',QR+'\n',QR+' ',QR.toLowerCase(),' '+QR,QR+':extra','https://example.invalid/'+QR, QR.replace('A7'.repeat(32),'0'.repeat(64)),
        QR.replace('GSK1','GSK2'),QR.replace('192.168.1.80','0.0.0.0'),QR.replace('192.168.1.80','127.0.0.1'),
        QR.replace('192.168.1.80','224.0.0.1'),QR.replace('192.168.1.80','192.168.01.80'),QR.replace('192.168.1.80','192.168.1.256')])
        assert.throws(()=>decodeQr(text),e=>!e.message.includes('A7A7'));
});
test('single-use scan lease expires, ignores wrong cancels and rejects stale generations',()=>{
    let now=0;const lease=new ScanLease(()=>now);const a=lease.begin(1);lease.check(a,1);assert.throws(()=>lease.begin(1));
    assert.throws(()=>lease.check(a,2));lease.cancel('wrong');lease.check(a,1);now=90000;assert.throws(()=>lease.check(a,1));
    const b=lease.begin(2);assert.notEqual(a,b);assert.throws(()=>lease.check(a,2));lease.cancel(b);assert.equal(lease.active(),false);
});
function fixture(){let now=0;const s=new Pendant({now:()=>now,SerialPort:{list(){throw Error('No USB during pairing');}},
    getControllers(){throw Error('No CNC access during pairing');}});s.setTransport('wifi');return {s,time:n=>now=n};}
test('native scan consumes reservation, saves private pairing and requests automatic connection',()=>{
    const {s}=fixture();const token=s.beginScan();s.checkScan(token);assert.equal(s.status().pairingConfigured,false);
    s.commitScan(token,QR);assert.equal(s.status().pairedDevice,'wisecoco-123456abcdef');assert.equal(s.status().wifiHost,'192.168.1.80');
    assert.equal(s.armed,false);assert.equal(s.port,null);assert.equal(s.connecting,false);assert.equal(s.reconnectWanted,true);assert.equal(s.scan.active(),false);
    assert.throws(()=>s.commitScan(token,QR));assert.equal(JSON.stringify(s.status()).includes('a7a7'),false);
});
test('connected/connecting/armed/probe modes forbid camera reservation; scan selects Bluetooth',()=>{
    for(const field of ['port','connecting','armed','probing']){const {s}=fixture();s[field]=true;assert.throws(()=>s.beginScan());}
    const {s}=fixture();s.setTransport('usb');const token=s.beginScan();s.checkScan(token);assert.equal(s.transport,'ble');
});
test('connection and arm cannot start during scan; background/session/connection/pairing changes invalidate it',async()=>{
    const {s}=fixture();let token=s.beginScan();await assert.rejects(s.connect(),/scanner/);assert.throws(()=>s.arm({}),/scanner/);
    s.ui({session:'a'.repeat(32),visible:false});assert.throws(()=>s.commitScan(token,QR));
    for(const change of [s=>s.disconnect(),s=>s.setTransport('usb'),s=>s.forgetPairing(),s=>s.setMode('adaptive')]){
        const {s}=fixture();token=s.beginScan();change(s);assert.throws(()=>s.commitScan(token,QR));
    }
    const f=fixture();token=f.s.beginScan();f.time(90000);assert.throws(()=>f.s.commitScan(token,QR));
});
test('native parser, lifecycle generations, and QR encode/pixels/decode with mock secrets',t=>{
    if(!process.env.JAVA_HOME){t.skip('JAVA_HOME required');return;}
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gsender-qr-test-'));
    const jar=path.resolve(__dirname,'../app/libs/zxing-core-3.5.3.jar');
    try{
        execFileSync(path.join(process.env.JAVA_HOME,'bin/javac'),['-cp',jar,'-d',dir,
            ...['KnobQrPayload','KnobQrSession','KnobQrDecoder'].map(n=>path.resolve(__dirname,'../app/src/main/java/com/gsender/android/'+n+'.java')),path.join(__dirname,'KnobQrTest.java')]);
        execFileSync(path.join(process.env.JAVA_HOME,'bin/java'),['-cp',dir+path.delimiter+jar,'com.gsender.android.KnobQrTest']);
    }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('camera entry is explicit fixed first-party navigation; permission and background guards remain',()=>{
    const root=path.resolve(__dirname,'../app/src/main/java/com/gsender/android');
    const activity=fs.readFileSync(path.join(root,'MainActivity.java'),'utf8');
    const flow=fs.readFileSync(path.join(root,'KnobQrFlow.java'),'utf8');
    const camera=fs.readFileSync(path.join(root,'KnobQrCamera.java'),'utf8');
    assert.match(activity,/request\.isForMainFrame\(\) && request\.hasGesture\(\)/);
    assert.match(activity,/onPause\(\)[\s\S]*qr\.pause\(\)/);
    assert.match(activity,/onConfigurationChanged[\s\S]*qr\.cancel\(\)/);
    assert.match(flow,/checkSelfPermission\(Manifest\.permission\.CAMERA\)/);
    assert.match(flow,/setInstanceFollowRedirects\(false\)/);
    assert.match(flow,/FLAG_SECURE/);assert.match(camera,/camera\.release\(\)/);
    assert.doesNotMatch(flow+camera,/@JavascriptInterface|Log\.|ACTION_VIEW|ACTION_IMAGE_CAPTURE|FileOutputStream/);
    assert.doesNotMatch(activity,/onPermissionRequest/); // WebView camera stays ungranted.
});
