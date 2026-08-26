import 'package:envoygo/utils/group_delivery.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('GroupDeliveryMetadata.mergeAck', () {
    test('does not mark delivered when pending was never seeded', () {
      const prior = GroupDeliveryMetadata();
      final after = prior.mergeAck('envoy:owner:bob');
      expect(after.deliveryReceipt, 'sent');
      expect(after.deliveredToOwnerIds, ['envoy:owner:bob']);
    });

    test('marks delivered when all seeded pending recipients ack', () {
      const prior = GroupDeliveryMetadata(
        pendingRecipientOwnerIds: ['envoy:owner:bob', 'envoy:owner:carol'],
      );
      var state = prior.mergeAck('envoy:owner:bob');
      expect(state.deliveryReceipt, 'sent');
      state = state.mergeAck('envoy:owner:carol');
      expect(state.deliveryReceipt, 'delivered');
      expect(state.pendingRecipientOwnerIds, isEmpty);
    });
  });

  group('deliveryFromRpcMap', () {
    test('parses mesh group send result', () {
      final meta = deliveryFromRpcMap({
        'deliveryReceipt': 'sent',
        'deliveredToOwnerIds': ['envoy:owner:alice'],
        'pendingRecipientOwnerIds': ['envoy:owner:bob'],
      });
      expect(meta.deliveryReceipt, 'sent');
      expect(meta.pendingRecipientOwnerIds, ['envoy:owner:bob']);
    });
  });
}
