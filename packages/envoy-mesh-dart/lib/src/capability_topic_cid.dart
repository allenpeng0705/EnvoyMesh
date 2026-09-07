/// Capability-topic CID — must match `packages/network/src/capability-topic-cid.ts`.
library;

import 'dart:convert';
import 'dart:typed_data';

import 'package:dcid/dcid.dart';

/// Prefix for capability strings before hashing into a provider CID.
const String capabilityTopicNamespace = 'envoymesh:cap:v1:';

/// Deterministic CID string used as DHT provider key / relay `topicHash`.
String cidStringForCapabilityTopic(String topic) {
  final normalized = topic.trim();
  if (normalized.isEmpty) {
    throw ArgumentError('capability topic must be a non-empty string');
  }
  final bytes =
      Uint8List.fromList(utf8.encode('$capabilityTopicNamespace$normalized'));
  return CID.fromData(CID.V1, 'raw', bytes, 'sha2-256').toString();
}
