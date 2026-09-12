import 'package:flutter_test/flutter_test.dart';
import 'package:envoygo/coding/coding_review_ref.dart';

void main() {
  const base = CodingReviewRef(
    ownerId: 'envoy:owner:alice',
    chatId: 'chat-1',
    title: 'Fix login',
    cwd: '/tmp/proj',
    turnId: 'turn-9',
    revision: 3,
  );

  group('coding_review_ref', () {
    test('round-trips encode → parse', () {
      final line = encodeCodingReviewRef(base);
      expect(line.startsWith(codingReviewMarker), isTrue);
      expect(parseCodingReviewRef(line), equals(base));
    });

    test('parses marker from a multi-line chat body', () {
      final msg = formatCodingReviewInviteMessage(base);
      expect(msg, contains("I've invited you to review"));
      expect(msg, contains('Fix login'));
      expect(parseCodingReviewRef(msg), equals(base));
      expect(
        humanTextWithoutCodingReviewMarker(msg),
        isNot(contains(codingReviewMarker)),
      );
    });

    test('returns null for missing or invalid payloads', () {
      expect(parseCodingReviewRef(''), isNull);
      expect(parseCodingReviewRef('hello'), isNull);
      expect(parseCodingReviewRef('$codingReviewMarker{not-json'), isNull);
      expect(
        parseCodingReviewRef(
          '$codingReviewMarker{"kind":"other","v":1,"ownerId":"a","chatId":"b"}',
        ),
        isNull,
      );
      expect(
        parseCodingReviewRef(
          '$codingReviewMarker{"kind":"$codingReviewRefKind","v":2,"ownerId":"a","chatId":"b"}',
        ),
        isNull,
      );
      expect(
        parseCodingReviewRef(
          '$codingReviewMarker{"kind":"$codingReviewRefKind","v":1,"ownerId":"","chatId":"b"}',
        ),
        isNull,
      );
    });

    test('omits empty optional fields from encode', () {
      final line = encodeCodingReviewRef(
        const CodingReviewRef(
          ownerId: 'envoy:owner:bob',
          chatId: 'c2',
          title: '  ',
        ),
      );
      expect(
        parseCodingReviewRef(line),
        equals(
          const CodingReviewRef(
            ownerId: 'envoy:owner:bob',
            chatId: 'c2',
          ),
        ),
      );
    });
  });
}
