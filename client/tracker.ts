import {
  openExternalUrl,
  type PluginButton,
  type PluginButtonRegistration,
  type PluginClientContext,
} from "@getpaseo/plugin/client";
import { copyText } from "@getpaseo/plugin/client/ui";
import { type DeploymentState, deploymentStatusRpc } from "../shared/deployment";
import { statusIcon } from "./status-icon";

const BUTTON_ID = "deployment";
const MENU_ID = "deployment-menu";
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
  private menuRegistration: PluginButtonRegistration | null = null;
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
    this.menuRegistration?.remove();
    this.menuRegistration = null;
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
      this.menuRegistration?.update({ visible: false });
      return;
    }
    // Prefer the deployed app; fall back to the log only when the deployment has no environment URL.
    const target = state.url ?? state.logUrl;
    const commitNote = state.isHead ? "" : ` (earlier commit ${state.sha.slice(0, 7)})`;
    const title = `${state.environment} deployment: ${state.state.toLowerCase().replace(/_/g, " ")}${commitNote}`;
    const open = async () => {
      if (target) await openExternalUrl(target);
    };

    // Paseo has no split button, so the "split" is a status button followed by a chevron menu button.
    const main: PluginButton = {
      title,
      icon: statusIcon(state.tone),
      visible: true,
      disabled: target === null,
      behavior: { kind: "action", onPress: open },
    };
    const menu: PluginButton = {
      title: "Deployment actions",
      icon: "ChevronDown",
      visible: true,
      disabled: target === null,
      behavior: {
        kind: "menu",
        items: [
          {
            kind: "item",
            id: "open",
            title: "Open in browser",
            icon: "ExternalLink",
            behavior: { kind: "action", onPress: open },
          },
          {
            kind: "item",
            id: "copy",
            title: "Copy link",
            icon: "Copy",
            behavior: {
              kind: "action",
              async onPress() {
                if (target) await copyText(target);
              },
            },
          },
        ],
      },
    };

    if (this.registration) this.registration.update(main);
    else this.registration = this.client.addHeaderButton({ id: BUTTON_ID, workspaceId: this.workspaceId, button: main });
    if (this.menuRegistration) this.menuRegistration.update(menu);
    else this.menuRegistration = this.client.addHeaderButton({ id: MENU_ID, workspaceId: this.workspaceId, button: menu });
  }
}
