import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "mesh.envoy.app",
  appName: "EnvoyMesh",
  webDir: "../social/dist",
  server: {
    // On iOS, the default scheme is `capacitor://`. Allow it.
    iosScheme: "capacitor",
  },
  plugins: {
    CapacitorSQLite: {
      iosIsEncryption: true,
      iosKeychainPrefix: "envoymesh",
    },
  },
  ios: {
    contentInset: "automatic",
  },
  android: {
    backgroundColor: "#0f0f0f",
  },
};

export default config;
