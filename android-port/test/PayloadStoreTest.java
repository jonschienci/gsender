package com.gsender.android;
import java.io.*;
import java.nio.file.*;
import java.security.MessageDigest;
import java.util.zip.*;
public class PayloadStoreTest {
 static byte[] zip(String version, boolean bad) throws Exception {
  ByteArrayOutputStream b=new ByteArrayOutputStream();try(ZipOutputStream z=new ZipOutputStream(b)){
   for(String name:new String[]{"bootstrap.cjs","server.cjs","app/index.html","pendant/index.html"}){z.putNextEntry(new ZipEntry(name));z.write(version.getBytes());z.closeEntry();}
   if(bad){z.putNextEntry(new ZipEntry("../escaped"));z.write(1);z.closeEntry();}
  }return b.toByteArray();
 }
 static String hash(byte[] b)throws Exception{StringBuilder s=new StringBuilder();for(byte v:MessageDigest.getInstance("SHA-256").digest(b))s.append(String.format("%02x",v&255));return s.toString();}
 static void check(boolean b){if(!b)throw new AssertionError();}
 public static void main(String[] args)throws Exception{
  File root=Files.createTempDirectory("gsender-payload-test").toFile();PayloadStore store=new PayloadStore(root);
  byte[] one=zip("old",false),two=zip("new",false),bad=zip("bad",true);
  File live=store.prepare(hash(one),()->new ByteArrayInputStream(one));
  check(Files.readString(new File(live,"server.cjs").toPath()).equals("old"));
  try{store.prepare(hash(two),()->new ByteArrayInputStream(one));throw new AssertionError();}catch(IOException expected){}
  check(Files.readString(new File(live,"server.cjs").toPath()).equals("old"));
  try{store.prepare(hash(bad),()->new ByteArrayInputStream(bad));throw new AssertionError();}catch(IOException expected){}
  check(!new File(root,"escaped").exists());check(live.isDirectory());
  store.prepare(hash(two),()->new ByteArrayInputStream(two));check(new File(root,"runtime.previous").isDirectory());
  store.prepare(hash(two),()->{throw new IOException("Must not reopen unchanged archive");});check(!new File(root,"runtime.previous").exists());
  check(live.renameTo(new File(root,"runtime.previous")));
  store.prepare(hash(two),()->{throw new IOException("Recovered installed payload");});check(live.isDirectory());
  System.out.println("PASS: first install, unchanged launch, checksum failure, zip traversal, update and interrupted-swap recovery");
 }
}
