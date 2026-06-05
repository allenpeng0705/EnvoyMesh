import { callGatewayTool } from "openclaw/plugin-sdk/agent-harness-runtime";
import type {
  AnyAgentTool,
  OpenClawPluginApi,
  OpenClawPluginToolContext,
} from "openclaw/plugin-sdk/core";
import {
  executeScheduledRemind,
  RemindSchema,
  type RemindCronAction,
  type RemindParams,
} from "./remind-logic.js";

type CronGatewayCaller = (params: RemindCronAction) => Promise<unknown>;

type RemindToolDeps = {
  callCron: CronGatewayCaller;
};

const DEFAULT_GATEWAY_TIMEOUT_MS = 60_000;

function unexpectedCronParams(params: never): never {
  throw new Error(`Unsupported reminder cron action: ${JSON.stringify(params)}`);
}

const defaultDeps: RemindToolDeps = {
  callCron: async (params) => {
    switch (params.action) {
      case "list":
        return await callGatewayTool("cron.list", { timeoutMs: DEFAULT_GATEWAY_TIMEOUT_MS }, {});
      case "remove":
        return await callGatewayTool(
          "cron.remove",
          { timeoutMs: DEFAULT_GATEWAY_TIMEOUT_MS },
          { jobId: params.jobId },
        );
      case "add":
        return await callGatewayTool(
          "cron.add",
          { timeoutMs: DEFAULT_GATEWAY_TIMEOUT_MS },
          { job: params.job },
        );
    }
    return unexpectedCronParams(params);
  },
};

export function createEnvoymeshRemindTool(
  toolContext: OpenClawPluginToolContext = {},
  deps: RemindToolDeps = defaultDeps,
): AnyAgentTool {
  return {
    name: "envoymesh_remind",
    label: "EnvoyMesh Reminder",
    description:
      "Create, list, and remove reminders that appear in the owner's EnvoyAI chat. " +
      "Use this instead of the generic cron tool for reminders. " +
      "Do not call cron after envoymesh_remind succeeds.\n" +
      'Create: action=add, content="drink water", time="5m"\n' +
      "List: action=list\n" +
      "Remove: action=remove, jobId=<id from list>\n" +
      'Time: "5m", "1h", "90s", or cron like "0 8 * * *"',
    parameters: RemindSchema,
    async execute(_toolCallId, params) {
      return await executeScheduledRemind(
        params as RemindParams,
        {
          fallbackTo: toolContext.deliveryContext?.to,
          fallbackAccountId: toolContext.deliveryContext?.accountId,
        },
        deps.callCron,
      );
    },
  };
}

export function registerEnvoymeshRemindTool(api: OpenClawPluginApi): void {
  api.registerTool((ctx) => createEnvoymeshRemindTool(ctx), { name: "envoymesh_remind" });
}
