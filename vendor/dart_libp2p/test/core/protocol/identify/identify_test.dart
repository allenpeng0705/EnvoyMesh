import 'package:dart_libp2p/p2p/protocol/identify/identify.dart';
import 'package:dart_libp2p/p2p/protocol/identify/pb/identify.pb.dart';
import 'package:dart_libp2p/core/host/host.dart';
import 'package:dart_libp2p/core/event/bus.dart';
import 'package:dart_libp2p/core/record/envelope.dart';
import 'package:mockito/annotations.dart';
import 'package:mockito/mockito.dart';
import 'package:test/test.dart';

import 'identify_test.mocks.dart';

class FakeSubscription implements Subscription {
  @override
  Stream get stream => const Stream.empty();
  @override
  String get name => 'fake';
  @override
  Future<void> close() async {}
}

class FakeEmitter implements Emitter {
  @override
  Future<void> emit(Object event) async {}
  @override
  Future<void> close() async {}
}

@GenerateMocks([Host, EventBus])
void main() {
  group('IdentifyService', () {
    late MockHost mockHost;
    late MockEventBus mockEventBus;
    late FakeSubscription fakeSubscription;
    late FakeEmitter fakeEmitter;

    setUp(() {
      mockHost = MockHost();
      mockEventBus = MockEventBus();
      fakeSubscription = FakeSubscription();
      fakeEmitter = FakeEmitter();
      when(mockHost.eventBus).thenReturn(mockEventBus);
      when(mockEventBus.subscribe(any, opts: anyNamed('opts'))).thenReturn(fakeSubscription);
      when(mockEventBus.emitter(any, opts: anyNamed('opts'))).thenAnswer((_) async => fakeEmitter);
    });

    group('signedPeerRecordFromMessage', () {
      test('returns null when message has no signed peer record', () async {
        final msg = Identify();
        final service = IdentifyService(mockHost);
        final result = await service.signedPeerRecordFromMessage(msg);
        expect(result, isNull);
      });

      test('returns null when signed peer record is empty', () async {
        final msg = Identify(signedPeerRecord: []);
        final service = IdentifyService(mockHost);
        final result = await service.signedPeerRecordFromMessage(msg);
        expect(result, isNull);
      });

      test('returns null when signed peer record is invalid', () async {
        // Create an invalid signed peer record
        final msg = Identify(
          signedPeerRecord: [1, 2, 3, 4, 5], // Invalid protobuf data
        );
        
        final service = IdentifyService(mockHost);
        final result = await service.signedPeerRecordFromMessage(msg);
        
        expect(result, isNull);
      });
    });
  });
} 