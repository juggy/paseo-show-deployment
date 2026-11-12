import type { PluginClientContext } from "@getpaseo/plugin/client";
import { DeploymentTracker, type PullRequestInfo } from "./client/tracker";

type WorkspaceEntry = Awaited<ReturnType<PluginClientContext["paseo"]["workspaces"]["list"]>>["entries"][number];

function pullRequestOf(workspace: WorkspaceEntry): PullRequestInfo | null {
  if (workspace.projectKind !== "git" || workspace.archivingAt) return null;
  const pr = workspace.githubRuntime?.pullRequest;
  if (!pr?.url) return null;
  return { url: pr.url, open: !pr.isMerged && pr.state.toLowerCase() === "open" };
}

export default function contribute(client: PluginClientContext) {
  const trackers = new Map<string, DeploymentTracker>();
  let stopped = false;
  let release: (() => void) | null = null;

  const drop = (workspaceId: string) => {
    trackers.get(workspaceId)?.dispose();
    trackers.delete(workspaceId);
  };

  const sync = (workspace: WorkspaceEntry) => {
    const pr = pullRequestOf(workspace);
    const existing = trackers.get(workspace.id);
    if (!pr) return drop(workspace.id);
    if (existing?.pullRequestUrl === pr.url) return existing.touch(pr);
    drop(workspace.id);
    trackers.set(workspace.id, new DeploymentTracker(client, workspace.id, pr));
  };

  const dropAll = () => {
    for (const id of [...trackers.keys()]) drop(id);
  };

  void client.paseo.workspaces
    .list({ subscribe: {}, page: { limit: 200 } })
    .then(({ subscription }) => {
      if (stopped) {
        void subscription.release();
        return;
      }
      const unsubscribe = subscription.subscribe({
        snapshot: ({ entries }) => {
          const seen = new Set(entries.map((entry) => entry.id));
          for (const id of [...trackers.keys()]) if (!seen.has(id)) drop(id);
          for (const entry of entries) sync(entry);
        },
        update: (message) => {
          if (message.type !== "workspace_update") return;
          const update = message.payload;
          if (update.kind === "upsert") sync(update.workspace);
          else drop(update.id);
        },
        error: (error) => console.error("[deployment] workspace observation failed", error),
      });
      release = () => {
        unsubscribe();
        void subscription.release();
      };
    })
    .catch((error) => {
      if (!stopped) console.error("[deployment] workspace observation failed", error);
    });

  return () => {
    stopped = true;
    release?.();
    dropAll();
  };
}
