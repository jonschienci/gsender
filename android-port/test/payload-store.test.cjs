const {test}=require('node:test'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync}=require('node:child_process');
test('payload installation keeps the previous runtime through failed or interrupted updates',()=>{
 const classes=fs.mkdtempSync(path.join(os.tmpdir(),'gsender-payload-classes-'));
 const bin=process.env.JAVA_HOME?path.join(process.env.JAVA_HOME,'bin'):'';
 try {
  execFileSync(path.join(bin,'javac'),['-d',classes,path.join(__dirname,'../app/src/main/java/com/gsender/android/PayloadStore.java'),path.join(__dirname,'PayloadStoreTest.java')]);
  execFileSync(path.join(bin,'java'),['-cp',classes,'com.gsender.android.PayloadStoreTest']);
 } finally {fs.rmSync(classes,{recursive:true,force:true});}
});
