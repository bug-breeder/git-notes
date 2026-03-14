# Skill: zeppos-widget

**Trigger:** Adding buttons, text, lists, progress bars, icons, or any visual element to a watch screen; making something tappable or scrollable.

---

## Three-Layer Widget Pattern

Every interactive row uses three layers in this order:

1. **Background FILL_RECT** — visible color/styling
2. **Content widget(s)** — TEXT, IMG, etc. (cannot receive taps)
3. **Transparent tap FILL_RECT** — captures touch events

```js
// 1. Background
hmUI.createWidget(hmUI.widget.FILL_RECT, {
  x: 0, y: rowY, w: SCREEN_WIDTH, h: ROW_HEIGHT,
  color: BG_COLOR,
})

// 2. Content
hmUI.createWidget(hmUI.widget.TEXT, {
  x: 16, y: rowY + 8, w: SCREEN_WIDTH - 32, h: 24,
  text: label,
  text_size: 18,
  color: 0xC9D1D9,
  align_h: hmUI.align.LEFT,
})

// 3. Transparent tap target (alpha:0 makes it invisible but tappable)
const tap = hmUI.createWidget(hmUI.widget.FILL_RECT, {
  x: 0, y: rowY, w: SCREEN_WIDTH, h: ROW_HEIGHT,
  color: 0x00000000, alpha: 0,
})
tap.addEventListener(hmUI.event.CLICK_DOWN, () => {})  // suppress default
tap.addEventListener(hmUI.event.CLICK_UP, onTap)
```

**Why CLICK_DOWN no-op:** prevents scroll interference on some devices.

---

## Screen Dimensions

Always read at module scope — never hardcode:

```js
const SCREEN_WIDTH = hmSetting.getDeviceInfo().width || 480
const SCREEN_HEIGHT = hmSetting.getDeviceInfo().height || 480
```

Known sizes: Band7 = 192×490, Balance/Balance2 = 480×480.

---

## Updating a Widget After Creation

```js
const label = hmUI.createWidget(hmUI.widget.TEXT, { ... })
// Later:
label.setProperty(hmUI.prop.TEXT, 'new value')
label.setProperty(hmUI.prop.COLOR, 0xFF0000)
```

---

## posY Accumulator Pattern (Scrollable Lists)

From `page/amazfit/FileBrowser.js` — the canonical pattern for dynamic lists:

```js
class MyScreen {
  constructor() {
    this.posY = 0
  }

  init() {
    // Full-height background enables scroll past screen edge
    hmUI.createWidget(hmUI.widget.FILL_RECT, {
      x: 0, y: 0, w: SCREEN_WIDTH, h: 9999, color: BG_COLOR,
    })
    hmUI.setLayerScrolling(true)

    for (const item of items) {
      this._addRow(item)
    }

    // After all rows, set total scrollable height
    hmUI.setLayerScrollingHeight(this.posY)
  }

  _addRow({ label, onTap }) {
    const y = this.posY
    const ROW_HEIGHT = 72

    // background
    hmUI.createWidget(hmUI.widget.FILL_RECT, { x:0, y, w:SCREEN_WIDTH, h:ROW_HEIGHT, color:BG_COLOR })
    // content
    hmUI.createWidget(hmUI.widget.TEXT, { x:16, y:y+24, w:SCREEN_WIDTH-32, h:24, text:label, text_size:18, color:0xC9D1D9 })
    // tap
    const tap = hmUI.createWidget(hmUI.widget.FILL_RECT, { x:0, y, w:SCREEN_WIDTH, h:ROW_HEIGHT, color:0x00000000, alpha:0 })
    tap.addEventListener(hmUI.event.CLICK_DOWN, () => {})
    tap.addEventListener(hmUI.event.CLICK_UP, onTap)

    this.posY += ROW_HEIGHT
  }
}
```

---

## Scroll Setup

Two calls required — `setLayerScrollingHeight` must be called **after** all widgets are created:

```js
hmUI.setLayerScrolling(true)
hmUI.setLayerScrollingHeight(totalContentHeight)
```

The `h: 9999` background rect is the current workaround when total height isn't known upfront.

---

## Canonical Reference

`page/amazfit/FileBrowser.js` — `_addRow()` and `_addSyncButton()` show the complete pattern including separator lines, icon glyphs, and rounded-corner buttons.
