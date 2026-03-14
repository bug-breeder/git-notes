# Skill: zeppos-message

**Trigger:** Adding a new feature that needs phone-side data; adding a new phone API endpoint; fixing timeout or `unknown_action` errors.

---

## Complete Round-Trip

### Step 1 — Define the action name (pick a string constant)

```js
// Convention: snake_case verb_noun
'get_user_profile'
```

### Step 2 — Add a case to `handleWatchRequest` in `app-side/index.js`

```js
async function handleWatchRequest(ctx, req) {
  try {
    switch (req.action) {
      case 'get_file_list':
        return ctx.response({ data: await handleGetFileList(req) })

      case 'get_file':
        return ctx.response({ data: await handleGetFile(req) })

      // ADD YOUR CASE HERE:
      case 'get_user_profile':
        return ctx.response({ data: await handleGetUserProfile(req) })

      default:
        return ctx.response({ data: { error: 'unknown_action' } })
    }
  } catch (err) {
    return ctx.response({ data: { error: err.message || 'request_failed' } })
  }
}
```

### Step 3 — Write the phone-side handler

```js
async function handleGetUserProfile(req) {
  const token = settings.settingsStorage.getItem('access_token')
  if (!token) return { error: 'not_authenticated' }

  // ... do async work (fetch, etc.) ...
  return { username: 'foo', avatarUrl: '...' }
}
```

### Step 4 — Send the request from the watch

```js
// At module scope (top of page file):
const { messageBuilder } = getApp()._options.globalData

// Inside a handler or onInit:
messageBuilder.request({ action: 'get_user_profile' }, { timeout: 60000 })
  .then((resp) => {
    if (resp.error) {
      console.log('Error: ' + resp.error)
      return
    }
    // use resp.username, resp.avatarUrl, etc.
  })
```

---

## Response Shape

**Phone side** — always `ctx.response({ data: { ... } })`. The `data` key is unwrapped automatically.

```js
// Success
ctx.response({ data: { files: [...], branch: 'main' } })

// Error — use { error: string } convention
ctx.response({ data: { error: 'no_repo_selected' } })
```

**Watch side** — the payload arrives as the resolved value directly:

```js
messageBuilder.request({ action: 'get_file_list' })
  .then((resp) => {
    if (resp.error) { /* handle */ return }
    const { files, branch } = resp
  })
```

---

## settingsStorage Read (Phone Side)

```js
// Returns string or null — always JSON.parse
const raw = settings.settingsStorage.getItem('selected_repo')
const repo = raw ? JSON.parse(raw) : null
```

Known keys: `access_token`, `auth_state`, `device_code_info`, `selected_repo`, `file_extensions`, `sync_status`.

---

## 60s Timeout Warning

The messageBuilder has a hard 60-second timeout. If the phone side is doing heavy work (large repo tree fetch, many API calls), it **will** timeout. Mitigation options:
- Return early with partial data and let the watch paginate
- Write progress to `settingsStorage` and have the watch poll

---

## Canonical Reference

`app-side/index.js` — the full `handleWatchRequest` switch with `handleGetFileList` and `handleGetFile` as working examples of the complete pattern.
