import { z } from "zod";

export const BridgeConfigSchema = z.object({
  enabled: z.boolean().default(false),
  agentUrl: z.string().url().default("http://localhost:8080/message"),
  listenPort: z.number().int().min(1024).max(65535).default(3031),
  secret: z.string().min(16).optional(),
  agentName: z.string().default("My Agent"),
});

export type BridgeConfig = z.infer<typeof BridgeConfigSchema>;

export const DEFAULT_BRIDGE_CONFIG: BridgeConfig = {
  enabled: false,
  agentUrl: "http://localhost:8080/message",
  listenPort: 3031,
  agentName: "My Agent",
};
