// Copyright (c) 2022 The dart-libp2p Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

import 'package:dart_libp2p/p2p/protocol/circuitv2/relay/resources.dart';

/// Options for the relay service.
class RelayOptions {
  /// The resources for the relay service.
  Resources _resources;

  /// Creates new relay options.
  RelayOptions({
    Resources? resources,
  }) : _resources = resources ?? Resources();
}

/// Option is a function that configures a RelayOptions.
typedef Option = void Function(RelayOptions options);

/// WithResources sets the resources for the relay service.
Option withResources(Resources resources) {
  return (options) {
    options._resources = resources;
  };
}

/// WithMaxReservations sets the maximum number of concurrent reservations.
Option withMaxReservations(int maxReservations) {
  return (options) {
    options._resources = Resources(
      maxReservations: maxReservations,
      maxConnections: options._resources.maxConnections,
      reservationTtl: options._resources.reservationTtl,
      connectionDuration: options._resources.connectionDuration,
      connectionData: options._resources.connectionData,
    );
  };
}

/// WithMaxConnections sets the maximum number of concurrent connections.
Option withMaxConnections(int maxConnections) {
  return (options) {
    options._resources = Resources(
      maxReservations: options._resources.maxReservations,
      maxConnections: maxConnections,
      reservationTtl: options._resources.reservationTtl,
      connectionDuration: options._resources.connectionDuration,
      connectionData: options._resources.connectionData,
    );
  };
}

/// WithReservationTtl sets the time-to-live for reservations in seconds.
Option withReservationTtl(int reservationTtl) {
  return (options) {
    options._resources = Resources(
      maxReservations: options._resources.maxReservations,
      maxConnections: options._resources.maxConnections,
      reservationTtl: reservationTtl,
      connectionDuration: options._resources.connectionDuration,
      connectionData: options._resources.connectionData,
    );
  };
}

/// WithConnectionDuration sets the maximum duration for connections in seconds.
Option withConnectionDuration(int connectionDuration) {
  return (options) {
    options._resources = Resources(
      maxReservations: options._resources.maxReservations,
      maxConnections: options._resources.maxConnections,
      reservationTtl: options._resources.reservationTtl,
      connectionDuration: connectionDuration,
      connectionData: options._resources.connectionData,
    );
  };
}

/// WithConnectionData sets the maximum data transfer for connections in bytes.
Option withConnectionData(int connectionData) {
  return (options) {
    options._resources = Resources(
      maxReservations: options._resources.maxReservations,
      maxConnections: options._resources.maxConnections,
      reservationTtl: options._resources.reservationTtl,
      connectionDuration: options._resources.connectionDuration,
      connectionData: connectionData,
    );
  };
}