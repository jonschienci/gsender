const {test}=require('node:test');
const {execFileSync}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
test('Java worker deadline rejects delayed pendant writes before driver transmission', t=>{
    if(!process.env.JAVA_HOME){t.skip('Set JAVA_HOME to the build JDK');return;}
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gsender-deadline-'));
    try{
        execFileSync(path.join(process.env.JAVA_HOME,'bin/javac'),['-d',dir,
            path.resolve(__dirname,'../src/main/java/com/gsender/usb/WriteDeadline.java'),path.join(__dirname,'WriteDeadlineTest.java')]);
        execFileSync(path.join(process.env.JAVA_HOME,'bin/java'),['-cp',dir,'WriteDeadlineTest']);
    }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
