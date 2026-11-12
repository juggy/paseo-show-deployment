import type { PluginServerContext } from "@getpaseo/plugin/server";
import { deploymentStatus } from "./server/github";
import { deploymentStatusRpc } from "./shared/deployment";

export default function contribute(server: PluginServerContext) {
  server.handle(deploymentStatusRpc, async (input) => {
    try {
      return await deploymentStatus(input);
    } catch (error) {
      console.error(`[deployment] ${input.pullRequestUrl}:`, error instanceof Error ? error.message : error);
      throw error;
    }
  });
  return () => {};
}
