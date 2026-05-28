import { createPluginRuntimeStore, type PluginRuntime } from "openclaw/plugin-sdk/runtime-store";

const { setRuntime: setEnvoymeshRuntime, getRuntime: getEnvoymeshRuntime } =
  createPluginRuntimeStore<PluginRuntime>({
    pluginId: "envoymesh",
    errorMessage: "EnvoyMesh runtime not initialized - plugin not registered",
  });
export { getEnvoymeshRuntime, setEnvoymeshRuntime };
