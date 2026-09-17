package com.gsender.android;

import android.Manifest;
import android.bluetooth.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.os.*;
import android.util.Base64;
import org.json.JSONObject;
import java.util.*;
import java.util.concurrent.atomic.*;
import java.util.function.Consumer;

/** Bounded foreground GATT transport. Keys and plaintext never enter this class. */
final class BleKnobNetwork implements AutoCloseable {
    static final UUID SERVICE=UUID.fromString("3c8f0001-6b27-4f91-8e42-7dd34b62a901");
    static final UUID RX=UUID.fromString("3c8f0002-6b27-4f91-8e42-7dd34b62a901");
    static final UUID TX=UUID.fromString("3c8f0003-6b27-4f91-8e42-7dd34b62a901");
    static final UUID CCCD=UUID.fromString("00002902-0000-1000-8000-00805f9b34fb");
    private final Context context;
    private final Consumer<String> output;
    private final HandlerThread thread=new HandlerThread("gsender-ble");
    private final Handler io;
    private Session current;
    private boolean closed, observing;
    private static final class Session {
        final long id;
        final BleKnobPolicy policy=new BleKnobPolicy();
        final AtomicInteger queued=new AtomicInteger();
        final AtomicBoolean overflow=new AtomicBoolean();
        BluetoothGatt gatt; BluetoothGattCharacteristic rx,tx;
        int stage,mtu; // connect=1, discover, MTU, CCCD, ready=5
        Session(long id){this.id=id;}
    }
    BleKnobNetwork(Context context,Consumer<String> output){this.context=context;this.output=output;thread.start();io=new Handler(thread.getLooper());}
    static String[] permissions(){return Build.VERSION.SDK_INT>=31
        ? new String[]{Manifest.permission.BLUETOOTH_CONNECT} : new String[0];}
    static boolean permitted(Context context){for(String p:permissions())if(context.checkSelfPermission(p)!=PackageManager.PERMISSION_GRANTED)return false;return true;}
    void accept(JSONObject request){
        final long at=SystemClock.uptimeMillis(),id=request.optLong("id"),write=request.optLong("write");
        final String op=request.optString("op"),device=request.optString("device"),data=request.optString("data");
        io.post(()->{
            if(closed){emit(id,"closed","BLE_LINK",0,null,0);return;}
            try{
                if(op.equals("start"))start(id,device);
                else if(current!=null && current.id==id){
                    if(op.equals("stop"))stop(current);
                    else if(op.equals("write"))write(current,write,data,at);
                }
            }catch(SecurityException e){fail(current,"BLE_PERMISSION");}
            catch(RuntimeException e){fail(current,"BLE_LINK");}
        });
    }
    private void start(long id,String identity){
        if(id<=0||!BleKnobPolicy.identity(identity)||current!=null){emit(id,"closed","BLE_LINK",0,null,0);return;}
        observing=true;foreground(EngineService.uiForeground);
        if(!EngineService.uiForeground){emit(id,"closed","BLE_FOREGROUND",0,null,0);return;}
        if(!permitted(context)){emit(id,"closed","BLE_PERMISSION",0,null,0);return;}
        BluetoothManager manager=context.getSystemService(BluetoothManager.class);
        BluetoothAdapter adapter=manager==null?null:manager.getAdapter();
        if(adapter==null||!adapter.isEnabled()){emit(id,"closed","BLE_DISABLED",0,null,0);return;}
        Session s=new Session(id);current=s;s.stage=1;
        // Known QR identity -> direct GATT connection. No discovery API, location
        // permission or Location-services dependency, including Android 8-11.
        try {
            s.gatt=adapter.getRemoteDevice(BleKnobPolicy.address(identity)).connectGatt(
                context,false,callbacks(s),BluetoothDevice.TRANSPORT_LE,BluetoothDevice.PHY_LE_1M_MASK,io);
        } catch(SecurityException e) { fail(s,"BLE_PERMISSION");return; }
        if(s.gatt==null){fail(s,"BLE_LINK");return;}
        io.postDelayed(()->{if(current==s&&s.stage!=5)fail(s,"BLE_LINK");},14000);
    }
    // Every callback task runs inside post(), which catches permission revocation.
    @android.annotation.SuppressLint("MissingPermission")
    private BluetoothGattCallback callbacks(Session s){return new BluetoothGattCallback(){
        @Override public void onConnectionStateChange(BluetoothGatt g,int status,int state){post(s,g,()->{
            if(status!=BluetoothGatt.GATT_SUCCESS||state!=BluetoothProfile.STATE_CONNECTED||s.stage!=1){fail(s,"BLE_LINK");return;}
            s.stage=2;g.requestConnectionPriority(BluetoothGatt.CONNECTION_PRIORITY_HIGH);
            if(!g.discoverServices())fail(s,"BLE_LINK");
        });}
        @Override public void onServicesDiscovered(BluetoothGatt g,int status){post(s,g,()->{
            BluetoothGattService service=g.getService(SERVICE);
            if(s.stage!=2||status!=BluetoothGatt.GATT_SUCCESS||service==null){fail(s,"BLE_LINK");return;}
            s.rx=service.getCharacteristic(RX);s.tx=service.getCharacteristic(TX);
            if(s.rx==null||s.tx==null||(s.rx.getProperties()&BluetoothGattCharacteristic.PROPERTY_WRITE)==0||
                (s.tx.getProperties()&BluetoothGattCharacteristic.PROPERTY_NOTIFY)==0){fail(s,"BLE_LINK");return;}
            s.stage=3;if(!g.requestMtu(BleKnobPolicy.MIN_MTU))fail(s,"BLE_MTU");
        });}
        @Override public void onMtuChanged(BluetoothGatt g,int mtu,int status){post(s,g,()->{
            if(s.stage!=3||status!=BluetoothGatt.GATT_SUCCESS||mtu<BleKnobPolicy.MIN_MTU){fail(s,"BLE_MTU");return;}
            s.mtu=mtu;BluetoothGattDescriptor descriptor=s.tx.getDescriptor(CCCD);
            if(descriptor==null||!g.setCharacteristicNotification(s.tx,true)){fail(s,"BLE_LINK");return;}
            s.stage=4;boolean ok;
            if(Build.VERSION.SDK_INT>=33)ok=g.writeDescriptor(descriptor,BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE)==BluetoothStatusCodes.SUCCESS;
            else{descriptor.setValue(BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE);ok=g.writeDescriptor(descriptor);}
            if(!ok)fail(s,"BLE_LINK");
        });}
        @Override public void onDescriptorWrite(BluetoothGatt g,BluetoothGattDescriptor d,int status){post(s,g,()->{
            if(s.stage!=4||status!=BluetoothGatt.GATT_SUCCESS||!CCCD.equals(d.getUuid())||!TX.equals(d.getCharacteristic().getUuid())){fail(s,"BLE_LINK");return;}
            s.stage=5;emit(s.id,"ready",null,s.mtu,null,0);
        });}
        @Override public void onCharacteristicChanged(BluetoothGatt g,BluetoothGattCharacteristic c,byte[] value){received(s,g,c,value);}
        @Override public void onCharacteristicChanged(BluetoothGatt g,BluetoothGattCharacteristic c){received(s,g,c,c.getValue());}
        @Override public void onCharacteristicWrite(BluetoothGatt g,BluetoothGattCharacteristic c,int status){post(s,g,()->{
            long id=s.policy.writeId;
            if(s.stage!=5||!RX.equals(c.getUuid())||status!=BluetoothGatt.GATT_SUCCESS||!s.policy.complete(SystemClock.uptimeMillis())){fail(s,"BLE_STALE");return;}
            emit(s.id,"written",null,0,null,id);
        });}
    };}
    private void post(Session s,BluetoothGatt g,Runnable task){
        final long at=SystemClock.uptimeMillis();
        if(s.queued.incrementAndGet()>16){s.queued.decrementAndGet();if(s.overflow.compareAndSet(false,true))io.post(()->fail(s,"BLE_STALE"));return;}
        io.post(()->{try{
            if(current!=s||s.gatt!=g)return;
            if(!BleKnobPolicy.fresh(SystemClock.uptimeMillis(),at,50)){fail(s,"BLE_STALE");return;}
            if(!EngineService.uiForeground){fail(s,"BLE_FOREGROUND");return;}
            task.run();
        }catch(SecurityException e){fail(s,"BLE_PERMISSION");}catch(RuntimeException e){fail(s,"BLE_LINK");}finally{s.queued.decrementAndGet();}});
    }
    private void received(Session s,BluetoothGatt g,BluetoothGattCharacteristic c,byte[] value){
        final long at=SystemClock.uptimeMillis();
        final byte[] copy=value!=null&&value.length<=BleKnobPolicy.MAX_PACKET?value.clone():null;
        post(s,g,()->{
            if(s.stage!=5||!TX.equals(c.getUuid())||copy==null||copy.length<1){fail(s,"BLE_LINK");return;}
            long age=SystemClock.uptimeMillis()-at;
            if(age>=50){fail(s,"BLE_STALE");return;}
            try{output.accept(new JSONObject().put("event","ble").put("id",s.id).put("state","data")
                .put("ageMs",age).put("data",Base64.encodeToString(copy,Base64.NO_WRAP)).toString());}
            catch(org.json.JSONException impossible){throw new IllegalStateException(impossible);}
            finally{Arrays.fill(copy,(byte)0);}
        });
    }
    private void write(Session s,long id,String data,long at){
        if(!EngineService.uiForeground){fail(s,"BLE_FOREGROUND");return;}
        if(s.stage!=5||data.length()>284){fail(s,"BLE_LINK");return;}
        byte[] bytes=Base64.decode(data,Base64.DEFAULT);
        if(!s.policy.begin(id,bytes.length,at,SystemClock.uptimeMillis())){fail(s,"BLE_STALE");return;}
        boolean ok;
        try { if(Build.VERSION.SDK_INT>=33)ok=s.gatt.writeCharacteristic(s.rx,bytes,BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT)==BluetoothStatusCodes.SUCCESS;
        else{s.rx.setWriteType(BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT);s.rx.setValue(bytes);ok=s.gatt.writeCharacteristic(s.rx);}
        } catch(SecurityException e) { fail(s,"BLE_PERMISSION"); return; }
        if(!ok){fail(s,"BLE_LINK");return;}
        io.postDelayed(()->{if(current==s&&s.policy.writeId==id)fail(s,"BLE_STALE");},100);
    }
    private void emit(long id,String state,String code,int mtu,String data,long write){
        try{JSONObject value=new JSONObject().put("event","ble").put("id",id).put("state",state).put("ageMs",0);
            if(code!=null)value.put("code",code);if(mtu>0)value.put("mtu",mtu);if(data!=null)value.put("data",data);if(write>0)value.put("write",write);
            output.accept(value.toString());
        }catch(org.json.JSONException impossible){throw new IllegalStateException(impossible);}
    }
    private void foreground(boolean visible){try{output.accept(new JSONObject().put("event","ble").put("state","foreground").put("visible",visible).toString());}catch(org.json.JSONException impossible){throw new IllegalStateException(impossible);}}
    void foregroundChanged(boolean visible){io.post(()->{if(closed)return;if(observing)foreground(visible);if(!visible&&current!=null)fail(current,"BLE_FOREGROUND");});}
    private void fail(Session s,String code){if(s==null||current!=s)return;emit(s.id,"closed",code,0,null,0);stop(s);}
    private void stop(Session s){
        if(current!=s)return;current=null;
        if(s.gatt!=null){try{s.gatt.disconnect();}catch(SecurityException ignored){}catch(RuntimeException ignored){}try{s.gatt.close();}catch(SecurityException ignored){}catch(RuntimeException ignored){}}
    }
    @Override public void close(){io.post(()->{closed=true;if(current!=null)stop(current);thread.quitSafely();});}
}
