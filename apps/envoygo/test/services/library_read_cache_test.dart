import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:envoygo/models/library_read.dart';
import 'package:envoygo/services/library_read_cache.dart';
import 'package:envoygo/services/library_read_fetch.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  late Directory root;
  late LibraryReadCache cache;
  var now = DateTime.utc(2026, 7, 26, 12);

  setUp(() {
    root = Directory.systemTemp.createTempSync('envoygo-media-cache-');
    now = DateTime.utc(2026, 7, 26, 12);
    cache = LibraryReadCache(
      root: root,
      clock: () => now,
      maxEntries: 3,
      freshTtl: const Duration(seconds: 60),
    );
  });

  tearDown(() async {
    await cache.clear();
    if (await root.exists()) {
      await root.delete(recursive: true);
    }
  });

  LibraryReadFn _okImage() {
    return ({
      required String targetOwnerId,
      required String path,
      Map<String, int>? range,
      String? ifNoneMatch,
      int? timeoutMs,
    }) async {
      if (ifNoneMatch != null && ifNoneMatch.isNotEmpty) {
        return LibraryReadResult(
          peerOwnerId: targetOwnerId,
          libp2pPeerId: 'p',
          status: 'not_modified',
          etag: ifNoneMatch,
          contentHash: 'hash1',
          contentType: 'image/png',
          byteLength: 4,
          latencyMs: 1,
        );
      }
      return LibraryReadResult(
        peerOwnerId: targetOwnerId,
        libp2pPeerId: 'p',
        status: 'ok',
        body: base64Encode(Uint8List.fromList([1, 2, 3, 4])),
        contentType: 'image/png',
        contentHash: 'hash1',
        etag: 'etag1',
        byteLength: 4,
        latencyMs: 1,
      );
    };
  }

  test('fresh hit skips network', () async {
    var network = 0;
    final reader = ({
      required String targetOwnerId,
      required String path,
      Map<String, int>? range,
      String? ifNoneMatch,
      int? timeoutMs,
    }) async {
      network++;
      return LibraryReadResult(
        peerOwnerId: targetOwnerId,
        libp2pPeerId: 'p',
        status: 'ok',
        body: base64Encode(Uint8List.fromList([9, 9])),
        contentType: 'image/jpeg',
        contentHash: 'h',
        etag: 'e',
        byteLength: 2,
        latencyMs: 1,
      );
    };

    final first = await cache.fetch(
      reader,
      targetOwnerId: 'envoy:owner:a',
      path: 'feeds/media/a.jpg',
    );
    expect(first.fromCache, isFalse);
    expect(first.bytes, isNotNull);
    expect(network, 1);

    final second = await cache.fetch(
      reader,
      targetOwnerId: 'envoy:owner:a',
      path: 'feeds/media/a.jpg',
    );
    expect(second.fromCache, isTrue);
    expect(second.bytes, first.bytes);
    expect(network, 1);
  });

  test('survives process restart via disk', () async {
    final reader = _okImage();
    await cache.fetch(reader, targetOwnerId: 'o', path: 'a.png');

    final again = LibraryReadCache(root: root, clock: () => now, maxEntries: 3);
    final peek = await again.peekBytes('o', 'a.png');
    expect(peek, isNotNull);
    expect(peek!.length, 4);
  });

  test('stale entry revalidates with If-None-Match', () async {
    var sawIfNone = false;
    final reader = ({
      required String targetOwnerId,
      required String path,
      Map<String, int>? range,
      String? ifNoneMatch,
      int? timeoutMs,
    }) async {
      if (ifNoneMatch != null) {
        sawIfNone = true;
        return LibraryReadResult(
          peerOwnerId: targetOwnerId,
          libp2pPeerId: 'p',
          status: 'not_modified',
          etag: ifNoneMatch,
          contentHash: 'hash1',
          contentType: 'image/png',
          byteLength: 4,
          latencyMs: 1,
        );
      }
      return LibraryReadResult(
        peerOwnerId: targetOwnerId,
        libp2pPeerId: 'p',
        status: 'ok',
        body: base64Encode(Uint8List.fromList([1, 2, 3, 4])),
        contentType: 'image/png',
        contentHash: 'hash1',
        etag: 'etag1',
        byteLength: 4,
        latencyMs: 1,
      );
    };

    await cache.fetch(reader, targetOwnerId: 'o', path: 'x.png');
    now = now.add(const Duration(minutes: 5));
    final result = await cache.fetch(reader, targetOwnerId: 'o', path: 'x.png');
    expect(sawIfNone, isTrue);
    expect(result.fromCache, isTrue);
    expect(result.bytes, isNotNull);
  });

  test('vault / thumb blob helpers round-trip', () async {
    final bytes = Uint8List.fromList([7, 8, 9]);
    await cache.putBlob(
      vaultCacheKey('home-a', 'voice/a.m4a'),
      bytes,
      contentType: 'audio/mp4',
    );
    final hit = await cache.peekBlob(vaultCacheKey('home-a', 'voice/a.m4a'));
    expect(hit, bytes);
    // Different home must not collide.
    expect(await cache.peekBlob(vaultCacheKey('home-b', 'voice/a.m4a')), isNull);

    final thumb = await cache.getOrFetchBlob(
      peerThumbCacheKey('envoy:owner:bob'),
      () async => Uint8List.fromList([1]),
      contentType: 'image/jpeg',
    );
    expect(thumb, Uint8List.fromList([1]));
    final again = await cache.getOrFetchBlob(
      peerThumbCacheKey('envoy:owner:bob'),
      () async => Uint8List.fromList([99]),
    );
    expect(again, Uint8List.fromList([1]));
  });

  test('clearVaultForHome keeps peer thumbs and other homes', () async {
    await cache.putBlob(
      vaultCacheKey('peer-a', 'profile/t.jpg'),
      Uint8List.fromList([1]),
    );
    await cache.putBlob(
      vaultCacheKey('peer-b', 'profile/t.jpg'),
      Uint8List.fromList([2]),
    );
    await cache.putBlob(
      peerThumbCacheKey('envoy:owner:me'),
      Uint8List.fromList([3]),
    );
    await cache.clearVaultForHome('peer-a');
    expect(await cache.peekBlob(vaultCacheKey('peer-a', 'profile/t.jpg')), isNull);
    expect(await cache.peekBlob(vaultCacheKey('peer-b', 'profile/t.jpg')), isNotNull);
    expect(await cache.peekBlob(peerThumbCacheKey('envoy:owner:me')), isNotNull);
  });

  test('getOrFetchBlob respects maxAge', () async {
    var fetches = 0;
    await cache.getOrFetchBlob(
      vaultCacheKey('h', 'f.bin'),
      () async {
        fetches++;
        return Uint8List.fromList([1]);
      },
      maxAge: const Duration(minutes: 5),
    );
    expect(fetches, 1);

    now = now.add(const Duration(minutes: 6));
    await cache.getOrFetchBlob(
      vaultCacheKey('h', 'f.bin'),
      () async {
        fetches++;
        return Uint8List.fromList([2]);
      },
      maxAge: const Duration(minutes: 5),
    );
    expect(fetches, 2);
  });

  test('invalidateBlob drops memory and disk', () async {
    final key = vaultCacheKey('h', 'gone.bin');
    await cache.putBlob(key, Uint8List.fromList([1, 2, 3]));
    expect(await cache.peekBlob(key), isNotNull);
    await cache.invalidateBlob(key);
    expect(await cache.peekBlob(key), isNull);
  });
}
