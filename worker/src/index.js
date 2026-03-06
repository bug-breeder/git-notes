/**
 * git-notes Cloudflare Worker
 *
 * Serves as the GitHub OAuth callback URL.
 *
 * For Device Flow (what the Zepp app uses), GitHub requires a callback URL
 * to be registered but never actually calls it during auth. This worker
 * handles it gracefully if it ever is hit, and also works as a homepage.
 *
 * Routes:
 *   GET /           → App info page
 *   GET /callback   → OAuth callback (shows success or error page)
 *
 * Deploy:
 *   cd worker
 *   npx wrangler deploy
 *
 * After deploy, use the worker URL as the callback:
 *   https://git-notes-auth.<your-subdomain>.workers.dev/callback
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    if (url.pathname === '/callback') {
      return handleCallback(url, env)
    }

    return handleHome(env)
  },
}

// ─── OAuth Callback ───────────────────────────────────────────────────────────

async function handleCallback(url, env) {
  const code = url.searchParams.get('code')
  const error = url.searchParams.get('error')
  const errorDescription = url.searchParams.get('error_description')

  if (error) {
    return htmlResponse(errorPage(error, errorDescription))
  }

  if (!code) {
    // Device Flow never sends a code here — show a helpful message
    return htmlResponse(deviceFlowPage())
  }

  // If a code is present (web flow), we could exchange it for a token here.
  // This requires GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET to be set as Worker secrets.
  // For the ZeppOS app's Device Flow, this path is never reached.
  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
    return htmlResponse(successPage('Authorization received. Return to your Zepp app.'))
  }

  try {
    const tokenResp = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: env.GITHUB_CLIENT_ID,
        client_secret: env.GITHUB_CLIENT_SECRET,
        code,
      }),
    })

    const data = await tokenResp.json()

    if (data.access_token) {
      return htmlResponse(successPage('GitHub authorization complete! You can close this tab.'))
    }

    return htmlResponse(errorPage(data.error || 'exchange_failed', data.error_description))
  } catch (e) {
    return htmlResponse(errorPage('network_error', e.message))
  }
}

// ─── Home page ────────────────────────────────────────────────────────────────

function handleHome(env) {
  return htmlResponse(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Git Notes</title>
  ${cssBlock()}
</head>
<body>
  <div class="card">
    <div class="icon">📒</div>
    <h1>Git Notes</h1>
    <p class="subtitle">GitHub markdown notes on your Amazfit smartwatch</p>
    <div class="divider"></div>
    <p>Install the <strong>Git Notes</strong> mini-app on your watch via the Zepp app, then connect your GitHub account to browse your markdown notes right on your wrist — offline.</p>
    <div class="features">
      <div class="feature">🔒 Secure Device Flow login</div>
      <div class="feature">📁 Folder navigation</div>
      <div class="feature">📴 Read offline</div>
      <div class="feature">⟳ One-tap sync</div>
    </div>
  </div>
</body>
</html>
`)
}

// ─── HTML templates ───────────────────────────────────────────────────────────

function successPage(message) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Git Notes — Authorized</title>
  ${cssBlock()}
</head>
<body>
  <div class="card">
    <div class="icon">✅</div>
    <h1>Authorization complete</h1>
    <p>${escHtml(message)}</p>
  </div>
</body>
</html>`
}

function deviceFlowPage() {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Git Notes — Device Flow</title>
  ${cssBlock()}
</head>
<body>
  <div class="card">
    <div class="icon">📒</div>
    <h1>Git Notes</h1>
    <p>This app uses <strong>GitHub Device Flow</strong> for authorization.</p>
    <p>To sign in, open the <strong>Zepp app</strong> on your phone, go to <em>Git Notes → Settings</em>, and tap <strong>Login with GitHub</strong>. You'll receive a short code to enter at <a href="https://github.com/login/device">github.com/login/device</a>.</p>
    <p class="muted">No redirect is needed — this page is just the registered callback URL.</p>
  </div>
</body>
</html>`
}

function errorPage(error, description) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Git Notes — Error</title>
  ${cssBlock()}
</head>
<body>
  <div class="card">
    <div class="icon">❌</div>
    <h1>Authorization error</h1>
    <p class="error">${escHtml(error)}</p>
    ${description ? `<p class="muted">${escHtml(description)}</p>` : ''}
    <p>Please return to the Zepp app and try again.</p>
  </div>
</body>
</html>`
}

function cssBlock() {
  return `<style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #0d1117;
      color: #c9d1d9;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .card {
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 12px;
      padding: 40px 32px;
      max-width: 480px;
      width: 100%;
      text-align: center;
    }
    .icon { font-size: 48px; margin-bottom: 16px; }
    h1 { font-size: 24px; color: #e6edf3; margin-bottom: 12px; }
    .subtitle { color: #8b949e; margin-bottom: 20px; }
    p { font-size: 15px; line-height: 1.6; margin-bottom: 12px; color: #c9d1d9; }
    a { color: #58a6ff; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .divider { border-top: 1px solid #30363d; margin: 20px 0; }
    .features { display: flex; flex-direction: column; gap: 8px; margin-top: 16px; text-align: left; }
    .feature { padding: 10px 16px; background: #0d1117; border-radius: 8px; font-size: 14px; }
    .error { color: #f85149; font-weight: bold; }
    .muted { color: #8b949e; font-size: 13px; }
    strong { color: #e6edf3; }
    em { color: #79c0ff; font-style: normal; }
  </style>`
}

function htmlResponse(html) {
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
