/**
 * GitHub service for the phone-side companion app.
 *
 * Handles:
 *  - OAuth Device Flow authentication
 *  - Repository listing and selection
 *  - Fetching the file tree (markdown files only)
 *  - Fetching individual file content
 *
 * Setup: Create a GitHub OAuth App at https://github.com/settings/developers
 *   - Set Application type: public (no client secret needed for Device Flow)
 *   - Enable Device Flow in the app settings
 *   - Paste your Client ID below
 */

const GITHUB_CLIENT_ID = 'Ov23likjkY6lcNZqwClE'
const API_BASE = 'https://api.github.com'
const DEVICE_CODE_URL = 'https://github.com/login/device/code'
const TOKEN_URL = 'https://github.com/login/oauth/access_token'

// Only download files with these extensions by default
const DEFAULT_EXTENSIONS = ['.md', '.markdown', '.txt']

// Maximum file size to download (bytes). Skip larger files.
const MAX_FILE_SIZE = 100 * 1024 // 100 KB

export class GitHubService {
  constructor() {
    this.token = null
    this._pollTimer = null
  }

  setToken(token) {
    this.token = token
  }

  // ─── OAuth Device Flow ────────────────────────────────────────────────────

  /**
   * Step 1: Request a device code from GitHub.
   * Returns { device_code, user_code, verification_uri, expires_in, interval }
   */
  async startDeviceFlow() {
    const resp = await this._rawFetch(DEVICE_CODE_URL, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        scope: 'repo',
      }),
    })

    if (resp.status < 200 || resp.status >= 300) {
      throw new Error('device_code request failed: ' + resp.status)
    }

    return typeof resp.body === 'string' ? JSON.parse(resp.body) : resp.body
  }

  /**
   * Step 2: Poll GitHub until the user completes authorization.
   * Calls onProgress({ user_code, verification_uri }) and resolves with access_token.
   * Returns the access token string on success, or throws on error/expiry.
   */
  async pollForToken(deviceCode, interval, onTokenReady) {
    return new Promise((resolve, reject) => {
      const check = async () => {
        try {
          const resp = await this._rawFetch(TOKEN_URL, {
            method: 'POST',
            headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              client_id: GITHUB_CLIENT_ID,
              device_code: deviceCode,
              grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
            }),
          })

          const data = typeof resp.body === 'string' ? JSON.parse(resp.body) : resp.body

          if (data.access_token) {
            this.token = data.access_token
            if (onTokenReady) onTokenReady(data.access_token)
            resolve(data.access_token)
            return
          }

          if (data.error === 'authorization_pending') {
            // Still waiting — schedule next poll
            this._pollTimer = setTimeout(check, interval * 1000)
            return
          }

          if (data.error === 'slow_down') {
            interval += 5
            this._pollTimer = setTimeout(check, interval * 1000)
            return
          }

          reject(new Error(data.error || 'OAuth polling failed'))
        } catch (e) {
          reject(e)
        }
      }

      this._pollTimer = setTimeout(check, interval * 1000)
    })
  }

  stopPolling() {
    if (this._pollTimer) {
      clearTimeout(this._pollTimer)
      this._pollTimer = null
    }
  }

  // ─── User & Repos ─────────────────────────────────────────────────────────

  async getUser() {
    return this._apiGet('/user')
  }

  async listRepos(page = 1) {
    return this._apiGet('/user/repos', {
      sort: 'updated',
      per_page: 50,
      page,
    })
  }

  // ─── File Tree ────────────────────────────────────────────────────────────

  /**
   * Fetch the full recursive file tree for a repo.
   * Returns only nodes matching allowed extensions (default: .md/.markdown/.txt).
   * Each item: { path, name, type, sha, size }
   */
  async getFileTree(owner, repo, branch = 'main', extensions = DEFAULT_EXTENSIONS) {
    // Get the branch ref to find tree SHA
    let ref
    try {
      ref = await this._apiGet(`/repos/${owner}/${repo}/branches/${branch}`)
    } catch (e) {
      // Fallback: try 'master'
      if (branch === 'main') {
        ref = await this._apiGet(`/repos/${owner}/${repo}/branches/master`)
        branch = 'master'
      } else {
        throw e
      }
    }

    const treeSha = ref.commit.commit.tree.sha
    const treeResp = await this._apiGet(
      `/repos/${owner}/${repo}/git/trees/${treeSha}`,
      { recursive: '1' }
    )

    if (treeResp.truncated) {
      console.log('Warning: tree was truncated by GitHub API')
    }

    // Filter to allowed file types only, skip large files
    const nodes = (treeResp.tree || [])
      .filter(node => {
        if (node.type === 'tree') return true // keep directories
        const lower = node.path.toLowerCase()
        const allowed = extensions.some(ext => lower.endsWith(ext))
        return allowed && (node.size || 0) <= MAX_FILE_SIZE
      })
      .map(node => ({
        path: node.path,
        name: node.path.split('/').pop(),
        type: node.type === 'tree' ? 'dir' : 'file',
        sha: node.sha,
        size: node.size || 0,
      }))

    return { branch, nodes }
  }

  /**
   * Fetch the text content of a single file.
   * GitHub returns base64-encoded content; this decodes it.
   */
  async getFileContent(owner, repo, filePath, branch) {
    const data = await this._apiGet(`/repos/${owner}/${repo}/contents/${filePath}`, {
      ref: branch,
    })

    if (data.encoding === 'base64') {
      return this._decodeBase64(data.content.replace(/\n/g, ''))
    }

    return data.content || ''
  }

  // ─── HTTP helpers ─────────────────────────────────────────────────────────

  async _apiGet(path, query = {}) {
    const url = this._buildUrl(API_BASE + path, query)
    const resp = await this._rawFetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${this.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    })

    const body = typeof resp.body === 'string' ? JSON.parse(resp.body) : resp.body
    if (resp.status < 200 || resp.status >= 300) {
      throw new Error(`GitHub API ${path} → ${resp.status}: ${body.message || ''}`)
    }
    return body
  }

  async _rawFetch(url, options) {
    return fetch({ url, ...options })
  }

  _buildUrl(base, params) {
    const entries = Object.entries(params).filter(([, v]) => v !== undefined)
    if (!entries.length) return base
    const qs = entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')
    return base + '?' + qs
  }

  _decodeBase64(b64) {
    // ZeppOS phone-side has atob available
    try {
      return decodeURIComponent(
        atob(b64)
          .split('')
          .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      )
    } catch (e) {
      // Fallback: return raw if UTF-8 decode fails
      return atob(b64)
    }
  }
}
