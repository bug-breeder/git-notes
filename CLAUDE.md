# git-notes

ZeppOS 1.0 mini-app (Amazfit smartwatches) — fetches GitHub markdown notes to the watch.
App ID: `1107667` | Build: `npm run build` (zeus) | Preview: `npm run preview`

---

## Execution Environments

**Wrong env = silent runtime error.** These are three separate JS contexts:

| Environment | Files | Available APIs | NOT available |
|---|---|---|---|
| **WATCH** | `page/amazfit/*.js` | `hmUI`, `hmApp`, `hmFS`, `hmBle`, `hmSetting` | npm, fetch |
| **PHONE SERVICE** | `app-side/*.js` | `fetch()`, `settings.settingsStorage`, messaging | hmFS, hmUI |
| **SETTINGS UI** | `setting/index.js` | `ctx.settingsStorage`, JSX-like View/Text/Button/Input | hmFS, hmUI |

All ZeppOS globals (`hmUI`, `hmApp`, `hmFS`, `hmSetting`, `settings`, `AppSideService`, `Page`) are **injected by the runtime — never import them**.

---

## Critical Quirks

### 1. UTF-16 encoding (hmFS)
hmFS requires `Uint16Array`. Never write raw strings. Canonical pattern from `lib/ConfigStorage.js`:

```js
// Write
const str = JSON.stringify(data)
const buf = new ArrayBuffer(str.length * 2)
const view = new Uint16Array(buf)
for (let i = 0; i < str.length; i++) view[i] = str.charCodeAt(i)
const fd = hmFS.open(filename, hmFS.O_CREAT | hmFS.O_RDWR | hmFS.O_TRUNC)
hmFS.write(fd, buf, 0, buf.byteLength)
hmFS.close(fd)

// Read
const [fsStat] = hmFS.stat(filename)
const buf = new Uint8Array(fsStat.size)
const fd = hmFS.open(filename, hmFS.O_RDONLY)
hmFS.read(fd, buf.buffer, 0, fsStat.size)
hmFS.close(fd)
const u16 = new Uint16Array(buf.buffer)
let str = ''
for (let i = 0; i < u16.length; i++) str += String.fromCharCode(u16[i])
```

### 2. Global state access
`getApp()._options.globalData` is the **only** way to access `messageBuilder`/`config` from pages. Cannot be imported. Call at **module scope** (top of file), not inside class constructors:

```js
const { messageBuilder, config } = getApp()._options.globalData
```

### 3. No layout engine
All widget positions are absolute pixels. Always read screen size from:
```js
const { width, height } = hmSetting.getDeviceInfo()
```
Never hardcode. Known sizes: Band7 = 192×490, Balance = 480×480.

### 4. Scroll requires two calls
```js
hmUI.setLayerScrolling(true)
hmUI.setLayerScrollingHeight(totalHeight)
```
Current pages use a `h: 9999` background FILL_RECT as a workaround for dynamic content.

### 5. Tap events — TEXT cannot receive taps
Layer a transparent FILL_RECT on top and attach the listener to it:
```js
const tap = hmUI.createWidget(hmUI.widget.FILL_RECT, {
  x: 0, y: rowY, w: SCREEN_WIDTH, h: ROW_HEIGHT,
  color: 0x00000000, alpha: 0,
})
tap.addEventListener(hmUI.event.CLICK_UP, handler)
```

### 6. messageBuilder timeout
60 seconds. Phone side **must** call `ctx.response({ data: {...} })` or the watch hangs indefinitely. Large fetches (big repos) can hit this limit.

### 7. settingsStorage bridge
App-side and settings UI share no memory. The only bridge is `settings.settingsStorage`.

Key inventory:

| Key | Type | Description |
|---|---|---|
| `access_token` | string | GitHub OAuth token |
| `auth_state` | JSON | `{ state: 'unauthenticated' \| 'pending' \| 'waiting_user' \| 'authenticated' \| 'error', username?, message? }` |
| `device_code_info` | JSON | `{ userCode, verificationUri, expiresIn }` |
| `selected_repo` | JSON | `{ owner, name, branch }` |
| `file_extensions` | JSON | array of extensions, default `['.md','.markdown','.txt']` |
| `sync_status` | JSON | `{ state: 'idle' \| 'syncing' \| 'done' \| 'error' }` |

Always `JSON.parse(settings.settingsStorage.getItem('key'))` — returns string or null.

---

## File Map

| File | Role |
|---|---|
| `app.js` | App entry; `globalData: { messageBuilder, config }` |
| `app-side/index.js` | Phone service; watch request router + OAuth polling |
| `app-side/GitHubService.js` | Device Flow + GitHub REST API (Client ID line 16) |
| `setting/index.js` | Phone settings UI (login, repo select, filter) |
| `page/amazfit/FileBrowser.js` | Watch: folder tree navigation |
| `page/amazfit/NoteScreen.js` | Watch: markdown reader; exports `writeNoteFile()` |
| `page/amazfit/SyncScreen.js` | Watch: sync trigger + progress |
| `lib/ConfigStorage.js` | Watch JSON store via hmFS (UTF-16) |
| `lib/markdown.js` | Markdown → `{ text, bold, indent }[]` |
| `lib/zeppos/message.js` | MessageBuilder protocol — do not edit |
| `worker/src/index.js` | Cloudflare Worker — OAuth callback URL only |

---

## Auth Flow

Settings UI writes `auth_trigger` → app-side calls Device Flow API → writes `device_code_info` + `auth_state: waiting_user` → settings UI shows `userCode` + URL → app-side polls for token → writes `access_token` + `auth_state: authenticated`

## Sync Flow

SyncScreen sends `get_file_list` → app-side fetches GitHub tree → returns `{ files, branch }` → watch loops: sends `get_file` per file → app-side fetches base64 content → watch calls `writeNoteFile()` → stores UTF-16 `.txt` → updates `config.fileIndex`

---

## Reference Resources

| Resource | Path |
|---|---|
| ZeppOS device API | `../zeppos-docs/docs/reference/device-app-api/newAPI/` (subdirs: `fs/`, `ui/widget/`, `router/`, `app/`) |
| Settings API | `../zeppos-docs/docs/reference/app-settings-api/` |
| Side service API | `../zeppos-docs/docs/reference/side-service-api/` |
| Sample apps (v1.0) | `../zeppos-samples/application/1.0/` |
| Reference app | `../ZeppOS-Tasks/` (identical lib/zeppos + ConfigStorage patterns) |
