import 'dart:async';
import 'dart:io';
import 'package:flutter/foundation.dart';

/// Result of a UPnP port mapping operation.
class UpnpResult {
  /// External/public IP address of the UPnP gateway.
  final String ip;

  /// Mapped external port.
  final int port;

  const UpnpResult({required this.ip, required this.port});
}

/// UPnP IGD client for Flutter.
///
/// Discovers UPnP gateways on the local network via SSDP,
/// gets the external IP, and requests port forwarding.
class UpnpClient {
  /// SSDP multicast address for UPnP IGD discovery.
  static const String _ssdpMulticastAddr = '239.255.255.250';
  static const int _ssdpPort = 1900;

  /// Default timeout for UPnP operations.
  static const Duration _timeout = Duration(seconds: 5);

  /// Default external port to request.
  static const int defaultExternalPort = 4001;

  /// Discover UPnP gateway and map a port.
  ///
  /// Returns [UpnpResult] with external IP and port if successful.
  /// Returns null if UPnP is not available or fails.
  static Future<UpnpResult?> mapPort({
    required int internalPort,
    int externalPort = defaultExternalPort,
    Duration timeout = _timeout,
  }) async {
    try {
      // Step 1: SSDP discovery to find UPnP gateway
      final gatewayUrl = await _discoverGateway(timeout);
      if (gatewayUrl == null) {
        return null;
      }

      // Step 2: Get external IP
      final externalIp = await _getExternalIp(gatewayUrl, timeout);
      if (externalIp == null) {
        return null;
      }

      // Reject private IPs (CGNAT detection)
      if (_isPrivateIp(externalIp)) {
        return null;
      }

      // Step 3: Try to map the port
      final mappedPort = await _mapPort(gatewayUrl, externalIp, externalPort, internalPort, timeout);
      if (mappedPort == null) {
        return null;
      }

      return UpnpResult(ip: externalIp, port: mappedPort);
    } catch (e) {
      return null;
    }
  }

  /// Remove a port mapping.
  static Future<bool> unmapPort({
    required int externalPort,
    Duration timeout = _timeout,
  }) async {
    try {
      final gatewayUrl = await _discoverGateway(timeout);
      if (gatewayUrl == null) return false;

      final uri = Uri.parse(gatewayUrl);
      final httpClient = HttpClient();
      httpClient.connectionTimeout = timeout;

      final request = await httpClient.openUrl('POST', uri);
      request.headers.set('SOAPACTION', '"urn:schemas-upnp-org:service:WANIPConnection:1#DeletePortMapping"');
      request.headers.set('Content-Type', 'text/xml; charset="utf-8"');

      final body = '<?xml version="1.0"?>'
          '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">'
          '<s:Body>'
          '<u:DeletePortMapping xmlns:u="urn:schemas-upnp-org:service:WANIPConnection:1">'
          '<NewRemoteHost></NewRemoteHost>'
          '<NewExternalPort>$externalPort</NewExternalPort>'
          '<NewProtocol>TCP</NewProtocol>'
          '</u:DeletePortMapping>'
          '</s:Body>'
          '</s:Envelope>';

      request.write(body);
      await request.close().timeout(timeout);
      return true;
    } catch (e) {
      return false;
    }
  }

  // ─── SSDP Discovery ────────────────────────────────────────────────────────

  static Future<String?> _discoverGateway(Duration timeout) async {
    final socket = await RawDatagramSocket.bind(InternetAddress.anyIPv4, 0);
    socket.broadcastEnabled = true;

    try {
      final ssdpRequest =
          'M-SEARCH * HTTP/1.1\r\n'
          'HOST: $_ssdpMulticastAddr:$_ssdpPort\r\n'
          'MAN: "ssdp:discover"\r\n'
          'MX: 3\r\n'
          'ST: urn:schemas-upnp-org:device:InternetGatewayDevice:1\r\n'
          '\r\n';

      final multicastAddr = InternetAddress(_ssdpMulticastAddr);
      socket.send(
        ssdpRequest.codeUnits,
        multicastAddr,
        _ssdpPort,
      );

      final completer = Completer<String?>();

      Timer(timeout, () {
        if (!completer.isCompleted) {
          completer.complete(null);
        }
      });

      socket.listen((event) {
        if (event == RawSocketEvent.read) {
          final dg = socket.receive();
          if (dg != null) {
            final data = String.fromCharCodes(dg.data);
            final match = RegExp(r'LOCATION:\s*(.+?)\r\n', caseSensitive: false).firstMatch(data);
            if (match != null) {
              final location = match.group(1)!.trim();
              if (!completer.isCompleted) {
                completer.complete(location);
              }
            }
          }
        }
      });

      return completer.future;
    } finally {
      socket.close();
    }
  }

  // ─── SOAP Requests ─────────────────────────────────────────────────────────

  static Future<String?> _getExternalIp(String gatewayUrl, Duration timeout) async {
    try {
      final uri = Uri.parse(gatewayUrl);
      final httpClient = HttpClient();
      httpClient.connectionTimeout = timeout;

      final request = await httpClient.openUrl('POST', uri);
      request.headers.set('SOAPACTION', '"urn:schemas-upnp-org:service:WANIPConnection:1#GetExternalIPAddress"');
      request.headers.set('Content-Type', 'text/xml; charset="utf-8"');

      final body = '<?xml version="1.0"?>'
          '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">'
          '<s:Body>'
          '<u:GetExternalIPAddress xmlns:u="urn:schemas-upnp-org:service:WANIPConnection:1">'
          '</u:GetExternalIPAddress>'
          '</s:Body>'
          '</s:Envelope>';

      request.write(body);

      final response = await request.close().timeout(timeout);
      final responseBody = await response.transform(const SystemEncoding().decoder).join();

      final match = RegExp(r'<NewExternalIPAddress>([^<]+)</NewExternalIPAddress>').firstMatch(responseBody);
      return match?.group(1);
    } catch (e) {
      return null;
    }
  }

  static Future<int?> _mapPort(
    String gatewayUrl,
    String externalIp,
    int externalPort,
    int internalPort,
    Duration timeout,
  ) async {
    try {
      final uri = Uri.parse(gatewayUrl);
      final httpClient = HttpClient();
      httpClient.connectionTimeout = timeout;

      final localIp = await _getLocalIp();

      final request = await httpClient.openUrl('POST', uri);
      request.headers.set('SOAPACTION', '"urn:schemas-upnp-org:service:WANIPConnection:1#AddPortMapping"');
      request.headers.set('Content-Type', 'text/xml; charset="utf-8"');

      final body = '<?xml version="1.0"?>'
          '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">'
          '<s:Body>'
          '<u:AddPortMapping xmlns:u="urn:schemas-upnp-org:service:WANIPConnection:1">'
          '<NewRemoteHost></NewRemoteHost>'
          '<NewExternalPort>$externalPort</NewExternalPort>'
          '<NewProtocol>TCP</NewProtocol>'
          '<NewInternalPort>$internalPort</NewInternalPort>'
          '<NewInternalClient>$localIp</NewInternalClient>'
          '<NewEnabled>1</NewEnabled>'
          '<NewPortMappingDescription>EnvoyMesh P2P</NewPortMappingDescription>'
          '<NewLeaseDuration>3600</NewLeaseDuration>'
          '</u:AddPortMapping>'
          '</s:Body>'
          '</s:Envelope>';

      request.write(body);

      final response = await request.close().timeout(timeout);

      if (response.statusCode >= 200 && response.statusCode < 300) {
        return externalPort;
      }

      // Try with any port
      return await _mapPortAny(gatewayUrl, localIp, internalPort, timeout);
    } catch (e) {
      return await _mapPortAny(gatewayUrl, await _getLocalIp(), internalPort, timeout);
    }
  }

  static Future<int?> _mapPortAny(
    String gatewayUrl,
    String localIp,
    int internalPort,
    Duration timeout,
  ) async {
    try {
      final uri = Uri.parse(gatewayUrl);
      final httpClient = HttpClient();
      httpClient.connectionTimeout = timeout;

      final request = await httpClient.openUrl('POST', uri);
      request.headers.set('SOAPACTION', '"urn:schemas-upnp-org:service:WANIPConnection:1#AddPortMapping"');
      request.headers.set('Content-Type', 'text/xml; charset="utf-8"');

      // Port 0 = let gateway assign any available port
      final body = '<?xml version="1.0"?>'
          '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">'
          '<s:Body>'
          '<u:AddPortMapping xmlns:u="urn:schemas-upnp-org:service:WANIPConnection:1">'
          '<NewRemoteHost></NewRemoteHost>'
          '<NewExternalPort>0</NewExternalPort>'
          '<NewProtocol>TCP</NewProtocol>'
          '<NewInternalPort>$internalPort</NewInternalPort>'
          '<NewInternalClient>$localIp</NewInternalClient>'
          '<NewEnabled>1</NewEnabled>'
          '<NewPortMappingDescription>EnvoyMesh P2P</NewPortMappingDescription>'
          '<NewLeaseDuration>3600</NewLeaseDuration>'
          '</u:AddPortMapping>'
          '</s:Body>'
          '</s:Envelope>';

      request.write(body);

      final response = await request.close().timeout(timeout);

      if (response.statusCode >= 200 && response.statusCode < 300) {
        // Query the assigned port
        return await _getAssignedPort(gatewayUrl, localIp, timeout);
      }

      return null;
    } catch (e) {
      return null;
    }
  }

  static Future<int?> _getAssignedPort(
    String gatewayUrl,
    String localIp,
    Duration timeout,
  ) async {
    try {
      final uri = Uri.parse(gatewayUrl);
      final httpClient = HttpClient();
      httpClient.connectionTimeout = timeout;

      // Search through port mapping entries
      for (int i = 0; i < 100; i++) {
        final request = await httpClient.openUrl('POST', uri);
        request.headers.set('SOAPACTION', '"urn:schemas-upnp-org:service:WANIPConnection:1#GetGenericPortMappingEntry"');
        request.headers.set('Content-Type', 'text/xml; charset="utf-8"');

        final body = '<?xml version="1.0"?>'
            '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">'
            '<s:Body>'
            '<u:GetGenericPortMappingEntry xmlns:u="urn:schemas-upnp-org:service:WANIPConnection:1">'
            '<NewPortMappingIndex>$i</NewPortMappingIndex>'
            '</u:GetGenericPortMappingEntry>'
            '</s:Body>'
            '</s:Envelope>';

        request.write(body);

        final response = await request.close().timeout(timeout);
        final responseBody = await response.transform(const SystemEncoding().decoder).join();

        final descMatch = RegExp(r'<NewPortMappingDescription>([^<]+)</NewPortMappingDescription>').firstMatch(responseBody);
        final extMatch = RegExp(r'<NewExternalPort>(\d+)</NewExternalPort>').firstMatch(responseBody);

        if (descMatch?.group(1) == 'EnvoyMesh P2P' && extMatch != null) {
          return int.tryParse(extMatch.group(1)!);
        }
      }
    } catch (e) {
      // ignore
    }
    return null;
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  static Future<String> _getLocalIp() async {
    try {
      final socket = await Socket.connect('8.8.8.8', 53);
      final localAddress = socket.address.address;
      await socket.close();
      return localAddress;
    } catch (e) {
      return '127.0.0.1';
    }
  }

  static bool _isPrivateIp(String ip) {
    if (ip == '127.0.0.1' || ip == '::1') return true;
    if (ip.startsWith('10.')) return true;
    if (ip.startsWith('192.168.')) return true;
    if (ip.startsWith('172.')) {
      final parts = ip.split('.');
      if (parts.length >= 2) {
        final second = int.tryParse(parts[1]) ?? 0;
        if (second >= 16 && second <= 31) return true;
      }
    }
    // RFC 6598 CGNAT range: 100.64.0.0/10 — carrier-grade NAT shared address space.
    if (ip.startsWith('100.')) {
      final parts = ip.split('.');
      if (parts.length >= 2) {
        final second = int.tryParse(parts[1]) ?? 0;
        if (second >= 64 && second <= 127) return true;
      }
    }
    if (ip.startsWith('fc00:') || ip.startsWith('fd') || ip.startsWith('fe80:')) return true;
    return false;
  }
}
