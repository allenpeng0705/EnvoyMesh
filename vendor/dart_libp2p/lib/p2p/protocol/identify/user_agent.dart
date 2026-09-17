/// User agent for the identify service.
///
/// This file contains the default user agent for the identify service.
///
/// This is a port of the Go implementation from go-libp2p/p2p/protocol/identify/user_agent.go
/// to Dart, using native Dart idioms.

import 'dart:io' show Platform;

/// The default user agent for the identify service.
/// This is set to a default value initially, but will be updated when
/// [initUserAgent] is called.
String defaultUserAgent = 'dart-libp2p';

/// Initializes the default user agent based on the package information.
/// 
/// This should be called early in the application lifecycle, typically
/// during the initialization of the libp2p node.
Future<void> initUserAgent() async {
  try {
    final os = Platform.operatingSystem;
    final arch = Platform.version.split(' ').last;
    defaultUserAgent = 'dart-libp2p/$os/$arch';
  } catch (e) {
    // If we can't get the package info, just use the default
    defaultUserAgent = 'dart-libp2p';
  }
}