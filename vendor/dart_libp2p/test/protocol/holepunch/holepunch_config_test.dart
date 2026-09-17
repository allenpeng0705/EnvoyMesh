import 'dart:async';

import 'package:dart_libp2p/core/crypto/ed25519.dart';
import 'package:dart_libp2p/core/peer/peer_id.dart';
import 'package:dart_libp2p/core/crypto/keys.dart';
import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/config/config.dart';
import 'package:dart_libp2p/p2p/host/basic/basic_host.dart';
import 'package:dart_libp2p/p2p/protocol/holepunch/util.dart';
import 'package:test/test.dart';

void main() {
  group('HolePunch Configuration Tests', () {
    group('Config Settings', () {
      test('should enable holepunch by default', () {
        final config = Config();
        expect(config.enableHolePunching, isTrue);
      });

      test('should allow disabling holepunch', () {
        final config = Config()..enableHolePunching = false;
        expect(config.enableHolePunching, isFalse);
      });

      test('should allow explicitly enabling holepunch', () {
        final config = Config()
          ..enableHolePunching = false
          ..enableHolePunching = true;
        expect(config.enableHolePunching, isTrue);
      });
    });

    group('Host Integration', () {
      late KeyPair keyPair;
      late PeerId peerId;
      
      setUp(() async {
        keyPair = await generateEd25519KeyPair();
        peerId = await PeerId.fromPublicKey(keyPair.publicKey);
      });

      test('should support holepunch configuration setting', () async {
        // Test that the configuration setting works as expected
        final enabledConfig = Config()..enableHolePunching = true;
        expect(enabledConfig.enableHolePunching, isTrue);
        
        final disabledConfig = Config()..enableHolePunching = false;
        expect(disabledConfig.enableHolePunching, isFalse);
      });

      test('should have independent holepunch setting from other features', () async {
        final config = Config()
          ..enableHolePunching = true
          ..enableAutoNAT = false
          ..enableRelay = false;
        
        expect(config.enableHolePunching, isTrue);
        expect(config.enableAutoNAT, isFalse);
        expect(config.enableRelay, isFalse);
      });
    });

    group('Protocol Registration', () {
      test('should have correct DCUtR protocol ID', () {
        expect(protocolId, equals('/libp2p/dcutr'));
      });

      test('should have correct service name', () {
        expect(serviceName, equals('libp2p.holepunch'));
      });
    });

    group('Configuration Validation', () {
      test('should have consistent default settings', () {
        final config = Config();
        
        // Holepunch should be enabled by default
        expect(config.enableHolePunching, isTrue);
        
        // But AutoNAT and Relay should be disabled by default
        expect(config.enableAutoNAT, isFalse);
        expect(config.enableRelay, isFalse);
        
        // While Ping should be enabled by default
        expect(config.enablePing, isTrue);
      });

      test('should allow independent control of NAT-related features', () {
        final config = Config()
          ..enableHolePunching = true
          ..enableAutoNAT = true
          ..enableRelay = false;
        
        expect(config.enableHolePunching, isTrue);
        expect(config.enableAutoNAT, isTrue);
        expect(config.enableRelay, isFalse);
      });

      test('should allow disabling all NAT-related features', () {
        final config = Config()
          ..enableHolePunching = false
          ..enableAutoNAT = false
          ..enableRelay = false;
        
        expect(config.enableHolePunching, isFalse);
        expect(config.enableAutoNAT, isFalse);
        expect(config.enableRelay, isFalse);
      });
    });

    group('Feature Interaction', () {
      test('holepunch can be enabled without relay', () {
        final config = Config()
          ..enableHolePunching = true
          ..enableRelay = false;
        
        expect(config.enableHolePunching, isTrue);
        expect(config.enableRelay, isFalse);
      });

      test('holepunch can be enabled without autonat', () {
        final config = Config()
          ..enableHolePunching = true
          ..enableAutoNAT = false;
        
        expect(config.enableHolePunching, isTrue);
        expect(config.enableAutoNAT, isFalse);
      });

      test('holepunch can work with all NAT features enabled', () {
        final config = Config()
          ..enableHolePunching = true
          ..enableAutoNAT = true
          ..enableRelay = true;
        
        expect(config.enableHolePunching, isTrue);
        expect(config.enableAutoNAT, isTrue);
        expect(config.enableRelay, isTrue);
      });
    });
  });
}
