import 'dart:developer' as developer;
import 'dart:io' show Platform;

import 'package:flutter/services.dart' show MethodChannel, MissingPluginException;

/// Android multicast lock for LAN (mDNS) discovery.
///
/// Android's Wi-Fi stack drops inbound multicast packets unless the app holds a
/// `WifiManager.MulticastLock`, which pure-Dart `mdns_dart` cannot acquire on its
/// own (`AppLifecycle`/Bonjour on iOS needs no equivalent). Without the lock the
/// phone finds nothing "nearby on the same Wi-Fi" while the mesh itself looks
/// healthy — a silent failure that is very hard to diagnose from the UI.
///
/// Every call is defensive: a missing channel (iOS, tests, older builds) only
/// logs and returns, so this never blocks discovery.
class MdnsMulticastLock {
  static const _channel = MethodChannel('envoygo/multicast_lock');
  static bool _held = false;
  static bool _unavailable = false;

  static bool get held => _held;

  static Future<void> acquire() async {
    if (_held || _unavailable || !Platform.isAndroid) return;
    try {
      final ok = await _channel.invokeMethod<bool>('acquire');
      _held = ok == true;
      developer.log(
        '[MdnsMulticastLock] acquire → ${_held ? 'held' : 'denied'}',
        name: 'EnvoyGo',
      );
    } on MissingPluginException {
      _unavailable = true;
    } catch (e) {
      developer.log('[MdnsMulticastLock] acquire failed: $e', name: 'EnvoyGo');
    }
  }

  static Future<void> release() async {
    if (!_held || _unavailable) return;
    try {
      await _channel.invokeMethod<bool>('release');
    } catch (e) {
      developer.log('[MdnsMulticastLock] release failed: $e', name: 'EnvoyGo');
    }
    _held = false;
  }
}
