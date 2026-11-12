Shows the latest GitHub deployment for a workspace's pull request as a rocket icon in the workspace header. The icon is yellow and pulsing while the deployment is queued or in progress, green when it succeeded, red when it failed, and grey when it is inactive. Clicking it opens a menu with Open in browser and Copy link. Both use the deployed environment URL, or the deployment log when the deployment has no environment URL. Hover the icon to see the environment name and state.

The icon appears only for workspaces that Paseo has linked to a GitHub pull request, and only when one of the pull request's last ten commits has a deployment. If the newest deployment belongs to an earlier commit than the pull request head, the tooltip says so.

## Setup

The daemon machine needs the GitHub CLI (`gh`) installed and signed in with access to the repository. The plugin looks for `gh` on the daemon's PATH, then in `/opt/homebrew/bin`, `/usr/local/bin`, and `/usr/bin`. GitHub Enterprise hosts work when `gh` is signed in to that host.

## What it reads and how often

The daemon runs one GitHub GraphQL query per pull request through `gh`. It reads the pull request head commit and the deployments on its recent commits. It sends nothing else anywhere. It polls every 10 seconds while a deployment is in progress, every minute once settled, and every 5 minutes for closed or merged pull requests. Workspace activity, such as a new push, triggers an earlier refresh.

## Limits

Plugins cannot add to the built-in pull request badge, so the icon is a header button placed just before Paseo's built-in header actions. Paseo has no split button, so opening the URL takes two clicks. On phones and narrow windows it appears as a row in the workspace menu. Deployments that GitHub does not attach to a pull request commit are not shown.
