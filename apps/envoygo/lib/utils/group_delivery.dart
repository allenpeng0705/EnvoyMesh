/// Group chat delivery ack merge (mirrors `@envoymesh/api/group-chat-delivery`).
class GroupDeliveryMetadata {
  final List<String> deliveredToOwnerIds;
  final List<String> pendingRecipientOwnerIds;
  final String deliveryReceipt;

  const GroupDeliveryMetadata({
    this.deliveredToOwnerIds = const [],
    this.pendingRecipientOwnerIds = const [],
    this.deliveryReceipt = 'sent',
  });

  bool get isFullyDelivered => deliveryReceipt == 'delivered';

  GroupDeliveryMetadata mergeAck(String recipientOwnerId) {
    final delivered = {...deliveredToOwnerIds, recipientOwnerId}.toList();
    final pending =
        pendingRecipientOwnerIds.where((id) => !delivered.contains(id)).toList();
    // Only flip to delivered when we were tracking pending recipients and
    // they are all acked (matches Social after seeding pending on send).
    final hadPending = pendingRecipientOwnerIds.isNotEmpty;
    final allDelivered = hadPending && pending.isEmpty;
    return GroupDeliveryMetadata(
      deliveredToOwnerIds: delivered,
      pendingRecipientOwnerIds: pending,
      deliveryReceipt: allDelivered ? 'delivered' : 'sent',
    );
  }

  GroupDeliveryMetadata markFailed() {
    return GroupDeliveryMetadata(
      deliveredToOwnerIds: deliveredToOwnerIds,
      pendingRecipientOwnerIds: pendingRecipientOwnerIds,
      deliveryReceipt: 'failed',
    );
  }
}

GroupDeliveryMetadata deliveryFromRpcMap(Map<String, dynamic>? result) {
  if (result == null) return const GroupDeliveryMetadata(deliveryReceipt: 'sent');
  final pendingRaw = result['pendingRecipientOwnerIds'];
  final deliveredRaw = result['deliveredToOwnerIds'];
  final receipt = result['deliveryReceipt']?.toString() ?? 'sent';
  return GroupDeliveryMetadata(
    deliveredToOwnerIds: deliveredRaw is List
        ? deliveredRaw.map((e) => e.toString()).toList()
        : const [],
    pendingRecipientOwnerIds: pendingRaw is List
        ? pendingRaw.map((e) => e.toString()).toList()
        : const [],
    deliveryReceipt: receipt,
  );
}

GroupDeliveryMetadata parseDeliveryMetadata(Map<String, dynamic>? metadata) {
  if (metadata == null) return const GroupDeliveryMetadata();
  final delivered = metadata['deliveredToOwnerIds'];
  final pending = metadata['pendingRecipientOwnerIds'];
  final receipt = metadata['deliveryReceipt']?.toString() ?? 'sent';
  return GroupDeliveryMetadata(
    deliveredToOwnerIds: delivered is List
        ? delivered.map((e) => e.toString()).toList()
        : const [],
    pendingRecipientOwnerIds: pending is List
        ? pending.map((e) => e.toString()).toList()
        : const [],
    deliveryReceipt: receipt,
  );
}

Map<String, dynamic> deliveryMetadataToJson(GroupDeliveryMetadata meta) {
  return {
    'deliveredToOwnerIds': meta.deliveredToOwnerIds,
    'pendingRecipientOwnerIds': meta.pendingRecipientOwnerIds,
    'deliveryReceipt': meta.deliveryReceipt,
  };
}
