const {test}=require('node:test');
const {execFileSync}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
test('ambiguous USB read health is bounded, validates replies, and cancels on close or interrupt',t=>{
    if(!process.env.JAVA_HOME){t.skip('Set JAVA_HOME to the build JDK');return;}
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gsender-usb-health-'));
    try {
        execFileSync(path.join(process.env.JAVA_HOME,'bin/javac'),['-d',dir,path.resolve(__dirname,'../src/main/java/com/gsender/usb/UsbReadHealth.java'),path.join(__dirname,'UsbReadHealthTest.java')]);
        execFileSync(path.join(process.env.JAVA_HOME,'bin/java'),['-cp',dir,'UsbReadHealthTest'],{stdio:'pipe'});
    } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
