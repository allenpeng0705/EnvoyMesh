import 'package:envoygo/services/exceptions.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('UnauthorizedException', () {
    test('carries the reason passed to the constructor', () {
      const e = UnauthorizedException('Authentication required');
      expect(e.reason, 'Authentication required');
    });

    test('toString returns "UnauthorizedException: <reason>"', () {
      const e = UnauthorizedException('session expired');
      expect(e.toString(), 'UnauthorizedException: session expired');
    });

    test('is an Exception so try/catch on Exception still catches it', () {
      const e = UnauthorizedException('x');
      expect(e, isA<Exception>());
    });
  });
}
