#include <jni.h>
#include <node.h>
#include <uv.h>
#include <v8.h>
#include <mutex>
#include <deque>
#include <string>
#include <vector>
#include <cstring>
#include <android/log.h>
#include "memory-budget.h"

namespace {
JavaVM* vm = nullptr;
jobject host = nullptr;
jmethodID outbound = nullptr;
uv_async_t asyncHandle;
std::mutex mutex;
struct Incoming { std::u16string text; uint64_t at; };
std::deque<Incoming> incoming;
size_t queuedBytes = 0;
bool active = false;
v8::Isolate* isolate = nullptr;
v8::Global<v8::Context> context;
v8::Global<v8::Function> listener;
gsender::MemoryBudget memoryBudget{};

void GetMemoryBudget(const v8::FunctionCallbackInfo<v8::Value>& args) {
    auto* current = args.GetIsolate();
    auto ctx = current->GetCurrentContext();
    auto result = v8::Object::New(current);
    auto field = [&](const char* name, uint64_t value) {
        result->Set(ctx, v8::String::NewFromUtf8(current, name).ToLocalChecked(),
            v8::Number::New(current, static_cast<double>(value))).Check();
    };
    field("totalMiB", memoryBudget.totalMiB);
    field("systemReserveMiB", memoryBudget.systemReserveMiB);
    field("appPlanningMiB", memoryBudget.appPlanningMiB);
    field("oldSpaceMiB", memoryBudget.oldSpaceMiB);
    field("processBits", memoryBudget.processBits);
    args.GetReturnValue().Set(result);
}

void Send(const v8::FunctionCallbackInfo<v8::Value>& args) {
    if (args.Length() != 1 || !args[0]->IsString()) return;
    v8::String::Value text(args.GetIsolate(), args[0]);
    JNIEnv* env;
    bool attached = vm->GetEnv(reinterpret_cast<void**>(&env), JNI_VERSION_1_6) != JNI_OK;
    if (attached) vm->AttachCurrentThread(&env, nullptr);
    jstring message = env->NewString(reinterpret_cast<const jchar*>(*text), text.length());
    env->CallVoidMethod(host, outbound, message);
    env->DeleteLocalRef(message);
    if (env->ExceptionCheck()) {
        env->ExceptionClear();
        args.GetIsolate()->ThrowException(v8::Exception::Error(v8::String::NewFromUtf8Literal(args.GetIsolate(), "Android USB dispatch failed")));
    }
    if (attached) vm->DetachCurrentThread();
}
void Deliver(uv_async_t*) {
    std::deque<Incoming> batch;
    { std::lock_guard<std::mutex> lock(mutex); batch.swap(incoming); queuedBytes = 0; }
    v8::HandleScope handles(isolate);
    auto ctx = context.Get(isolate);
    v8::Context::Scope scope(ctx);
    if (listener.IsEmpty()) return;
    auto fn = listener.Get(isolate);
    for (const auto& entry : batch) {
        const auto& text = entry.text;
        v8::Local<v8::Value> argv[] = {v8::String::NewFromTwoByte(isolate, reinterpret_cast<const uint16_t*>(text.data()), v8::NewStringType::kNormal, text.size()).ToLocalChecked(),
            v8::Number::New(isolate, static_cast<double>(uv_hrtime()-entry.at)/1000000.0)};
        node::MakeCallback(isolate, ctx->Global(), fn, 2, argv, {0, 0});
    }
}
void Subscribe(const v8::FunctionCallbackInfo<v8::Value>& args) {
    if (args.Length() && args[0]->IsFunction()) listener.Reset(args.GetIsolate(), args[0].As<v8::Function>());
}
void Cleanup(void*) {
    { std::lock_guard<std::mutex> lock(mutex); active = false; incoming.clear(); queuedBytes = 0; }
    listener.Reset(); context.Reset();
    uv_close(reinterpret_cast<uv_handle_t*>(&asyncHandle), nullptr);
}
void Initialize(v8::Local<v8::Object> exports, v8::Local<v8::Value>, v8::Local<v8::Context> ctx, void*) {
    isolate = ctx->GetIsolate(); context.Reset(isolate, ctx);
    uv_async_init(node::GetCurrentEventLoop(isolate), &asyncHandle, Deliver);
    { std::lock_guard<std::mutex> lock(mutex); active = true; }
    NODE_SET_METHOD(exports, "send", Send);
    NODE_SET_METHOD(exports, "subscribe", Subscribe);
    NODE_SET_METHOD(exports, "memoryBudget", GetMemoryBudget);
    node::AddEnvironmentCleanupHook(isolate, Cleanup, nullptr);
}
NODE_MODULE_LINKED(gsender_usb, Initialize)
}

extern "C" JNIEXPORT jint JNICALL JNI_OnLoad(JavaVM* value, void*) { vm = value; return JNI_VERSION_1_6; }
extern "C" JNIEXPORT jint JNICALL
Java_com_gsender_android_NativeRuntime_start(JNIEnv* env, jobject self, jstring entry) {
    host = env->NewGlobalRef(self);
    outbound = env->GetMethodID(env->GetObjectClass(self), "onNodeMessage", "(Ljava/lang/String;)V");
    const char* path = env->GetStringUTFChars(entry, nullptr);
    // node::Start expects argv strings in writable contiguous memory.
    std::string script(path); env->ReleaseStringUTFChars(entry, path);
    memoryBudget = gsender::ChooseMemoryBudget(uv_get_total_memory() / (1024 * 1024), sizeof(void*) * 8);
    __android_log_print(ANDROID_LOG_INFO, "gSenderMemory",
        "RAM=%llu MiB app-planning=%llu MiB V8-old-space=%llu MiB process=%u-bit",
        static_cast<unsigned long long>(memoryBudget.totalMiB),
        static_cast<unsigned long long>(memoryBudget.appPlanningMiB),
        static_cast<unsigned long long>(memoryBudget.oldSpaceMiB), memoryBudget.processBits);
    std::string flags = "--max-old-space-size=" + std::to_string(memoryBudget.oldSpaceMiB);
    std::vector<char> storage(5 + flags.size() + 1 + script.size() + 1);
    char* argv[3]; argv[0] = storage.data(); std::strcpy(argv[0], "node");
    argv[1] = argv[0] + 5; std::strcpy(argv[1], flags.c_str());
    argv[2] = argv[1] + flags.size() + 1; std::strcpy(argv[2], script.c_str());
    int result = node::Start(3, argv);
    env->DeleteGlobalRef(host); host = nullptr;
    return result;
}
extern "C" JNIEXPORT jboolean JNICALL
Java_com_gsender_android_NativeRuntime_deliver(JNIEnv* env, jobject, jstring value) {
    const jchar* data = env->GetStringChars(value, nullptr);
    std::u16string text(reinterpret_cast<const char16_t*>(data), env->GetStringLength(value)); env->ReleaseStringChars(value, data);
    std::lock_guard<std::mutex> lock(mutex);
    if (!active || queuedBytes + text.size() * 2 > 2 * 1024 * 1024) return false;
    queuedBytes += text.size() * 2; incoming.push_back({std::move(text), uv_hrtime()});
    uv_async_send(&asyncHandle);
    return true;
}
