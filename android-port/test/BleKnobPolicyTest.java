package com.gsender.android;
public class BleKnobPolicyTest {
 private static void check(boolean value){if(!value)throw new AssertionError("BLE policy");}
 public static void main(String[] args){
  check(BleKnobPolicy.identity("wisecoco-a1b2c3d4e5f6"));check(!BleKnobPolicy.identity("GS-Knob-A1B2C3D4E5F6"));
  check(!BleKnobPolicy.identity(null));check(!BleKnobPolicy.identity("wisecoco-a1b2c3d4e5f6\n"));
  check(BleKnobPolicy.address("wisecoco-a1b2c3d4e5f6").equals("A1:B2:C3:D4:E5:F8"));
  check(BleKnobPolicy.address("wisecoco-1020304050ff").equals("10:20:30:40:50:01"));
  for(String bad:new String[]{null,"wisecoco-a1b2c3d4e5f6\n","wisecoco-A1B2C3D4E5F6","https://example.invalid"}){
   try{BleKnobPolicy.address(bad);throw new AssertionError("Invalid identity accepted");}catch(IllegalArgumentException expected){}
  }
  BleKnobPolicy p=new BleKnobPolicy();
  check(!p.begin(1,0,0,0));check(!p.begin(1,214,0,0));check(!p.begin(1,33,0,50));check(!p.begin(1,33,1,0));
  check(p.begin(1,213,0,49));check(!p.begin(2,33,49,49));check(p.complete(99));check(!p.complete(99));
  check(p.begin(2,33,100,100));check(!p.complete(200));check(!p.begin(3,33,200,200));
 }
}
