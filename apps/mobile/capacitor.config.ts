import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "mesh.envoy.app",
  appName: "EnvoyMesh",
  webDir: "dist",
  server: {
    // On iOS, the default scheme is `capacitor://`. Allow it.
    iosScheme: "capacitor",
    // Allow navigation to capacitor:// origins
    allowNavigation: ["capacitor://*"],
  },
  plugins: {
    CapacitorSQLite: {
      iosIsEncryption: true,
      iosKeychainPrefix: "envoymesh",
    },
  },
  ios: {
    contentInset: "automatic",
    // Match the body / surface colors so that the home-indicator and
    // notch areas are the same shade as the rest of the app. Without this,
    // any sliver of WebView not covered by the page renders as the
    // default white and shows up as a gap below the tab bar.
    backgroundColor: "#ffffff",
  },
  android: {
    backgroundColor: "#0f0f0f",
  },
};

// Native classes implementing CAPPlugin to be auto-registered by Capacitor.
// EnvoyQrScanner is a local Pod (see apps/mobile/ios/App/Podfile) that
// exposes a native AVCapture-based QR scanner. The community barcode
// scanner is kept for Android (ZXing) only; on iOS we now prefer our own.
// packageClassList is a valid runtime key in Capacitor's config schema but
// is not exposed in the public TypeScript types.
type ConfigWithNative = CapacitorConfig & { packageClassList?: string[] };

export default {
  ...config,
  packageClassList: [
    "BarcodeScanner",
    "CapacitorSQLitePlugin",
    "EnvoyQrScanner",
    "FilesystemPlugin",
    "SecureStoragePlugin",
  ],
} satisfies ConfigWithNative;
