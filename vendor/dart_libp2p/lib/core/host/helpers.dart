/// Helper functions for working with Host objects.

import '../peer/addr_info.dart';
import 'host.dart';

/// InfoFromHost returns an AddrInfo struct with the Host's ID and all of its Addrs.
AddrInfo infoFromHost(Host h) {
  return AddrInfo(
    h.id,
    h.addrs,
  );
}