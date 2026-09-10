package com.envoymesh.envoygo

import android.content.Context
import android.net.wifi.WifiManager
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

/**
 * Holds a [WifiManager.MulticastLock] for LAN discovery.
 *
 * mDNS in this app comes from pure-Dart `mdns_dart`, which binds 224.0.0.251 and
 * calls `joinMulticast`. Android's Wi-Fi driver drops inbound multicast for apps
 * that do not hold a multicast lock, so without this the phone-mesh "nearby on
 * the same Wi-Fi" plane silently returns nothing even though the socket is open.
 * iOS needs no equivalent (its Bonjour keys are declared in Info.plist).
 */
class MainActivity : FlutterActivity() {
    private var multicastLock: WifiManager.MulticastLock? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL)
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "acquire" -> result.success(acquireMulticastLock())
                    "release" -> {
                        releaseMulticastLock()
                        result.success(true)
                    }
                    "isHeld" -> result.success(multicastLock?.isHeld == true)
                    else -> result.notImplemented()
                }
            }
    }

    private fun acquireMulticastLock(): Boolean {
        if (multicastLock?.isHeld == true) return true
        return try {
            val wifi = applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
            val lock = wifi?.createMulticastLock(LOCK_TAG) ?: return false
            lock.setReferenceCounted(false)
            lock.acquire()
            multicastLock = lock
            true
        } catch (e: Exception) {
            false
        }
    }

    private fun releaseMulticastLock() {
        try {
            if (multicastLock?.isHeld == true) multicastLock?.release()
        } catch (_: Exception) {
        }
        multicastLock = null
    }

    override fun onDestroy() {
        releaseMulticastLock()
        super.onDestroy()
    }

    companion object {
        private const val CHANNEL = "envoygo/multicast_lock"
        private const val LOCK_TAG = "envoygo-mdns"
    }
}
