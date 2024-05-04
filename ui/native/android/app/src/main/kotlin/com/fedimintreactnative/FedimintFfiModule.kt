package com.fedi

import android.util.Log
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule.RCTDeviceEventEmitter
import org.fedi.fedi.*
import com.facebook.react.bridge.Arguments

import kotlinx.coroutines.*

object EventDispatcher : EventSink {
    override fun event(eventType: String, body: String) {
        BridgeNativeEventEmitter.send(eventType, body)
    }
}
class FedimintFfiModule(reactContext: ReactApplicationContext) :
        ReactContextBaseJavaModule(reactContext) {

    init {
        BridgeNativeEventEmitter.setContext(reactContext)
    }

    override fun getName(): String {
        return NAME
    }

    @ReactMethod
    fun initialize(options: String, promise: Promise) {
        GlobalScope.launch {
            val response = fedimintInitialize(EventDispatcher, options)
            promise.resolve(response)
        }
    }

    @ReactMethod
    fun rpc(method: String, payload: String, promise: Promise) {
        GlobalScope.launch {
            var response = fedimintRpc(method, payload)
            promise.resolve(response)
        }
    }

    @ReactMethod
    fun getSupportedEvents(promise: Promise) {
        var arrayList = fedimintGetSupportedEvents()
        var nativeArray = Arguments.fromList(arrayList);
        promise.resolve(nativeArray)
    }

    companion object {
        const val NAME = "FedimintFfi"
    }

}

object BridgeNativeEventEmitter {
    private var reactContext: ReactContext? = null

    fun setContext(reactContext: ReactContext) {
        this.reactContext = reactContext
    }

    fun send(eventType: String, body: Any) {
        if (this.reactContext === null) {
            return
        }

        this.reactContext!!.getJSModule(RCTDeviceEventEmitter::class.java).emit(eventType, body)
    }
}
