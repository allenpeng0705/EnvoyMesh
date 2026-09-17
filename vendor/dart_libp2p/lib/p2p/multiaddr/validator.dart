import 'dart:typed_data';
import 'protocol.dart';

/// Validator for multiaddr protocol values
class MultiAddrValidator {
  /// Validates a protocol value before encoding
  static void validateValue(Protocol protocol, String value) {
    switch (protocol.name) {
      case 'ip4':
        _validateIP4(value);
        break;
      case 'ip6':
        _validateIP6(value);
        break;
      case 'tcp':
      case 'udp':
        _validatePort(value);
        break;
      case 'dns4':
      case 'dns6':
      case 'dnsaddr':
        _validateDNS(value);
        break;
      case 'p2p':
        _validateP2P(value);
        break;
      case 'unix':
        _validateUnixPath(value);
        break;
      default:
        // Allow protocols with size 0 (no value to validate) or variable size.
        // Throw only if it's a fixed, non-zero size protocol not explicitly handled.
        // Protocols with size 0 (like udx, quic-v1) have no value part to validate.
        // Protocols with size -1 (variable, like dns, p2p) have their values validated by other means or not at all here.
        if (protocol.size > 0) { 
          // This condition means it's a protocol with a fixed-size value that isn't one of the handled cases.
          throw ArgumentError('Unsupported protocol with fixed-size value: ${protocol.name}');
        }
        // If size is 0 or -1, and not handled by a specific case, validation passes here.
        break;
    }
  }

  /// Validates IPv4 address format
  static void _validateIP4(String value) {
    final parts = value.split('.');
    if (parts.length != 4) {
      throw FormatException('Invalid IPv4 address: wrong number of parts');
    }

    for (final part in parts) {
      final num = int.tryParse(part);
      if (num == null || num < 0 || num > 255) {
        throw FormatException('Invalid IPv4 address: invalid octet value');
      }
    }
  }
  /// Validates IPv6 address format
  static void _validateIP6(String value) {
    // Remove zone identifier if present (e.g., %30)
    final cleanValue = value.split('%')[0];

    // Check for double colon compression
    final compressionCount = '::'.allMatches(cleanValue).length;

    if (compressionCount > 1) {
      throw FormatException('Invalid IPv6 address: multiple :: compression markers');
    }

    final hasCompression = compressionCount == 1;

    if (hasCompression) {
      _validateCompressedIPv6(cleanValue);
    } else {
      _validateUncompressedIPv6(cleanValue);
    }
  }

  /// Validates uncompressed IPv6 address (no :: notation)
  static void _validateUncompressedIPv6(String value) {
    final parts = value.split(':');

    if (parts.length != 8) {
      throw FormatException('Invalid IPv6 address: must have exactly 8 segments without compression');
    }

    _validateSegments(parts);
  }

  /// Validates compressed IPv6 address (with :: notation)
  static void _validateCompressedIPv6(String value) {
    // Handle edge cases
    if (value == '::') {
      return; // Valid: all zeros
    }

    if (value.startsWith('::')) {
      // e.g., "::1" or "::ffff:192.0.2.1"
      final rightPart = value.substring(2);
      if (rightPart.isEmpty) return; // "::" case already handled

      final rightSegments = rightPart.split(':');
      if (rightSegments.length >= 8) {
        throw FormatException('Invalid IPv6 address: too many segments after ::');
      }
      _validateSegments(rightSegments);

    } else if (value.endsWith('::')) {
      // e.g., "2001:db8::"
      final leftPart = value.substring(0, value.length - 2);
      final leftSegments = leftPart.split(':');
      if (leftSegments.length >= 8) {
        throw FormatException('Invalid IPv6 address: too many segments before ::');
      }
      _validateSegments(leftSegments);

    } else {
      // e.g., "2001:db8::1" or "fdc5:3e28:8691::2"
      final parts = value.split('::');
      if (parts.length != 2) {
        throw FormatException('Invalid IPv6 address: malformed :: compression');
      }

      final leftSegments = parts[0].isEmpty ? <String>[] : parts[0].split(':');
      final rightSegments = parts[1].isEmpty ? <String>[] : parts[1].split(':');

      final totalSegments = leftSegments.length + rightSegments.length;
      if (totalSegments >= 8) {
        throw FormatException('Invalid IPv6 address: too many segments with compression');
      }

      _validateSegments([...leftSegments, ...rightSegments]);
    }
  }

  /// Validates individual IPv6 segments
  static void _validateSegments(List<String> segments) {
    for (final segment in segments) {
      if (segment.isEmpty) {
        throw FormatException('Invalid IPv6 address: empty segment');
      }

      if (segment.length > 4) {
        throw FormatException('Invalid IPv6 address: segment too long');
      }

      // Check for valid hexadecimal characters
      if (!RegExp(r'^[0-9a-fA-F]+$').hasMatch(segment)) {
        throw FormatException('Invalid IPv6 address: invalid characters in segment');
      }

      final num = int.tryParse(segment, radix: 16);
      if (num == null || num < 0 || num > 0xFFFF) {
        throw FormatException('Invalid IPv6 address: invalid segment value');
      }
    }
  }

  // /// Validates IPv6 address format
  // static void _validateIP6(String value) {
  //   final parts = value.split(':');
  //
  //   // Check for compression marker ::
  //   var compressionIndex = parts.indexOf('');
  //   if (compressionIndex != -1) {
  //     if (parts.lastIndexOf('') != (compressionIndex + 1 == parts.length ? compressionIndex : compressionIndex + 1)) {
  //       throw FormatException('Invalid IPv6 address: multiple compression markers');
  //     }
  //   }
  //
  //   // Count actual parts (excluding compression)
  //   var actualParts = parts.where((part) => part.isNotEmpty).length;
  //   var expectedParts = 8;
  //
  //   if (compressionIndex != -1) {
  //     expectedParts -= (8 - actualParts);
  //     if (actualParts > 7) {
  //       throw FormatException('Invalid IPv6 address: too many segments with compression');
  //     }
  //   } else if (actualParts != 8) {
  //     throw FormatException('Invalid IPv6 address: wrong number of segments');
  //   }
  //
  //   // Validate each part
  //   for (final part in parts.where((part) => part.isNotEmpty)) {
  //     if (part.length > 4) {
  //       throw FormatException('Invalid IPv6 address: segment too long');
  //     }
  //     final num = int.tryParse(part, radix: 16);
  //     if (num == null || num < 0 || num > 0xFFFF) {
  //       throw FormatException('Invalid IPv6 address: invalid segment value');
  //     }
  //   }
  // }

  /// Validates port number
  static void _validatePort(String value) {
    final port = int.tryParse(value);
    if (port == null || port < 0 || port > 65535) {
      throw FormatException('Invalid port number: must be between 0 and 65535');
    }
  }

  /// Validates DNS name
  static void _validateDNS(String value) {
    if (value.isEmpty || value.length > 253) {
      throw FormatException('Invalid DNS name: length must be between 1 and 253 characters');
    }

    final labels = value.split('.');
    if (labels.any((label) => label.isEmpty || label.length > 63)) {
      throw FormatException('Invalid DNS name: label length must be between 1 and 63 characters');
    }

    // RFC 1035 compliance check
    final validLabel = RegExp(r'^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$');
    if (labels.any((label) => !validLabel.hasMatch(label))) {
      throw FormatException('Invalid DNS name: invalid character in label');
    }
  }

  /// Validates P2P ID (base58-encoded multihash)
  static void _validateP2P(String value) {
    // Basic validation for now - should be enhanced with proper base58 check
    if (value.isEmpty) {
      throw FormatException('Invalid P2P ID: empty value');
    }

    // Check for valid base58 characters
    final validBase58 = RegExp(r'^[1-9A-HJ-NP-Za-km-z]+$');
    if (!validBase58.hasMatch(value)) {
      throw FormatException('Invalid P2P ID: invalid base58 character');
    }
  }

  /// Validates Unix path
  static void _validateUnixPath(String value) {
    if (value.isEmpty) {
      throw FormatException('Invalid Unix path: empty path');
    }

    // Check for null bytes which are not allowed in paths
    if (value.contains('\x00')) {
      throw FormatException('Invalid Unix path: contains null byte');
    }

    // Basic path validation
    if (!value.startsWith('/')) {
      throw FormatException('Invalid Unix path: must be absolute path');
    }
  }
}
