import 'dart:typed_data';

import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/p2p/protocol/holepunch/pb/holepunch.pb.dart';
import 'package:dart_libp2p/p2p/protocol/holepunch/util.dart';
import 'package:test/test.dart';

void main() {
  group('DCUtR Protocol Compliance Tests', () {
    group('Protocol Messages', () {
      test('should create CONNECT message correctly', () {
        final addresses = [
          MultiAddr('/ip4/192.168.1.100/tcp/4001'),
          MultiAddr('/ip6/2001:db8::1/tcp/4002'),
        ];
        
        final msg = HolePunch()
          ..type = HolePunch_Type.CONNECT
          ..obsAddrs.addAll(addrsToBytes(addresses));
        
        expect(msg.type, equals(HolePunch_Type.CONNECT));
        expect(msg.obsAddrs, hasLength(2));
        
        // Verify addresses can be reconstructed
        final reconstructedAddrs = addrsFromBytes(msg.obsAddrs);
        expect(reconstructedAddrs, hasLength(2));
        expect(reconstructedAddrs[0].toString(), equals(addresses[0].toString()));
        expect(reconstructedAddrs[1].toString(), equals(addresses[1].toString()));
      });

      test('should create SYNC message correctly', () {
        final msg = HolePunch()
          ..type = HolePunch_Type.SYNC;
        
        expect(msg.type, equals(HolePunch_Type.SYNC));
        expect(msg.obsAddrs, isEmpty);
      });

      test('should serialize and deserialize CONNECT message', () {
        final originalAddresses = [
          MultiAddr('/ip4/10.0.1.200/tcp/5000'),
          MultiAddr('/ip4/203.0.113.1/tcp/6000'),
        ];
        
        final originalMsg = HolePunch()
          ..type = HolePunch_Type.CONNECT
          ..obsAddrs.addAll(addrsToBytes(originalAddresses));
        
        // Serialize
        final serialized = originalMsg.writeToBuffer();
        expect(serialized, isNotEmpty);
        
        // Deserialize
        final deserializedMsg = HolePunch.fromBuffer(serialized);
        expect(deserializedMsg.type, equals(HolePunch_Type.CONNECT));
        expect(deserializedMsg.obsAddrs, hasLength(2));
        
        // Verify addresses match
        final deserializedAddrs = addrsFromBytes(deserializedMsg.obsAddrs);
        expect(deserializedAddrs, hasLength(2));
        expect(deserializedAddrs[0].toString(), equals(originalAddresses[0].toString()));
        expect(deserializedAddrs[1].toString(), equals(originalAddresses[1].toString()));
      });

      test('should serialize and deserialize SYNC message', () {
        final originalMsg = HolePunch()..type = HolePunch_Type.SYNC;
        
        // Serialize
        final serialized = originalMsg.writeToBuffer();
        expect(serialized, isNotEmpty);
        
        // Deserialize
        final deserializedMsg = HolePunch.fromBuffer(serialized);
        expect(deserializedMsg.type, equals(HolePunch_Type.SYNC));
        expect(deserializedMsg.obsAddrs, isEmpty);
      });
    });

    group('Address Encoding/Decoding', () {
      test('should handle IPv4 addresses correctly', () {
        final ipv4Addresses = [
          MultiAddr('/ip4/127.0.0.1/tcp/4001'),
          MultiAddr('/ip4/192.168.1.1/tcp/8080'),
          MultiAddr('/ip4/10.0.0.1/tcp/3000'),
        ];
        
        final encoded = addrsToBytes(ipv4Addresses);
        expect(encoded, hasLength(3));
        
        final decoded = addrsFromBytes(encoded);
        expect(decoded, hasLength(3));
        
        for (int i = 0; i < ipv4Addresses.length; i++) {
          expect(decoded[i].toString(), equals(ipv4Addresses[i].toString()));
        }
      });

      test('should handle IPv6 addresses correctly', () {
        final ipv6Addresses = [
          MultiAddr('/ip6/::1/tcp/4001'),
          MultiAddr('/ip6/2001:db8::1/tcp/8080'),
          MultiAddr('/ip6/fe80::1/tcp/3000'),
        ];
        
        final encoded = addrsToBytes(ipv6Addresses);
        expect(encoded, hasLength(3));
        
        final decoded = addrsFromBytes(encoded);
        expect(decoded, hasLength(3));
        
        for (int i = 0; i < ipv6Addresses.length; i++) {
          expect(decoded[i].toString(), equals(ipv6Addresses[i].toString()));
        }
      });

      test('should handle mixed IPv4 and IPv6 addresses', () {
        final mixedAddresses = [
          MultiAddr('/ip4/192.168.1.100/tcp/4001'),
          MultiAddr('/ip6/2001:db8::1/tcp/4002'),
          MultiAddr('/ip4/10.0.1.50/tcp/5000'),
          MultiAddr('/ip6/::1/tcp/8080'),
        ];
        
        final encoded = addrsToBytes(mixedAddresses);
        expect(encoded, hasLength(4));
        
        final decoded = addrsFromBytes(encoded);
        expect(decoded, hasLength(4));
        
        for (int i = 0; i < mixedAddresses.length; i++) {
          expect(decoded[i].toString(), equals(mixedAddresses[i].toString()));
        }
      });

      test('should handle empty address list', () {
        final emptyAddresses = <MultiAddr>[];
        
        final encoded = addrsToBytes(emptyAddresses);
        expect(encoded, isEmpty);
        
        final decoded = addrsFromBytes(encoded);
        expect(decoded, isEmpty);
      });

      test('should skip invalid address bytes gracefully', () {
        final validAddr = MultiAddr('/ip4/127.0.0.1/tcp/4001');
        final validBytes = validAddr.toBytes();
        
        // Mix valid and invalid bytes
        final mixedBytes = [
          validBytes,
          Uint8List.fromList([0xFF, 0xFF, 0xFF]), // Invalid multiaddr bytes
          validAddr.toBytes(), // Another valid one
        ];
        
        final decoded = addrsFromBytes(mixedBytes);
        
        // Should only decode valid addresses, skip invalid ones
        expect(decoded, hasLength(2));
        expect(decoded[0].toString(), equals(validAddr.toString()));
        expect(decoded[1].toString(), equals(validAddr.toString()));
      });
    });

    group('Protocol Message Structure', () {
      test('should follow DCUtR specification for CONNECT messages', () {
        // According to DCUtR spec, CONNECT messages should contain observed addresses
        final observedAddrs = [
          MultiAddr('/ip4/198.51.100.1/tcp/4001'),
          MultiAddr('/ip4/198.51.100.2/tcp/4002'),
        ];
        
        final msg = HolePunch()
          ..type = HolePunch_Type.CONNECT
          ..obsAddrs.addAll(addrsToBytes(observedAddrs));
        
        // Verify message structure
        expect(msg.hasType(), isTrue);
        expect(msg.type, equals(HolePunch_Type.CONNECT));
        expect(msg.obsAddrs, isNotEmpty);
        expect(msg.obsAddrs.length, equals(observedAddrs.length));
        
        // Verify serialization produces valid protobuf
        final serialized = msg.writeToBuffer();
        expect(serialized, isNotEmpty);
        expect(() => HolePunch.fromBuffer(serialized), returnsNormally);
      });

      test('should follow DCUtR specification for SYNC messages', () {
        // According to DCUtR spec, SYNC messages don't contain address data
        final msg = HolePunch()..type = HolePunch_Type.SYNC;
        
        // Verify message structure
        expect(msg.hasType(), isTrue);
        expect(msg.type, equals(HolePunch_Type.SYNC));
        expect(msg.obsAddrs, isEmpty);
        
        // Verify serialization produces valid protobuf
        final serialized = msg.writeToBuffer();
        expect(serialized, isNotEmpty);
        expect(() => HolePunch.fromBuffer(serialized), returnsNormally);
      });

      test('should handle protocol ID constants correctly', () {
        expect(protocolId, equals('/libp2p/dcutr'));
        expect(serviceName, equals('libp2p.holepunch'));
        
        // Verify these match the libp2p DCUtR specification
        expect(protocolId.startsWith('/libp2p/'), isTrue);
        expect(protocolId.contains('dcutr'), isTrue);
      });
    });

    group('Message Size Limits', () {
      test('should respect maximum message size limits', () {
        expect(maxMsgSize, equals(4 * 1024)); // 4KB as per spec
        
        // Create a message that should fit within limits
        final reasonableAddresses = List.generate(5, (i) => 
          MultiAddr('/ip4/192.168.1.${i + 100}/tcp/400${i + 1}')
        );
        
        final msg = HolePunch()
          ..type = HolePunch_Type.CONNECT
          ..obsAddrs.addAll(addrsToBytes(reasonableAddresses));
        
        final serialized = msg.writeToBuffer();
        expect(serialized.length, lessThan(maxMsgSize));
      });

      test('should handle large number of addresses efficiently', () {
        // Test with a reasonable number of addresses that might be seen in practice
        final manyAddresses = List.generate(20, (i) => 
          MultiAddr('/ip4/10.0.${i ~/ 256}.${i % 256}/tcp/${4000 + i}')
        );
        
        final encoded = addrsToBytes(manyAddresses);
        final decoded = addrsFromBytes(encoded);
        
        expect(decoded, hasLength(manyAddresses.length));
        for (int i = 0; i < manyAddresses.length; i++) {
          expect(decoded[i].toString(), equals(manyAddresses[i].toString()));
        }
      });
    });

    group('Protocol Constants Validation', () {
      test('should have appropriate timeout values', () {
        expect(streamTimeout, equals(Duration(minutes: 1)));
        expect(dialTimeout, equals(Duration(seconds: 5)));
        expect(maxRetries, equals(3));
        
        // These should be reasonable values for real network conditions
        expect(streamTimeout.inSeconds, greaterThan(30));
        expect(dialTimeout.inSeconds, greaterThan(1));
        expect(maxRetries, greaterThan(0));
      });
    });
  });
}
