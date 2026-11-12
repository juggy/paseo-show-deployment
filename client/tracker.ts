import {
  openExternalUrl,
  type PluginButton,
  type PluginButtonRegistration,
  type PluginClientContext,
} from "@getpaseo/plugin/client";
import { type DeploymentState, deploymentStatusRpc } from "../shared/deployment";
import { statusIcon } from "./status-icon";

const BUTTON_ID = "deployment";
const PENDING_POLL_MS = 10_000;
const SETTLED_POLL_MS = 60_000;
const CLOSED_PR_POLL_MS = 5 * 60_000;
const ERROR_POLL_MS = 2 * 60_000;
/** A workspace update (new push, checks change) refreshes early if the last fetch is older than this. */
const NUDGE_AFTER_MS = 15_000;

export interface PullRequestInfo {
  url: string;
  open: boolean;
}

/** Polls the latest deployment for one workspace's PR and mirrors it into a header button. */
export class DeploymentTracker {
  private registration: PluginButtonRegistration | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private state: DeploymentState = { kind: "none" };
  private lastFetchAt = 0;
  private inFlight = false;
  private disposed = false;

  constructor(
    private readonly client: PluginClientContext,
    private readonly workspaceId: string,
    private pr: PullRequestInfo,
  ) {
    void this.poll();
  }

  get pullRequestUrl(): string {
    return this.pr.url;
  }

  /** Called on every workspace upsert for the same PR. */
  touch(pr: PullRequestInfo): void {
    this.pr = pr;
    if (!this.inFlight && Date.now() - this.lastFetchAt > NUDGE_AFTER_MS) void this.poll();
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.registration?.remove();
    this.registration = null;
  }

  private async poll(): Promise<void> {
    if (this.disposed || this.inFlight) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.inFlight = true;
    let delay: number;
    try {
      this.state = await this.client.rpc(deploymentStatusRpc, { pullRequestUrl: this.pr.url });
      delay = this.delayFor(this.state);
    } catch (error) {
      // Keep showing the last known state; transient gh/network failures should not flicker the icon.
      console.warn("[deployment] status fetch failed", error);
      delay = ERROR_POLL_MS;
    } finally {
      this.inFlight = false;
      this.lastFetchAt = Date.now();
    }
    if (this.disposed) return;
    this.render();
    this.timer = setTimeout(() => void this.poll(), delay);
  }

  private delayFor(state: DeploymentState): number {
    if (state.kind === "deployment" && state.tone === "pending") return PENDING_POLL_MS;
    return this.pr.open ? SETTLED_POLL_MS : CLOSED_PR_POLL_MS;
  }

  private render(): void {
    const state = this.state;
    if (state.kind === "none") {
      this.registration?.update({ visible: false });
      return;
    }
    const target = state.tone === "pending" ? (state.logUrl ?? state.url) : (state.url ?? state.logUrl);
    const commitNote = state.isHead ? "" : ` (earlier commit ${state.sha.slice(0, 7)})`;
    const button: PluginButton = {
      title: `${state.environment} deployment: ${state.state.toLowerCase().replace(/_/g, " ")}${commitNote}`,
      icon: statusIcon(state.tone),
      visible: true,
      disabled: target === null,
      behavior: {
        kind: "action",
        async onPress() {
          if (target) await openExternalUrl(target);
        },
      },
    };
    if (this.registration) {
      this.registration.update(button);
    } else {
      this.registration = this.client.addHeaderButton({ id: BUTTON_ID, workspaceId: this.workspaceId, button });
    }
  }
}
