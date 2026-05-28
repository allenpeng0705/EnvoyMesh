import {
  defineBundledChannelEntry,
  loadBundledEntryExportSync,
  type OpenClawPluginApi,
} from "openclaw/plugin-sdk/channel-entry-contract";

function registerEnvoymeshFull(api: OpenClawPluginApi): void {
  const register = loadBundledEntryExportSync<(api: OpenClawPluginApi) => void>(import.meta.url, {
    specifier: "./api.js",
    exportName: "registerEnvoymeshFull",
  });
  register(api);
}

export default defineBundledChannelEntry({
  id: "envoymesh",
  name: "EnvoyMesh",
  description: "EnvoyMesh P2P bridge channel plugin for OpenClaw",
  importMetaUrl: import.meta.url,
  plugin: {
    specifier: "./channel-plugin-api.js",
    exportName: "envoymeshPlugin",
  },
  runtime: {
    specifier: "./api.js",
    exportName: "setEnvoymeshRuntime",
  },
  registerFull: registerEnvoymeshFull,
});
