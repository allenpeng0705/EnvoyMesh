/**
 * Back-compat re-export for older imports.
 * Live native scanning: `scanEnvoyPairUriNative` (uses @capacitor/barcode-scanner on iOS/Android,
 * BarcodeDetector on web). Image-based scanning: `decodeEnvoyPairUriFromFile`.
 */
export { scanEnvoyPairUriNative } from "./scan-envoy-pair-native.js";
export {
  assertEnvoyPairQrText,
  decodeEnvoyPairUriFromFile,
  decodeQrTextFromImageSource,
} from "./decode-envoy-pair-qr.js";
