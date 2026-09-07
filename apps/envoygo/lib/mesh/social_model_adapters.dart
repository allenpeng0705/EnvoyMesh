/// Map SDK models ↔ EnvoyGo UI models.
library;

import 'package:envoy_mesh/envoy_mesh.dart';

import '../models/chat_message.dart';
import '../models/contact.dart';
import '../models/peer_search_result.dart';

Contact contactFromBond(BondContact c) => Contact(
      ownerId: c.ownerId,
      displayName: c.displayName,
      bondLevel: c.bondLevel,
      avatarUrl: c.avatarUrl,
      lastSeen: c.lastSeen,
    );

BondContact bondFromContact(Contact c) => BondContact(
      ownerId: c.ownerId,
      displayName: c.displayName,
      bondLevel: c.bondLevel,
      avatarUrl: c.avatarUrl,
      lastSeen: c.lastSeen,
    );

ChatMessage chatFromMesh(MeshChatMessage m) => ChatMessage(
      id: m.id,
      threadId: m.threadId,
      senderOwnerId: m.senderOwnerId,
      senderDisplayName: m.senderDisplayName,
      text: m.text,
      createdAt: m.createdAt,
      isOutbound: m.isOutbound,
    );

PeerSearchResult peerFromMesh(MeshPeerHit h) => PeerSearchResult(
      nodeId: h.nodeId,
      ownerId: h.ownerId,
      displayName: h.displayName,
      interests: h.interests,
      profileVisibility: h.profileVisibility,
      trustLevel: h.trustLevel,
    );
