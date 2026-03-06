import { MessageBuilder } from '../lib/zeppos/message'
import { GitHubService } from './GitHubService'

const messageBuilder = new MessageBuilder()
const github = new GitHubService()

AppSideService({
  onInit() {
    // Restore saved token if available
    const saved = settings.settingsStorage.getItem('access_token')
    if (saved) github.setToken(saved)

    // Listen for settings changes triggered by the phone Settings UI
    settings.settingsStorage.addListener('change', async (e) => {
      await handleSettingsChange(e)
    })

    // Listen for requests from the watch
    messageBuilder.listen(() => {})
    messageBuilder.on('request', async (ctx) => {
      const req = messageBuilder.buf2Json(ctx.request.payload)
      await handleWatchRequest(ctx, req)
    })
  },

  onRun() {},
  onDestroy() {},
})

// ─── Settings change handler (triggered by phone UI) ─────────────────────────

async function handleSettingsChange(e) {
  switch (e.key) {
    case 'auth_trigger':
      // Phone UI requested Device Flow login
      await startDeviceFlow()
      break

    case 'auth_cancel':
      github.stopPolling()
      break

    case 'selected_repo':
      // Repo selection changed — clear old file index on watch
      settings.settingsStorage.setItem('sync_status', JSON.stringify({ state: 'idle' }))
      break
  }
}

// ─── Device Flow OAuth ────────────────────────────────────────────────────────

async function startDeviceFlow() {
  try {
    settings.settingsStorage.setItem('auth_state', JSON.stringify({ state: 'pending' }))

    const deviceInfo = await github.startDeviceFlow()

    // Surface the user code to the Settings UI
    settings.settingsStorage.setItem('device_code_info', JSON.stringify({
      userCode: deviceInfo.user_code,
      verificationUri: deviceInfo.verification_uri,
      expiresIn: deviceInfo.expires_in,
    }))

    settings.settingsStorage.setItem('auth_state', JSON.stringify({ state: 'waiting_user' }))

    // Start polling in background
    const token = await github.pollForToken(
      deviceInfo.device_code,
      deviceInfo.interval || 5,
      (token) => {
        settings.settingsStorage.setItem('access_token', token)
      }
    )

    // Fetch user info to confirm and show username
    github.setToken(token)
    const user = await github.getUser()
    settings.settingsStorage.setItem('auth_state', JSON.stringify({
      state: 'authenticated',
      username: user.login,
      avatarUrl: user.avatar_url,
    }))
  } catch (err) {
    settings.settingsStorage.setItem('auth_state', JSON.stringify({
      state: 'error',
      message: err.message || 'Authentication failed',
    }))
  }
}

// ─── Watch request handler ────────────────────────────────────────────────────

async function handleWatchRequest(ctx, req) {
  try {
    switch (req.action) {
      case 'get_status':
        return ctx.response({ data: await handleGetStatus() })

      case 'get_file_list':
        return ctx.response({ data: await handleGetFileList(req) })

      case 'get_file':
        return ctx.response({ data: await handleGetFile(req) })

      default:
        return ctx.response({ data: { error: 'unknown_action' } })
    }
  } catch (err) {
    return ctx.response({ data: { error: err.message || 'request_failed' } })
  }
}

async function handleGetStatus() {
  const authStateRaw = settings.settingsStorage.getItem('auth_state')
  const authState = authStateRaw ? JSON.parse(authStateRaw) : { state: 'unauthenticated' }

  const repoRaw = settings.settingsStorage.getItem('selected_repo')
  const repo = repoRaw ? JSON.parse(repoRaw) : null

  const syncStatusRaw = settings.settingsStorage.getItem('sync_status')
  const syncStatus = syncStatusRaw ? JSON.parse(syncStatusRaw) : { state: 'idle' }

  return {
    auth: authState,
    repo,
    syncStatus,
  }
}

async function handleGetFileList(req) {
  const token = settings.settingsStorage.getItem('access_token')
  if (!token) return { error: 'not_authenticated' }

  github.setToken(token)

  const repoRaw = settings.settingsStorage.getItem('selected_repo')
  if (!repoRaw) return { error: 'no_repo_selected' }

  const repo = JSON.parse(repoRaw)
  const { owner, name, branch } = repo

  const extensions = getExtensions()
  const { branch: resolvedBranch, nodes } = await github.getFileTree(owner, name, branch || 'main', extensions)

  // Update resolved branch
  settings.settingsStorage.setItem('selected_repo', JSON.stringify({ ...repo, branch: resolvedBranch }))

  return { files: nodes, branch: resolvedBranch }
}

async function handleGetFile(req) {
  const token = settings.settingsStorage.getItem('access_token')
  if (!token) return { error: 'not_authenticated' }

  github.setToken(token)

  const repoRaw = settings.settingsStorage.getItem('selected_repo')
  if (!repoRaw) return { error: 'no_repo_selected' }

  const repo = JSON.parse(repoRaw)
  const content = await github.getFileContent(repo.owner, repo.name, req.path, repo.branch)

  return { path: req.path, content }
}

function getExtensions() {
  const raw = settings.settingsStorage.getItem('file_extensions')
  if (raw) {
    try {
      return JSON.parse(raw)
    } catch (e) {}
  }
  return ['.md', '.markdown', '.txt']
}
