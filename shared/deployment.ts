import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const deploymentToneSchema = z.enum(["pending", "success", "failure", "inactive"]);
export type DeploymentTone = z.infer<typeof deploymentToneSchema>;

export const deploymentStateSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("none") }),
  z.object({
    kind: z.literal("deployment"),
    tone: deploymentToneSchema,
    /** Raw GitHub state, e.g. IN_PROGRESS, SUCCESS, FAILURE. */
    state: z.string(),
    environment: z.string(),
    url: z.string().nullable(),
    logUrl: z.string().nullable(),
    updatedAt: z.string(),
    sha: z.string(),
    /** False when the deployment belongs to an earlier commit than the PR head. */
    isHead: z.boolean(),
  }),
]);
export type DeploymentState = z.infer<typeof deploymentStateSchema>;

export const deploymentStatusRpc = defineRpc({
  name: "deployment.status",
  input: z.object({ pullRequestUrl: z.string() }),
  output: deploymentStateSchema,
});
