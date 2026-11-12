# paseo-show-deployment

A [Paseo](https://paseo.sh) plugin that shows the latest GitHub deployment for a workspace's pull request in the workspace header.

- A rocket icon shows the deployment state: yellow and pulsing while queued or in progress, green on success, red on failure, grey when inactive.
- Clicking the rocket opens the deployed environment URL, or the deployment log when there is no environment URL.
- The chevron next to it opens a menu with **Open in browser** and **Copy link**.
- Hover the icon to see the environment name and state.

The icon appears only for workspaces linked to a GitHub pull request whose recent commits have a deployment, for example preview environments created per PR.

## Requirements

- Paseo 0.15.4 or later.
- Plugins enabled on the daemon: **Settings → Plugins → Enable plugins**, or `"pluginsEnabled": true` in `~/.paseo/config.json` followed by `paseo reload`.
- The [GitHub CLI](https://cli.github.com) installed on the daemon machine and signed in with access to your repositories:

  ```bash
  brew install gh
  gh auth login
  ```

## Install

From GitHub:

```bash
paseo plugin install github:juggy/paseo-show-deployment
paseo plugin ls   # paseo-show-deployment should be "running"
```

To target a remote daemon, add `--host <url>`.

Open a workspace whose branch has a pull request with a deployment, and the icon appears in the header. On phones and narrow windows it appears in the workspace `···` menu.

### Update or remove

```bash
paseo plugin update paseo-show-deployment
paseo plugin remove paseo-show-deployment
```

## Develop locally

```bash
git clone https://github.com/juggy/paseo-show-deployment.git
cd paseo-show-deployment
npm install
npm run typecheck
paseo plugin install "$PWD"
```

After editing the source, run `npm run typecheck` and `paseo plugin reload paseo-show-deployment`. You don't need to restart the daemon.

## Troubleshooting

- **No icon:** check that `paseo plugin ls` shows `running`, the workspace has a pull request, and one of its last ten commits has a GitHub deployment.
- **Errors:** run `paseo plugin logs paseo-show-deployment`. A failed `gh` call is logged there, for example when `gh` isn't signed in or can't access the repository.
- **`gh` not found:** the plugin looks on the daemon's PATH, then in `/opt/homebrew/bin`, `/usr/local/bin`, and `/usr/bin`.

## How it works

The daemon side runs one `gh api graphql` query per pull request. The query reads the head commit and the newest deployment on the pull request's last ten commits. The app polls every 10 seconds while a deployment is in progress, every minute once settled, and every 5 minutes for closed or merged pull requests.
