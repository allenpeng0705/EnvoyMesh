import 'package:envoygo/connection/phone_mesh_runtime.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('phoneMeshRetryDelay', () {
    test('backs off exponentially then caps at 30s', () {
      expect(phoneMeshRetryDelay(1), const Duration(seconds: 2));
      expect(phoneMeshRetryDelay(2), const Duration(seconds: 4));
      expect(phoneMeshRetryDelay(3), const Duration(seconds: 8));
      expect(phoneMeshRetryDelay(4), const Duration(seconds: 16));
      expect(phoneMeshRetryDelay(5), const Duration(seconds: 30));
      // Beyond the cap (or nonsense input) never grows unbounded or goes to 0.
      expect(phoneMeshRetryDelay(6), const Duration(seconds: 30));
      expect(phoneMeshRetryDelay(99), const Duration(seconds: 30));
      expect(phoneMeshRetryDelay(0), const Duration(seconds: 2));
      expect(phoneMeshRetryDelay(-3), const Duration(seconds: 2));
    });

    test('a retry never waits longer than the cap', () {
      for (var attempt = 1; attempt <= 20; attempt++) {
        expect(
          phoneMeshRetryDelay(attempt) <= const Duration(seconds: 30),
          isTrue,
          reason: 'attempt $attempt exceeded the cap',
        );
      }
    });
  });

  group('PhoneMeshRuntimeState', () {
    test('fullyUp requires both the session and discovery', () {
      const nothing = PhoneMeshRuntimeState();
      expect(nothing.fullyUp, isFalse);

      const sessionOnly = PhoneMeshRuntimeState(sessionActive: true);
      expect(sessionOnly.fullyUp, isFalse,
          reason: 'connected without discovery is the "no results" state');

      const up = PhoneMeshRuntimeState(
        sessionActive: true,
        discoveryActive: true,
      );
      expect(up.fullyUp, isTrue);
    });

    test('defaults keep the UI quiet (no error, not starting)', () {
      const state = PhoneMeshRuntimeState();
      expect(state.lastError, isNull);
      expect(state.starting, isFalse);
      expect(state.attempts, 0);
      expect(state.diagnostics, isNull);
      expect(state.lanActive, isFalse);
    });

    test('LAN is tracked separately from WAN discovery', () {
      // Relay search works without mDNS, so lanActive must not gate fullyUp —
      // it only drives the "same Wi-Fi discovery is off" hint.
      const wanOnly = PhoneMeshRuntimeState(
        sessionActive: true,
        discoveryActive: true,
      );
      expect(wanOnly.lanActive, isFalse);
      expect(wanOnly.fullyUp, isTrue);

      const lanUp = PhoneMeshRuntimeState(
        sessionActive: true,
        discoveryActive: true,
        lanActive: true,
      );
      expect(lanUp.fullyUp, isTrue);
    });
  });
}
