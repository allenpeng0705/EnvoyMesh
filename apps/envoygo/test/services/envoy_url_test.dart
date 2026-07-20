import 'package:envoygo/services/envoy_url.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('parseEnvoyContentUrl', () {
    test('parses owner-id URL with path', () {
      final p = parseEnvoyContentUrl('envoy://envoy:owner:abc123/hello.md');
      expect(p.targetOwnerId, 'envoy:owner:abc123');
      expect(p.path, 'hello.md');
      expect(p.ownerForm, 'owner-id');
    });

    test('parses root path as empty', () {
      final p = parseEnvoyContentUrl('envoy://envoy:owner:abc123/');
      expect(p.path, '');
    });

    test('preserves trailing slash for directory → index.md', () {
      final p = parseEnvoyContentUrl('envoy://envoy:owner:abc123/blog/');
      expect(p.path, 'blog/');
    });

    test('collapses duplicate slashes but keeps trailing slash', () {
      final p = parseEnvoyContentUrl('envoy://envoy:owner:abc123/a//b/');
      expect(p.path, 'a/b/');
    });

    test('rejects handle form', () {
      expect(
        () => parseEnvoyContentUrl('envoy://@allen/posts/hi'),
        throwsA(isA<FormatException>()),
      );
    });

    test('rejects pairing URI', () {
      expect(
        () => parseEnvoyContentUrl('envoy://contact?token=x'),
        throwsA(isA<FormatException>()),
      );
    });

    test('isEnvoyContentUrl true/false', () {
      expect(isEnvoyContentUrl('envoy://envoy:owner:x/a'), isTrue);
      expect(isEnvoyContentUrl('https://example.com'), isFalse);
    });
  });
}
