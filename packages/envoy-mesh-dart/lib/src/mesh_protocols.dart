/// libp2p protocol IDs — must match `packages/network/src/protocols.ts`.
library;

const String envoyMessageProtocol = '/envoymesh/message/0.1.0';
const String envoyChatProtocol = '/envoymesh/chat/0.1.0';
const String envoyDataProtocol = '/envoymesh/data/0.1.0';
const String clientProxyProtocol = '/envoymesh/client-proxy/0.1.0';

/// Desktop outbound: bond.* uses message; chat.message uses chat.
bool isBondIntent(String intent) => intent.startsWith('bond.');

bool isChatMessageIntent(String intent) =>
    intent == 'chat.message' || intent == 'chat.delivered';

/// Protocol a phone social-lite node should open for [intent].
String outboundProtocolForIntent(String intent) {
  if (intent == 'chat.message' ||
      intent == 'chat.delivered' ||
      intent == 'chat.room.sync' ||
      intent == 'chat.room.message' ||
      intent.startsWith('call.') ||
      intent.startsWith('profile.')) {
    return envoyChatProtocol;
  }
  // Desktop sends bond.* on message today; chat protocol also accepts bond.*.
  return envoyMessageProtocol;
}

/// Whether [intent] is valid on [protocol] (mirrors network validateEnvelopeProtocol).
bool isIntentAllowedOnProtocol(String protocol, String intent) {
  if (protocol == envoyChatProtocol) {
    return intent == 'chat.message' ||
        intent == 'chat.delivered' ||
        intent == 'chat.room.sync' ||
        intent == 'chat.room.message' ||
        intent.startsWith('call.') ||
        intent.startsWith('profile.') ||
        intent.startsWith('bond.');
  }
  if (protocol == envoyMessageProtocol) {
    return intent != 'chat.message';
  }
  return false;
}
