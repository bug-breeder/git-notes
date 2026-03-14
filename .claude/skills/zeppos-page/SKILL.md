# Skill: zeppos-page

**Trigger:** Adding a new screen, view, or UI page to the watch app.

---

## Checklist (do all 4 steps or the page will crash/not load)

### 1. Create `page/amazfit/NewScreen.js`

Use the class-in-Page pattern (matches all 3 existing pages):

```js
// page/amazfit/NewScreen.js

// IMPORTANT: call at module scope, NOT inside the class constructor
const { messageBuilder, config } = getApp()._options.globalData

const SCREEN_WIDTH = hmSetting.getDeviceInfo().width || 480

class NewScreen {
  constructor(paramsStr) {
    try {
      const p = JSON.parse(paramsStr || '{}')
      this.myParam = p.myParam || ''
    } catch (e) {
      this.myParam = ''
    }
  }

  init() {
    hmUI.setStatusBarVisible(true)
    hmUI.updateStatusBarTitle('My Screen')
    hmApp.setScreenKeep(true)

    // build UI here
    hmUI.createWidget(hmUI.widget.TEXT, {
      x: 0, y: 100, w: SCREEN_WIDTH, h: 40,
      text: 'Hello ' + this.myParam,
      text_size: 20,
      color: 0xC9D1D9,
      align_h: hmUI.align.CENTER_H,
    })
  }
}

Page({
  onInit(params) {
    try {
      new NewScreen(params).init()
    } catch (e) {
      console.log('NewScreen error: ' + e)
    }
  },

  onDestroy() {
    hmApp.setScreenKeep(false)
  },
})
```

### 2. Register in app.json — ALL 24 targets

**This is the most common mistake.** Every target's `module.page.pages` array must include the new page path. There are **24 targets** in `app.json`:

`mi_band7`, `balance`, `balance2`, `active`, `active_2`, `active_2_square`, `bip5`, `bip5unity`, `bip6`, `active_edge`, `gts4mini`, `band7`, `gtr_mini`, `gtr3`, `gtr3pro`, `gtr4`, `gts3`, `gts4`, `trex2`, `trex3`, `trex_ultra`, `cheetah`, `cheetah_pro`, `falcon`

Add to **every** `pages` array:
```json
"pages": [
  "page/amazfit/FileBrowser",
  "page/amazfit/NoteScreen",
  "page/amazfit/SyncScreen",
  "page/amazfit/NewScreen"
]
```

If you miss even one target the app fails silently on that device class.

### 3. Navigate to the page

```js
// Go to new page
hmApp.gotoPage({
  url: 'page/amazfit/NewScreen',
  param: JSON.stringify({ myParam: 'hello' }),
})

// Go back
hmApp.goBack()

// Reload current page with new params
hmApp.reloadPage({
  url: 'page/amazfit/NewScreen',
  param: JSON.stringify({ myParam: 'updated' }),
})
```

### 4. Parse params in onInit

```js
// In the class constructor:
constructor(paramsStr) {
  try {
    const p = JSON.parse(paramsStr || '{}')
    this.value = p.value || defaultValue
  } catch (e) {
    this.value = defaultValue
  }
}
```

---

## getApp() Call Location

**Must be at module scope** — the ZeppOS runtime binds `getApp()` before the module executes, but it may not be available inside deferred callbacks or class constructors that run later:

```js
// CORRECT — module scope
const { messageBuilder, config } = getApp()._options.globalData

class MyScreen { ... }

// WRONG — inside constructor
class MyScreen {
  constructor() {
    const { messageBuilder } = getApp()._options.globalData  // may fail
  }
}
```

---

## Page Lifecycle

```
onInit(params)   → constructor + init() — build all widgets here
onDestroy()      → cleanup (setScreenKeep(false), cancel timers)
```

There is no `onResume`/`onPause` in ZeppOS 1.0. If you need to refresh on return, use `hmApp.reloadPage`.

---

## Canonical Reference

`page/amazfit/FileBrowser.js`, `page/amazfit/NoteScreen.js`, `page/amazfit/SyncScreen.js` — all three follow the identical class-in-Page pattern.
