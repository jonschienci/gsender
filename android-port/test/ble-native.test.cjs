'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{execFileSync}=require('node:child_process');
test('Java GATT single-write ownership and monotonic 50ms/100ms deadlines',t=>{
 if(!process.env.JAVA_HOME){t.skip('JAVA_HOME required');return;}
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gsender-ble-java-'));
 try{execFileSync(path.join(process.env.JAVA_HOME,'bin/javac'),['-d',dir,path.resolve(__dirname,'../app/src/main/java/com/gsender/android/BleKnobPolicy.java'),path.join(__dirname,'BleKnobPolicyTest.java')]);
 execFileSync(path.join(process.env.JAVA_HOME,'bin/java'),['-cp',dir,'com.gsender.android.BleKnobPolicyTest']);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('Bluetooth connection uses only its QR-derived address and declares no discovery/location access',()=>{
 const source=fs.readFileSync(path.resolve(__dirname,'../app/src/main/java/com/gsender/android/BleKnobNetwork.java'),'utf8');
 const manifest=fs.readFileSync(path.resolve(__dirname,'../app/src/main/AndroidManifest.xml'),'utf8');
 assert.match(source,/getRemoteDevice\(BleKnobPolicy\.address\(identity\)\)\.connectGatt/);
 assert.doesNotMatch(source,/LocationManager|ACCESS_\w+_LOCATION|BLUETOOTH_SCAN|startScan|getBluetoothLeScanner/);
 assert.doesNotMatch(manifest,/ACCESS_\w+_LOCATION|BLUETOOTH_SCAN|hardware\.location/);
 assert.match(manifest,/android\.permission\.BLUETOOTH_CONNECT/);
 assert.match(manifest,/android\.permission\.BLUETOOTH" android:maxSdkVersion="30"/);
});
