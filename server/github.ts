/// <reference types="node" />
import type { RpcInput } from "@getpaseo/plugin";
import { execFile } from "node:child_process";
import type { DeploymentState, DeploymentTone, deploymentStatusRpc } from "../shared/deployment";

/** How many recent PR commits to search for the newest deployment. */
const COMMIT_WINDOW = 10;

const QUERY = `
query($owner: String!, $name: String!, $number: Int!, $commits: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      headRefOid
      commits(last: $commits) {
        nodes {
          commit {
            oid
            deployments(last: 1) {
              nodes {
                createdAt
                environment
                state
                latestStatus { state environmentUrl logUrl createdAt }
              }
            }
          }
        }
      }
    }
  }
}`;

interface DeploymentNode {
  createdAt: string;
  environment: string | null;
  state: string | null;
  latestStatus: {
    state: string;
    environmentUrl: string | null;
    logUrl: string | null;
    createdAt: string;
  } | null;
}

interface QueryResult {
  data?: {
    repository: {
      pullRequest: {
        headRefOid: string;
        commits: {
          nodes: { commit: { oid: string; deployments: { nodes: DeploymentNode[] } } }[];
        };
      } | null;
    } | null;
  };
  errors?: { message: string }[];
}

interface PullRequestRef {
  host: string;
  owner: string;
  name: string;
  number: number;
}

export function parsePullRequestUrl(url: string): PullRequestRef | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const match = /^\/([^/]+)\/([^/]+)\/pull\/(\d+)/.exec(parsed.pathname);
  if (!match) return null;
  return { host: parsed.hostname, owner: match[1], name: match[2], number: Number(match[3]) };
}

export function toneFor(state: string): DeploymentTone {
  switch (state.toUpperCase()) {
    case "SUCCESS":
    case "ACTIVE":
      return "success";
    case "FAILURE":
    case "ERROR":
      return "failure";
    case "INACTIVE":
    case "DESTROYED":
    case "ABANDONED":
      return "inactive";
    default:
      // QUEUED, PENDING, IN_PROGRESS, WAITING, and anything new.
      return "pending";
  }
}

/** GUI-launched daemons often miss the shell PATH, so fall back to the usual install locations. */
const GH_CANDIDATES = ["gh", "/opt/homebrew/bin/gh", "/usr/local/bin/gh", "/usr/bin/gh"];
let resolvedGh: string | null = null;

function run(binary: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(binary, args, { timeout: 20_000, maxBuffer: 4 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        const wrapped = new Error(`gh ${args[0]} failed: ${stderr.trim() || error.message}`);
        (wrapped as Error & { code?: unknown }).code = (error as NodeJS.ErrnoException).code;
        reject(wrapped);
        return;
      }
      resolve(stdout);
    });
  });
}

async function gh(args: string[]): Promise<string> {
  if (resolvedGh) return run(resolvedGh, args);
  for (const candidate of GH_CANDIDATES) {
    try {
      const output = await run(candidate, args);
      resolvedGh = candidate;
      return output;
    } catch (error) {
      if ((error as { code?: unknown }).code !== "ENOENT") {
        resolvedGh = candidate;
        throw error;
      }
    }
  }
  throw new Error("GitHub CLI (gh) not found on the daemon machine");
}

export async function deploymentStatus({
  pullRequestUrl,
}: RpcInput<typeof deploymentStatusRpc>): Promise<DeploymentState> {
  const pr = parsePullRequestUrl(pullRequestUrl);
  if (!pr) return { kind: "none" };

  const args = [
    "api",
    "graphql",
    "-f",
    `query=${QUERY}`,
    "-F",
    `owner=${pr.owner}`,
    "-F",
    `name=${pr.name}`,
    "-F",
    `number=${pr.number}`,
    "-F",
    `commits=${COMMIT_WINDOW}`,
  ];
  if (pr.host !== "github.com") args.push("--hostname", pr.host);

  const result = JSON.parse(await gh(args)) as QueryResult;
  if (result.errors?.length) {
    throw new Error(`GitHub GraphQL error: ${result.errors.map((e) => e.message).join("; ")}`);
  }
  const pullRequest = result.data?.repository?.pullRequest;
  if (!pullRequest) return { kind: "none" };

  // Newest commit first; take the first one that has a deployment.
  const commits = [...pullRequest.commits.nodes].reverse();
  for (const { commit } of commits) {
    const deployment = commit.deployments.nodes.at(-1);
    if (!deployment) continue;
    const status = deployment.latestStatus;
    const state = status?.state ?? deployment.state ?? "PENDING";
    return {
      kind: "deployment",
      tone: toneFor(state),
      state,
      environment: deployment.environment ?? "deployment",
      url: status?.environmentUrl || null,
      logUrl: status?.logUrl || null,
      updatedAt: status?.createdAt ?? deployment.createdAt,
      sha: commit.oid,
      isHead: commit.oid === pullRequest.headRefOid,
    };
  }
  return { kind: "none" };
}
