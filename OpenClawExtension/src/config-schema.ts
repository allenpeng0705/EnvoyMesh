import { buildChannelConfigSchema } from "openclaw/plugin-sdk/channel-config-schema";
import { z } from "zod";

export const EnvoymeshChannelConfigSchema = buildChannelConfigSchema(
  z
    .object({
      bridgeUrl: z.string().optional(),
      bridgeSecret: z.string().optional(),
      inboundSecret: z.string().optional(),
      webhookPath: z.string().optional(),
      dmPolicy: z.enum(["open", "allowlist", "disabled"]).optional(),
      allowedOwnerIds: z.union([z.string(), z.array(z.string())]).optional(),
    })
    .passthrough(),
);
