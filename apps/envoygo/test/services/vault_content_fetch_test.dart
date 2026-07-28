import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';

import 'package:envoygo/services/library_read_cache.dart';
import 'package:envoygo/services/vault_content_fetch.dart';

void main() {
  group('fetchVaultContent', () {
    test('assembles multiple offset chunks under tunnel-safe size', () async {
      final payload = Uint8List.fromList(
        List<int>.generate(vaultReadChunkBytes + 50, (i) => i % 256),
      );
      final calls = <Map<String, int?>>[];

      final result = await fetchVaultContent(
        ({required relativePath, int? maxBytes, int? offset}) async {
          calls.add({'maxBytes': maxBytes, 'offset': offset});
          final start = offset ?? 0;
          final end = (start + (maxBytes ?? payload.length))
              .clamp(0, payload.length);
          final slice = payload.sublist(start, end);
          return {
            'contentBase64': base64Encode(slice),
            'mimeType': 'image/jpeg',
            'sizeBytes': payload.length,
            'truncated': end < payload.length,
          };
        },
        relativePath: 'profile/thumbnail.jpg',
      );

      expect(calls.length, 2);
      expect(calls[0]['offset'], 0);
      expect(calls[1]['offset'], vaultReadChunkBytes);
      expect(result.bytes, payload);
      expect(result.mimeType, 'image/jpeg');
      // Each chunk body (base64) must stay under prior 128KiB tunnel cap.
      final chunkB64Len = base64Encode(
        payload.sublist(0, vaultReadChunkBytes),
      ).length;
      expect(chunkB64Len, lessThan(128 * 1024));
    });

    test('falls back to full read when home rejects chunked offset', () async {
      final payload = Uint8List.fromList(
        List<int>.generate(80 * 1024, (i) => i % 256),
      );
      var sawOffset = false;
      final result = await fetchVaultContent(
        ({required relativePath, int? maxBytes, int? offset}) async {
          if (offset != null) {
            sawOffset = true;
            throw Exception(
              'File too large for preview (${payload.length} bytes, max $maxBytes)',
            );
          }
          return {
            'contentBase64': base64Encode(payload),
            'mimeType': 'image/jpeg',
            'sizeBytes': payload.length,
            'truncated': false,
          };
        },
        relativePath: 'profile/thumbnail.jpg',
      );
      expect(sawOffset, isTrue);
      expect(result.bytes, payload);
    });

    test('single chunk when file fits', () async {
      final payload = Uint8List.fromList([1, 2, 3, 4]);
      var calls = 0;
      final result = await fetchVaultContent(
        ({required relativePath, int? maxBytes, int? offset}) async {
          calls++;
          return {
            'contentBase64': base64Encode(payload),
            'mimeType': 'image/png',
            'sizeBytes': payload.length,
            'truncated': false,
          };
        },
        relativePath: 'profile/a.png',
      );
      expect(calls, 1);
      expect(result.bytes, payload);
    });

    test('rejects when size exceeds maxVaultPreviewBytes', () async {
      await expectLater(
        fetchVaultContent(
          ({required relativePath, int? maxBytes, int? offset}) async => {
            'contentBase64': '',
            'mimeType': 'image/jpeg',
            'sizeBytes': maxVaultPreviewBytes + 1,
            'truncated': false,
          },
          relativePath: 'huge.bin',
        ),
        throwsA(isA<StateError>()),
      );
    });

    test('stops when truncated is false even if size claims more', () async {
      final payload = Uint8List.fromList([9, 8, 7]);
      var calls = 0;
      final result = await fetchVaultContent(
        ({required relativePath, int? maxBytes, int? offset}) async {
          calls++;
          return {
            'contentBase64': base64Encode(payload),
            'mimeType': 'image/png',
            'sizeBytes': 999999,
            'truncated': false,
          };
        },
        relativePath: 'short.png',
        maxBytes: maxVaultPreviewBytes,
      );
      expect(calls, 1);
      expect(result.bytes, payload);
    });
  });

  group('getOrFetchVaultContent', () {
    late Directory root;
    late LibraryReadCache cache;

    setUp(() {
      root = Directory.systemTemp.createTempSync('envoygo-vault-fetch-');
      cache = LibraryReadCache(root: root, maxEntries: 8);
    });

    tearDown(() async {
      await cache.clear();
      if (await root.exists()) {
        await root.delete(recursive: true);
      }
    });

    test('serves cache hit then bypassCache refetches', () async {
      final payload = Uint8List.fromList([1, 2, 3, 4, 5]);
      var network = 0;
      Future<Map<String, dynamic>> read({
        required String relativePath,
        int? maxBytes,
        int? offset,
      }) async {
        network++;
        return {
          'contentBase64': base64Encode(payload),
          'mimeType': 'image/jpeg',
          'sizeBytes': payload.length,
          'truncated': false,
        };
      }

      final first = await getOrFetchVaultContent(
        read,
        homePeerId: 'home-1',
        relativePath: 'profile/t.jpg',
        cache: cache,
      );
      expect(first.fromCache, isFalse);
      expect(first.bytes, payload);
      expect(network, 1);

      final second = await getOrFetchVaultContent(
        read,
        homePeerId: 'home-1',
        relativePath: 'profile/t.jpg',
        cache: cache,
      );
      expect(second.fromCache, isTrue);
      expect(network, 1);

      final third = await getOrFetchVaultContent(
        read,
        homePeerId: 'home-1',
        relativePath: 'profile/t.jpg',
        bypassCache: true,
        cache: cache,
      );
      expect(third.fromCache, isFalse);
      expect(network, 2);
    });

    test('keys by homePeerId so homes do not collide', () async {
      var network = 0;
      Future<Map<String, dynamic>> read({
        required String relativePath,
        int? maxBytes,
        int? offset,
      }) async {
        network++;
        return {
          'contentBase64': base64Encode(Uint8List.fromList([network])),
          'mimeType': 'image/png',
          'sizeBytes': 1,
          'truncated': false,
        };
      }

      await getOrFetchVaultContent(
        read,
        homePeerId: 'home-a',
        relativePath: 'profile/t.jpg',
        cache: cache,
      );
      await getOrFetchVaultContent(
        read,
        homePeerId: 'home-b',
        relativePath: 'profile/t.jpg',
        cache: cache,
      );
      expect(network, 2);
    });
  });
}
