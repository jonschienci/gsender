const {test}=require('node:test'),{execFileSync}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
test('Android tilt filter handles flat, low-pass filtering, four screen rotations, stale events and shocks',t=>{
 if(!process.env.JAVA_HOME){t.skip('Set JAVA_HOME to the build JDK');return;}
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gsender-tilt-'));
 try{
  execFileSync(path.join(process.env.JAVA_HOME,'bin/javac'),['-d',dir,path.resolve(__dirname,'../app/src/main/java/com/gsender/android/TiltFilter.java'),path.join(__dirname,'TiltFilterTest.java')]);
  execFileSync(path.join(process.env.JAVA_HOME,'bin/java'),['-cp',dir,'com.gsender.android.TiltFilterTest']);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
