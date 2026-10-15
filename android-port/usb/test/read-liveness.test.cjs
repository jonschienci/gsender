const {test}=require('node:test');
const {execFileSync}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
test('active STM32 job survives empty USB completions while quiet-stream and closed-handle failures remain bounded',t=>{
    if(!process.env.JAVA_HOME){t.skip('Set JAVA_HOME to the build JDK');return;}
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gsender-usb-liveness-'));
    try {
        const src=path.resolve(__dirname,'../src/main/java/com/gsender/usb');
        execFileSync(path.join(process.env.JAVA_HOME,'bin/javac'),['-d',dir,path.join(src,'UsbReadHealth.java'),path.join(src,'UsbReadLiveness.java'),path.join(__dirname,'UsbReadLivenessTest.java')]);
        execFileSync(path.join(process.env.JAVA_HOME,'bin/java'),['-cp',dir,'UsbReadLivenessTest'],{stdio:'pipe'});
    } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
