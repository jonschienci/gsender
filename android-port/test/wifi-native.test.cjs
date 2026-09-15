const {test}=require('node:test');
const {execFileSync}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
test('native Wi-Fi lease: foreground, current network, single owner, lock lifecycle and subnet boundaries',t=>{
    if(!process.env.JAVA_HOME){t.skip('Set JAVA_HOME to build JDK');return;}
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gsender-wifi-native-'));
    try{
        execFileSync(path.join(process.env.JAVA_HOME,'bin/javac'),['-d',dir,
            path.resolve(__dirname,'../app/src/main/java/com/gsender/android/WifiKnobPolicy.java'),path.join(__dirname,'WifiKnobPolicyTest.java')]);
        execFileSync(path.join(process.env.JAVA_HOME,'bin/java'),['-cp',dir,'com.gsender.android.WifiKnobPolicyTest']);
    }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
