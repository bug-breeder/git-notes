# 📒 Git Notes

A ZeppOS mini-app for Amazfit smartwatches that syncs your GitHub markdown notes for offline reading on your wrist.

## Features

- **GitHub login** via Device Flow OAuth (no redirect needed, works from the Zepp app)
- **Folder navigation** — browse your repo directory by directory on the watch
- **Offline reading** — notes are stored on the watch after sync
- **Markdown rendering** — headings, lists, quotes, and code blocks rendered as readable plain text
- **One-tap sync** — pull the latest changes from GitHub whenever you want
- **File filtering** — only downloads `.md`, `.markdown`, and `.txt` files by default (configurable)

## Screenshots

> _Coming soon_

## Supported Devices

Amazfit Balance, Balance 2, Active, Active 2, Active Edge, Bip 5, Bip 5 Unity, Bip 6, GTR Mini, GTR 3, GTR 3 Pro, GTR 4, GTR 4 LE, GTS 3, GTS 4, GTS 4 Mini, T-Rex 2, T-Rex 3, T-Rex 3 Pro, T-Rex Ultra, Cheetah, Cheetah Pro, Falcon, Mi Band 7

## Setup

### 1. Register a GitHub OAuth App

1. Go to [github.com/settings/developers](https://github.com/settings/developers) → **OAuth Apps** → **New OAuth App**
2. Fill in:
   - **Application name:** Git Notes
   - **Homepage URL:** `https://git-notes-auth.anhngzv.workers.dev`
   - **Authorization callback URL:** `https://git-notes-auth.anhngzv.workers.dev/callback`
   - **Enable Device Flow:** ✅
3. Copy the **Client ID** and paste it into `app-side/GitHubService.js`:
   ```js
   const GITHUB_CLIENT_ID = 'your_client_id_here'
   ```

### 2. Register the app on Zepp Developer Portal

1. Go to [developer.zepp.com](https://developer.zepp.com) and create a new app
2. Update the `appId` in `app.json` and `app.js` with your registered ID

### 3. Build & Install

```bash
# Install dependencies
npm install

# Build for your device (e.g. Balance)
npx zeus build --target balance

# Or preview directly on device via Zepp app QR scan
npx zeus preview --target balance
```

## Project Structure

```
git-notes/
├── app.js                      # App entry point
├── app.json                    # Device targets & config
├── app-side/
│   ├── index.js                # Phone companion service
│   └── GitHubService.js        # GitHub OAuth + REST API
├── setting/
│   └── index.js                # Phone settings UI
├── page/amazfit/
│   ├── FileBrowser.js          # Folder/file navigator
│   ├── NoteScreen.js           # Markdown note reader
│   └── SyncScreen.js           # Sync progress
├── lib/
│   ├── ConfigStorage.js        # Watch-side JSON storage
│   ├── markdown.js             # Markdown → plain text
│   └── zeppos/                 # Messaging infrastructure
└── worker/
    └── src/index.js            # Cloudflare Worker (OAuth callback)
```

## How It Works

```
Phone (Zepp App Settings)
  └─ Login with GitHub → Device Flow shows user_code
  └─ Enter code at github.com/login/device
  └─ Select repo (owner / name / branch)

Phone (Companion Service)
  └─ Fetches GitHub file tree via REST API
  └─ Downloads .md file contents on demand

Watch (Git Notes App)
  ├─ FileBrowser  → navigate folders from the file index
  ├─ NoteScreen   → read notes (local cache or fetch from phone)
  └─ SyncScreen   → download all notes to watch storage
```

Notes are stored locally on the watch after the first sync and can be read **completely offline**.

## Cloudflare Worker

The `worker/` directory contains a lightweight Cloudflare Worker used as the OAuth callback URL. GitHub requires a valid callback URL even for Device Flow (which never actually uses it).

```bash
cd worker
npm install
npx wrangler deploy
```

## License

MIT
